/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

export const DASHBOARD_RENDERER_TYPE = 'dashboard';

export const dashboardRendererGridSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const dashboardRendererMarkdownPanelSchema = z.object({
  id: z.string().optional(),
  type: z.literal('markdown'),
  grid: dashboardRendererGridSchema.optional(),
  config: z.object({
    content: z.string(),
    settings: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const dashboardRendererVisualizationPanelSchema = z.object({
  id: z.string().optional(),
  type: z.literal('vis'),
  grid: dashboardRendererGridSchema.optional(),
  config: z.record(z.string(), z.unknown()),
});

export const dashboardRendererPanelSchema = z.discriminatedUnion('type', [
  dashboardRendererMarkdownPanelSchema,
  dashboardRendererVisualizationPanelSchema,
]);

export const dashboardRendererSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  time_range: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional(),
  query: z
    .object({
      language: z.enum(['kql', 'lucene']),
      expression: z.string(),
    })
    .optional(),
  filters: z.array(z.record(z.string(), z.unknown())).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  panels: z.array(dashboardRendererPanelSchema),
});
