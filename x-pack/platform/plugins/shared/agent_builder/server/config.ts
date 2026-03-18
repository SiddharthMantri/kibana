/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginConfigDescriptor } from '@kbn/core/server';
import { schema, type TypeOf } from '@kbn/config-schema';

export const configSchema = schema.object({
  enabled: schema.boolean({ defaultValue: true }),
  githubBaseUrl: schema.string({ defaultValue: 'https://github.com' }),
  traceCollection: schema.object({
    enabled: schema.boolean({ defaultValue: true }),
    flushIntervalMs: schema.number({ defaultValue: 5000, min: 1000 }),
    maxBatchSize: schema.number({ defaultValue: 100, min: 1, max: 10000 }),
    maxQueueSize: schema.number({ defaultValue: 1000, min: 1 }),
  }),
});

export type AgentBuilderConfig = TypeOf<typeof configSchema>;

export const config: PluginConfigDescriptor<AgentBuilderConfig> = {
  schema: configSchema,
};
