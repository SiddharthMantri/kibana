/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { css } from '@emotion/react';
import type { z } from '@kbn/zod/v4';
import type {
  DashboardCreationOptions,
  DashboardInitializationState,
} from '@kbn/dashboard-plugin/public';
import { DashboardRenderer } from '@kbn/dashboard-plugin/public';
import type { ViewMode } from '@kbn/presentation-publishing';
import type { RendererUIDefinition } from '@kbn/agent-builder-browser';
import { DASHBOARD_RENDERER_TYPE, dashboardRendererSchema } from '../../common/renderers/dashboard';

type DashboardRendererPayload = z.infer<typeof dashboardRendererSchema>;
type DashboardRendererPanel = DashboardRendererPayload['panels'][number];

const DEFAULT_PANEL_WIDTH = 24;
const DEFAULT_PANEL_HEIGHT = 15;
const PANELS_PER_ROW = 2;

const containerStyles = css({
  display: 'flex',
  minHeight: 480,
  width: '100%',
});

/**
 * Builds a deterministic two-column grid for panels that omit layout metadata.
 */
export const getGridForPanel = (
  panel: DashboardRendererPanel,
  panelIndex: number
): Required<DashboardRendererPanel>['grid'] => {
  if (panel.grid) {
    return panel.grid;
  }

  return {
    x: (panelIndex % PANELS_PER_ROW) * DEFAULT_PANEL_WIDTH,
    y: Math.floor(panelIndex / PANELS_PER_ROW) * DEFAULT_PANEL_HEIGHT,
    w: DEFAULT_PANEL_WIDTH,
    h: DEFAULT_PANEL_HEIGHT,
  };
};

/**
 * Converts the renderer payload into Dashboard's initialization state.
 */
export const createDashboardInitializationState = (
  payload: DashboardRendererPayload
): DashboardInitializationState => {
  const { filters, options, panels, ...dashboardState } = payload;
  const laidOutPanels = panels.map((panel, panelIndex) => ({
    ...panel,
    grid: getGridForPanel(panel, panelIndex),
  }));

  return {
    ...dashboardState,
    filters: filters as DashboardInitializationState['filters'],
    options: options as DashboardInitializationState['options'],
    viewMode: 'view' as ViewMode,
    panels: laidOutPanels as DashboardInitializationState['panels'],
  };
};

/**
 * Mounts DashboardRenderer with a by-value, read-only dashboard state.
 */
const AgentBuilderDashboardRenderer = ({ payload }: { payload: DashboardRendererPayload }) => {
  const getCreationOptions = useCallback(async (): Promise<DashboardCreationOptions> => {
    return {
      getInitialInput: () => createDashboardInitializationState(payload),
    };
  }, [payload]);

  return (
    <div css={containerStyles} data-test-subj="agentBuilderDashboardRenderer">
      <DashboardRenderer getCreationOptions={getCreationOptions} panelFlyoutType="overlay" />
    </div>
  );
};

/**
 * Creates the browser-side dashboard renderer registered with Agent Builder.
 */
export const createDashboardRendererUiDefinition = (): RendererUIDefinition<
  typeof dashboardRendererSchema
> => ({
  type: DASHBOARD_RENDERER_TYPE,
  payloadSchema: dashboardRendererSchema,
  render: (payload) => <AgentBuilderDashboardRenderer payload={payload} />,
});
