/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';
import { apiPrivileges } from '../../common/features';
import { internalApiPath } from '../../common/constants';
import { createTraceStorage } from '../tracing/trace_index_manager';

/**
 * Registers internal API routes for querying trace data collected
 * by the AgentBuilderESSpanProcessor from the .chat-traces system index.
 *
 * Each document is a complete trace (one conversation round) containing
 * pre-computed summaries and the full span tree.
 *
 * - GET /internal/agent_builder/agents/{agent_id}/traces
 *   Lists traces for a given agent, filtered by space.
 *
 * - GET /internal/agent_builder/traces/{trace_id}
 *   Returns a single trace document by trace_id.
 */
export function registerTracesRoutes({ router, coreSetup, logger }: RouteDependencies) {
  const wrapHandler = getHandlerWrapper({ logger });

  // List traces for an agent
  router.versioned
    .get({
      path: `${internalApiPath}/agents/{agent_id}/traces`,
      security: {
        authz: { requiredPrivileges: [apiPrivileges.readAgentBuilder] },
      },
      access: 'internal',
      summary: 'List traces for an agent',
      options: {
        tags: ['traces', 'oas-tag:agent builder'],
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({
              agent_id: schema.string(),
            }),
            query: schema.object({
              size: schema.number({ defaultValue: 20, min: 1, max: 100 }),
              from: schema.number({ defaultValue: 0, min: 0 }),
              conversation_id: schema.maybe(schema.string()),
            }),
          },
        },
      },
      wrapHandler(async (ctx, request, response) => {
        const [coreStart] = await coreSetup.getStartServices();
        const esClient = coreStart.elasticsearch.client.asInternalUser;
        const spaceId = (await ctx.agentBuilder).spaces.getSpaceId();

        const storageClient = createTraceStorage({ esClient, logger }).getClient();

        const { agent_id: agentId } = request.params;
        const { size, from, conversation_id: conversationId } = request.query;

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
          // Exclude the spans array from list results for smaller payloads
          _source: {
            excludes: ['spans'],
          },
          query: { bool: { filter: filters } },
          sort: [{ '@timestamp': { order: 'desc' } }],
        });

        const traces = result.hits.hits.map((hit) => ({
          _id: hit._id,
          ...(hit._source as unknown as Record<string, unknown>),
        }));

        return response.ok({
          body: {
            total:
              typeof result.hits.total === 'number'
                ? result.hits.total
                : result.hits.total?.value ?? 0,
            results: traces,
          },
        });
      })
    );

  // Get a single trace by trace_id (includes full span tree)
  router.versioned
    .get({
      path: `${internalApiPath}/traces/{trace_id}`,
      security: {
        authz: { requiredPrivileges: [apiPrivileges.readAgentBuilder] },
      },
      access: 'internal',
      summary: 'Get a trace by trace_id',
      options: {
        tags: ['traces', 'oas-tag:agent builder'],
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({
              trace_id: schema.string(),
            }),
          },
        },
      },
      wrapHandler(async (ctx, request, response) => {
        const [coreStart] = await coreSetup.getStartServices();
        const esClient = coreStart.elasticsearch.client.asInternalUser;
        const spaceId = (await ctx.agentBuilder).spaces.getSpaceId();

        const storageClient = createTraceStorage({ esClient, logger }).getClient();

        const { trace_id: traceId } = request.params;

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
          return response.notFound({ body: { message: `Trace [${traceId}] not found` } });
        }

        return response.ok({
          body: {
            _id: hit._id,
            ...(hit._source as unknown as Record<string, unknown>),
          },
        });
      })
    );
}
