/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RendererTypeDefinition } from '@kbn/agent-builder-server/renderers';
import { DASHBOARD_RENDERER_TYPE, dashboardRendererSchema } from '../../common/renderers/dashboard';

/**
 * Defines the server-side dashboard renderer contract advertised to agents.
 */
export const createDashboardRendererDefinition = (): RendererTypeDefinition<
  typeof DASHBOARD_RENDERER_TYPE,
  typeof dashboardRendererSchema
> => ({
  type: DASHBOARD_RENDERER_TYPE,
  payloadSchema: dashboardRendererSchema,
  getAgentDescription: () =>
    'Renders an interactive dashboard from markdown panels and Lens visualization panels using Dashboard API panel format.',
});
