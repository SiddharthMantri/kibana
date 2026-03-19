/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';
import { apiPrivileges } from '../../common/features';
import { internalApiPath } from '../../common/constants';

export function registerTracesRoutes({ router, getInternalServices, logger }: RouteDependencies) {
  const wrapHandler = getHandlerWrapper({ logger });

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
      wrapHandler(async (_ctx, request, response) => {
        const { traces } = getInternalServices();
        const client = traces.getScopedClient({ request });
        const tracesResponse = await client.listTraces();

        return response.ok({
          body: tracesResponse,
        });
      })
    );

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
      wrapHandler(async (_ctx, request, response) => {
        const { traces } = getInternalServices();
        const client = traces.getScopedClient({ request });
        const { trace_id: traceId } = request.params;
        const trace = await client.getTraceById();
        if (!trace) {
          return response.notFound({ body: { message: `Trace [${traceId}] not found` } });
        }

        return response.ok({
          body: trace,
        });
      })
    );
}
