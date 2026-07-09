/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBasicTable } from '@elastic/eui';
import type { RendererUIDefinition } from '@kbn/agent-builder-browser';
import { TABLE_RENDERER_TYPE, tableRendererSchema } from '../../common/renderers/table';

/**
 * Creates the browser-side table renderer that mounts validated payloads inline.
 */
export const createTableRendererUiDefinition = (): RendererUIDefinition<
  typeof tableRendererSchema
> => ({
  type: TABLE_RENDERER_TYPE,
  payloadSchema: tableRendererSchema,
  render: (payload) => (
    <EuiBasicTable
      columns={payload.columns.map((column) => ({ field: column, name: column }))}
      items={payload.rows}
    />
  ),
});
