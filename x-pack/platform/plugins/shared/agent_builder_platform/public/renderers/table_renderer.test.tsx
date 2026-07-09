/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TABLE_RENDERER_TYPE, tableRendererSchema } from '../../common/renderers/table';
import { createTableRendererUiDefinition } from './table_renderer';

describe('createTableRendererUiDefinition', () => {
  it('renders payload rows in an EUI table', () => {
    const definition = createTableRendererUiDefinition();

    render(
      <>
        {definition.render(
          {
            columns: ['product', 'revenue'],
            rows: [{ product: 'Trail bag', revenue: 123 }],
          },
          {}
        )}
      </>
    );

    expect(definition.type).toBe(TABLE_RENDERER_TYPE);
    expect(definition.payloadSchema).toBe(tableRendererSchema);
    expect(screen.getByText('product')).toBeInTheDocument();
    expect(screen.getByText('Trail bag')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
  });
});
