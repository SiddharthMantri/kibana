/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { DashboardRenderer } from '@kbn/dashboard-plugin/public';
import { DASHBOARD_RENDERER_TYPE, dashboardRendererSchema } from '../../common/renderers/dashboard';
import {
  createDashboardInitializationState,
  createDashboardRendererUiDefinition,
  getGridForPanel,
} from './dashboard_renderer';

jest.mock('@kbn/dashboard-plugin/public', () => ({
  DashboardRenderer: jest.fn(() => <div data-test-subj="dashboardRenderer" />),
}));

describe('dashboard renderer UI definition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('auto-lays out panels that omit grid metadata', () => {
    const grid = getGridForPanel({ type: 'markdown', config: { content: 'Intro' } }, 3);

    expect(grid).toEqual({ x: 24, y: 15, w: 24, h: 15 });
  });

  it('preserves explicit grid metadata', () => {
    const grid = getGridForPanel(
      { type: 'markdown', grid: { x: 1, y: 2, w: 3, h: 4 }, config: { content: 'Intro' } },
      0
    );

    expect(grid).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it('creates read-only Dashboard initialization state', () => {
    const state = createDashboardInitializationState({
      title: 'Ecommerce overview',
      panels: [{ type: 'markdown', config: { content: 'Intro' } }],
    });

    expect(state.viewMode).toBe('view');
    expect(state.panels?.[0]).toEqual(
      expect.objectContaining({ grid: { x: 0, y: 0, w: 24, h: 15 } })
    );
  });

  it('renders DashboardRenderer with overlay panel flyouts', async () => {
    const definition = createDashboardRendererUiDefinition();

    render(
      <>
        {definition.render(
          {
            title: 'Ecommerce overview',
            panels: [{ type: 'markdown', config: { content: 'Intro' } }],
          },
          {}
        )}
      </>
    );

    expect(definition.type).toBe(DASHBOARD_RENDERER_TYPE);
    expect(definition.payloadSchema).toBe(dashboardRendererSchema);
    expect(screen.getByTestId('agentBuilderDashboardRenderer')).toBeInTheDocument();
    expect(DashboardRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ panelFlyoutType: 'overlay' }),
      {}
    );

    const [{ getCreationOptions }] = (DashboardRenderer as jest.Mock).mock.calls[0];
    const creationOptions = await getCreationOptions();
    expect(creationOptions.getInitialInput()).toEqual(
      expect.objectContaining({
        title: 'Ecommerce overview',
        viewMode: 'view',
      })
    );
  });
});
