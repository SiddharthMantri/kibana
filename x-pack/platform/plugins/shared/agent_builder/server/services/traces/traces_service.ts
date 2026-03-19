/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, ElasticsearchServiceStart } from '@kbn/core/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { Logger } from '@kbn/logging';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { createTraceStorage } from '../../tracing/trace_index_manager';
import { getCurrentSpaceId } from '../../utils/spaces';

interface TracesListRequestQuery {
  size: number;
  from: number;
  conversation_id?: string;
}

export interface TracesListResponseBody {
  total: number;
  results: Array<Record<string, unknown>>;
}

export interface TracesClient {
  listTraces(): Promise<TracesListResponseBody>;
  getTraceById(): Promise<Record<string, unknown> | undefined>;
}

export interface TracesServiceStart {
  getScopedClient(options: { request: KibanaRequest }): TracesClient;
}

export interface TracesService {
  setup(): void;
  start(deps: TracesServiceStartDeps): TracesServiceStart;
}

interface TracesServiceStartDeps {
  elasticsearch: ElasticsearchServiceStart;
  spaces?: SpacesPluginStart;
  logger: Logger;
}

export const createTracesService = (): TracesService => {
  return new TracesServiceImpl();
};

class TracesServiceImpl implements TracesService {
  private startDeps?: TracesServiceStartDeps;

  setup(): void {}

  start(deps: TracesServiceStartDeps): TracesServiceStart {
    this.startDeps = deps;

    return {
      getScopedClient: (options) => this.getScopedClient(options),
    };
  }

  private getStartDeps(): TracesServiceStartDeps {
    if (!this.startDeps) {
      throw new Error('TracesService#start has not been called');
    }

    return this.startDeps;
  }

  private getScopedClient({ request }: { request: KibanaRequest }): TracesClient {
    const { elasticsearch, spaces, logger } = this.getStartDeps();
    const esClient = elasticsearch.client.asScoped(request).asInternalUser;
    const spaceId = getCurrentSpaceId({ request, spaces });
    const storageClient = createTraceStorage({ esClient, logger }).getClient();

    return {
      async listTraces(): Promise<TracesListResponseBody> {
        const { agent_id: agentId } = request.params as { agent_id: string };
        const {
          size,
          from,
          conversation_id: conversationId,
        } = request.query as TracesListRequestQuery;

        const filters: QueryDslQueryContainer[] = [
          { term: { agent_id: agentId } },
          { term: { space_id: spaceId } },
        ];

        if (conversationId) {
          filters.push({ term: { conversation_id: conversationId } });
        }

        const result = await storageClient.search({
          track_total_hits: true,
          size,
          from,
          _source: {
            excludes: ['spans'],
          },
          query: { bool: { filter: filters } },
          sort: [{ '@timestamp': { order: 'desc' } }],
        });

        return {
          total:
            typeof result.hits.total === 'number'
              ? result.hits.total
              : result.hits.total?.value ?? 0,
          results: result.hits.hits.map((hit) => ({
            _id: hit._id,
            ...(hit._source as unknown as Record<string, unknown>),
          })),
        };
      },

      async getTraceById(): Promise<Record<string, unknown> | undefined> {
        const { trace_id: traceId } = request.params as { trace_id: string };

        const result = await storageClient.search({
          track_total_hits: false,
          size: 1,
          query: {
            bool: {
              filter: [{ term: { trace_id: traceId } }, { term: { space_id: spaceId } }],
            },
          },
        });

        const hit = result.hits.hits[0];
        if (!hit) {
          return undefined;
        }

        return {
          _id: hit._id,
          ...(hit._source as unknown as Record<string, unknown>),
        };
      },
    };
  }
}
