/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TABLE_RENDERER_TYPE, tableRendererSchema } from '../../common/renderers/table';
import { createTableRendererDefinition } from './table_renderer';

describe('createTableRendererDefinition', () => {
  it('returns the table renderer server contract', () => {
    const definition = createTableRendererDefinition();

    expect(definition.type).toBe(TABLE_RENDERER_TYPE);
    expect(definition.payloadSchema).toBe(tableRendererSchema);
    expect(definition.getAgentDescription?.()).toContain('interactive table');
  });
});
