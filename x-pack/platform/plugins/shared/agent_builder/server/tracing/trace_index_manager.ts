/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { chatSystemIndex } from '@kbn/agent-builder-server';

/**
 * Index name for agent builder trace data, within the .chat-* prefix
 * so the Kibana system user has write access automatically.
 */
export const TRACE_DATA_STREAM_NAME = chatSystemIndex('traces');

const INDEX_TEMPLATE_NAME = `${TRACE_DATA_STREAM_NAME}-template`;

/**
 * Manages the .chat-traces data stream: creates/updates the index template
 * and component template with trace document mappings.
 *
 * Called during plugin start() to ensure the data stream infrastructure
 * exists before the span processor begins indexing.
 */
export class TraceIndexManager {
  private installed = false;

  constructor(private readonly esClient: ElasticsearchClient, private readonly logger: Logger) {}

  /**
   * Creates or updates the index template that backs the .chat-traces data stream.
   * Idempotent: safe to call on every startup.
   */
  async install(): Promise<void> {
    if (this.installed) {
      return;
    }

    try {
      await this.esClient.indices.putIndexTemplate({
        name: INDEX_TEMPLATE_NAME,
        create: false,
        index_patterns: [`${TRACE_DATA_STREAM_NAME}*`],
        data_stream: {},
        template: {
          settings: {
            'index.lifecycle.name': `${TRACE_DATA_STREAM_NAME}-policy`,
            number_of_shards: 1,
            auto_expand_replicas: '0-1',
          },
          mappings: {
            dynamic: false,
            properties: {
              '@timestamp': { type: 'date' },
              trace_id: { type: 'keyword' },
              span_id: { type: 'keyword' },
              parent_span_id: { type: 'keyword' },
              name: { type: 'keyword' },
              kind: { type: 'keyword' },
              duration_ms: { type: 'long' },
              status: { type: 'keyword' },
              space_id: { type: 'keyword' },
              agent_id: { type: 'keyword' },
              conversation_id: { type: 'keyword' },
              gen_ai: {
                properties: {
                  operation_name: { type: 'keyword' },
                  system: { type: 'keyword' },
                  request_model: { type: 'keyword' },
                  response_model: { type: 'keyword' },
                  usage_input_tokens: { type: 'long' },
                  usage_output_tokens: { type: 'long' },
                },
              },
              tool: {
                properties: {
                  name: { type: 'keyword' },
                },
              },
              error: {
                properties: {
                  message: { type: 'text' },
                  type: { type: 'keyword' },
                },
              },
              attributes: { type: 'flattened' },
            },
          },
        },
        priority: 100,
      });

      await this.ensureLifecyclePolicy();

      this.installed = true;
      this.logger.info(`Trace data stream template [${INDEX_TEMPLATE_NAME}] installed`);
    } catch (error) {
      this.logger.error(`Failed to install trace data stream template: ${error.message}`);
      throw error;
    }
  }

  /**
   * Creates an ILM policy for trace data retention if it doesn't already exist.
   * Default: delete after 30 days.
   */
  private async ensureLifecyclePolicy(): Promise<void> {
    const policyName = `${TRACE_DATA_STREAM_NAME}-policy`;

    try {
      await this.esClient.ilm.getLifecycle({ name: policyName });
    } catch (error) {
      if (error.statusCode === 404) {
        await this.esClient.ilm.putLifecycle({
          name: policyName,
          policy: {
            phases: {
              hot: {
                actions: {
                  rollover: {
                    max_age: '7d',
                    max_primary_shard_size: '10gb',
                  },
                },
              },
              delete: {
                min_age: '30d',
                actions: {
                  delete: {},
                },
              },
            },
          },
        });
        this.logger.info(`Trace ILM policy [${policyName}] created`);
      } else {
        throw error;
      }
    }
  }
}
