/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { stringifyUrlParams } from './stringify_url_params';

describe('stringifyUrlParams', () => {
  it('creates expected string value', () => {
    const result = stringifyUrlParams({
      absoluteDateRangeStart: 1000,
      absoluteDateRangeEnd: 2000,
      dateRangeStart: 'now-15m',
      dateRangeEnd: 'now',
      filters: 'monitor.id: bar',
      focusConnectorField: true,
      search: 'monitor.id: foo',
      statusFilter: 'up',
    });
    expect(result).toMatchInlineSnapshot(
      `"?absoluteDateRangeStart=1000&absoluteDateRangeEnd=2000&dateRangeStart=now-15m&dateRangeEnd=now&filters=monitor.id%3A%20bar&focusConnectorField=true&search=monitor.id%3A%20foo&statusFilter=up"`
    );
  });

  it('creates expected string value when ignore empty is true', () => {
    const result = stringifyUrlParams(
      {
        absoluteDateRangeStart: 1000,
        absoluteDateRangeEnd: 2000,
        dateRangeStart: 'now-15m',
        dateRangeEnd: 'now',
        filters: 'monitor.id: bar',
        focusConnectorField: false,
        search: undefined,
        statusFilter: '',
        pagination: undefined,
      },
      true
    );
    expect(result).toMatchInlineSnapshot(`"?dateRangeStart=now-15m&filters=monitor.id%3A%20bar"`);

    expect(result.includes('pagination')).toBeFalsy();
    expect(result.includes('search')).toBeFalsy();
  });
});
