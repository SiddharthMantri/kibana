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
import { TRACE_DATA_STREAM_NAME } from '../tracing/trace_index_manager';

/**
 * Registers internal API routes for querying trace data collected
 * by the AgentBuilderESSpanProcessor from the .chat-traces data stream.
 *
 * - GET /internal/agent_builder/agents/{agent_id}/traces
 *   Lists root-level traces for a given agent, filtered by space.
 *
 * - GET /internal/agent_builder/traces/{trace_id}
 *   Returns all spans belonging to a single trace with summary stats.
 */
export function registerTracesRoutes({ router, coreSetup, logger }: RouteDependencies) {
  const wrapHandler = getHandlerWrapper({ logger });

  // List traces for an agent (root spans only)
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

        const { agent_id: agentId } = request.params;
        const { size, from, conversation_id: conversationId } = request.query;

        const filters: QueryDslQueryContainer[] = [
          { term: { agent_id: agentId } },
          { term: { space_id: spaceId } },
          // Root spans only (Converse spans have no parent in the inference tree)
          { bool: { must_not: { exists: { field: 'parent_span_id' } } } },
        ];

        if (conversationId) {
          filters.push({ term: { conversation_id: conversationId } });
        }

        const result = await esClient.search({
          index: TRACE_DATA_STREAM_NAME,
          body: {
            query: { bool: { filter: filters } },
            sort: [{ '@timestamp': { order: 'desc' } }],
            size,
            from,
          },
        });

        const traces = result.hits.hits.map((hit) => ({
          _id: hit._id,
          ...(hit._source as Record<string, unknown>),
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

  // Get all spans for a specific trace
  router.versioned
    .get({
      path: `${internalApiPath}/traces/{trace_id}`,
      security: {
        authz: { requiredPrivileges: [apiPrivileges.readAgentBuilder] },
      },
      access: 'internal',
      summary: 'Get all spans for a trace',
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

        const { trace_id: traceId } = request.params;

        const result = await esClient.search({
          index: TRACE_DATA_STREAM_NAME,
          body: {
            query: {
              bool: {
                filter: [{ term: { trace_id: traceId } }, { term: { space_id: spaceId } }],
              },
            },
            sort: [{ '@timestamp': { order: 'asc' } }],
            size: 500,
          },
        });

        const spans = result.hits.hits.map((hit) => ({
          _id: hit._id,
          ...(hit._source as Record<string, unknown>),
        }));

        // Compute aggregated summary from the span tree
        const rootSpan = spans.find((s) => !(s as Record<string, unknown>).parent_span_id) as
          | Record<string, unknown>
          | undefined;
        const totalDurationMs = rootSpan?.duration_ms ?? 0;

        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let hasError = false;

        for (const span of spans) {
          const s = span as Record<string, unknown>;
          const genAi = s.gen_ai as Record<string, unknown> | undefined;
          if (genAi) {
            totalInputTokens += Number(genAi.usage_input_tokens ?? 0);
            totalOutputTokens += Number(genAi.usage_output_tokens ?? 0);
          }
          if (s.status === 'ERROR') {
            hasError = true;
          }
        }

        return response.ok({
          body: {
            trace_id: traceId,
            span_count: spans.length,
            duration_ms: totalDurationMs,
            total_input_tokens: totalInputTokens,
            total_output_tokens: totalOutputTokens,
            status: hasError ? 'ERROR' : 'OK',
            spans,
          },
        });
      })
    );
}
