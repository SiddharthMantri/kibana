/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RendererTypeDefinition } from '@kbn/agent-builder-server/renderers';
import { TABLE_RENDERER_TYPE, tableRendererSchema } from '../../common/renderers/table';

/**
 * Defines the server-side table renderer contract advertised to agents.
 */
export const createTableRendererDefinition = (): RendererTypeDefinition<
  typeof TABLE_RENDERER_TYPE,
  typeof tableRendererSchema
> => ({
  type: TABLE_RENDERER_TYPE,
  payloadSchema: tableRendererSchema,
  getAgentDescription: () => 'Renders a dataset as an interactive table.',
});
