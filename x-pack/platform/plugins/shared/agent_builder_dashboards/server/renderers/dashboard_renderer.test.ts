/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DASHBOARD_RENDERER_TYPE, dashboardRendererSchema } from '../../common/renderers/dashboard';
import { createDashboardRendererDefinition } from './dashboard_renderer';

describe('createDashboardRendererDefinition', () => {
  it('returns the dashboard renderer server contract', () => {
    const definition = createDashboardRendererDefinition();

    expect(definition.type).toBe(DASHBOARD_RENDERER_TYPE);
    expect(definition.payloadSchema).toBe(dashboardRendererSchema);
    expect(definition.getAgentDescription?.()).toContain('interactive dashboard');
  });
});
