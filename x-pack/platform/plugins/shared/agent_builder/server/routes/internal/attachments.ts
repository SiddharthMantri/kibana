/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RouteDependencies } from '../types';
import { getHandlerWrapper } from '../wrap_handler';
import type { ListAttachmentTypesResponse } from '../../../common/http_api/attachments';
import { internalApiPath } from '../../../common/constants';
import { AGENT_BUILDER_READ_SECURITY } from '../route_security';

export function registerInternalAttachmentsRoutes({
  router,
  getInternalServices,
  logger,
}: RouteDependencies) {
  const wrapHandler = getHandlerWrapper({ logger });

  // list registered attachment types (internal)
  router.get(
    {
      path: `${internalApiPath}/attachments/_types`,
      validate: false,
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const { attachments } = getInternalServices();

      return response.ok<ListAttachmentTypesResponse>({
        body: {
          types: attachments.getRegisteredTypeIds(),
        },
      });
    })
  );
}
