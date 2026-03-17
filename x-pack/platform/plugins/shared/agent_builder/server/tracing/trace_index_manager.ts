/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';
import { chatSystemIndex } from '@kbn/agent-builder-server';

/**
 * System index name for agent builder trace data, within the .chat-* prefix
 * so the Kibana system user has write access automatically.
 * Uses the same StorageIndexAdapter pattern as conversations, agents, tools, etc.
 */
export const traceIndexName = chatSystemIndex('traces');

/**
 * Represents a single span within a trace, stored as a nested object
 * inside the parent TraceDocumentProperties.
 */
export interface SpanProperties {
  span_id: string;
  parent_span_id?: string;
  name: string;
  kind: string;
  '@timestamp': string;
  duration_ms: number;
  status: string;
  gen_ai?: {
    operation_name?: string;
    system?: string;
    request_model?: string;
    response_model?: string;
    usage_input_tokens?: number;
    usage_output_tokens?: number;
  };
  tool?: {
    name?: string;
  };
  error?: {
    message?: string;
    type?: string;
  };
  attributes?: Record<string, unknown>;
}

const storageSettings = {
  name: traceIndexName,
  schema: {
    properties: {
      '@timestamp': types.date({}),
      trace_id: types.keyword({}),
      space_id: types.keyword({}),
      agent_id: types.keyword({}),
      conversation_id: types.keyword({}),
      duration_ms: types.long({}),
      status: types.keyword({}),
      span_count: types.long({}),
      total_input_tokens: types.long({}),
      total_output_tokens: types.long({}),
      // Spans are stored as a dynamic:false object array so individual span
      // fields are not indexed -- the trace-level fields above cover queries.
      spans: types.object({ dynamic: false, properties: {} }),
    },
  },
} satisfies IndexStorageSettings;

/**
 * One document per complete trace (one conversation round).
 * Contains pre-computed summaries and the full span tree as a nested array.
 */
export interface TraceDocumentProperties {
  '@timestamp': string;
  trace_id: string;
  space_id?: string;
  agent_id?: string;
  conversation_id?: string;
  duration_ms: number;
  status: string;
  span_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  spans: SpanProperties[];
}

export type TraceStorageSettings = typeof storageSettings;

export type TraceStorage = StorageIndexAdapter<TraceStorageSettings, TraceDocumentProperties>;

export const createTraceStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): TraceStorage => {
  return new StorageIndexAdapter<TraceStorageSettings, TraceDocumentProperties>(
    esClient,
    logger,
    storageSettings
  );
};
