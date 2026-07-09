/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tableRendererSchema } from './table';

describe('tableRendererSchema', () => {
  it('accepts columns with arbitrary row values', () => {
    expect(
      tableRendererSchema.safeParse({
        columns: ['product', 'revenue'],
        rows: [{ product: 'Bag', revenue: 42, tags: ['featured'] }],
      }).success
    ).toBe(true);
  });

  it('rejects rows that are not records', () => {
    expect(
      tableRendererSchema.safeParse({
        columns: ['product'],
        rows: ['Bag'],
      }).success
    ).toBe(false);
  });
});
