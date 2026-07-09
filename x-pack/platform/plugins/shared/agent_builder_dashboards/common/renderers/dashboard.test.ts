/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { dashboardRendererSchema } from './dashboard';

describe('dashboardRendererSchema', () => {
  it('accepts markdown and Lens API-format visualization panels', () => {
    expect(
      dashboardRendererSchema.safeParse({
        title: 'Ecommerce overview',
        time_range: { from: 'now-7d', to: 'now' },
        panels: [
          {
            type: 'markdown',
            config: { content: '## Overview' },
          },
          {
            type: 'vis',
            config: {
              type: 'metric',
              data_source: { type: 'esql', query: 'FROM kibana_sample_data_ecommerce' },
              metrics: [{ type: 'primary', operation: 'count' }],
            },
          },
        ],
      }).success
    ).toBe(true);
  });

  it('rejects markdown panels without content', () => {
    expect(
      dashboardRendererSchema.safeParse({
        title: 'Invalid dashboard',
        panels: [{ type: 'markdown', config: {} }],
      }).success
    ).toBe(false);
  });
});
