/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { RouteDependencies } from '../types';
import { getHandlerWrapper } from '../wrap_handler';
import { apiPrivileges } from '../../../common/features';
import { internalApiPath } from '../../../common/constants';

export function registerInternalExecutionRoutes({
  router,
  getInternalServices,
  logger,
}: RouteDependencies) {
  const wrapHandler = getHandlerWrapper({ logger });

  router.post(
    {
      path: `${internalApiPath}/executions/_find`,
      validate: {
        body: schema.object({
          execution_ids: schema.arrayOf(schema.string(), { minSize: 1, maxSize: 50 }),
        }),
      },
      options: { access: 'internal' },
      security: {
        authz: { requiredPrivileges: [apiPrivileges.readAgentBuilder] },
      },
    },
    wrapHandler(async (ctx, request, response) => {
      const { execution: executionService } = getInternalServices();
      const { execution_ids: executionIds } = request.body;

      const results = await Promise.all(
        executionIds.map((id) => executionService.getExecution(id))
      );

      const executions = results
        .filter((e): e is NonNullable<typeof e> => e != null)
        .map(({ executionId, status, error }) => ({ executionId, status, error }));

      return response.ok({ body: { executions } });
    })
  );
}
