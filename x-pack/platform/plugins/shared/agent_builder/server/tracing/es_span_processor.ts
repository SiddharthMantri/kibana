/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { api, tracing } from '@elastic/opentelemetry-node/sdk';
import { propagation } from '@opentelemetry/api';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { ElasticGenAIAttributes, GenAISemanticConventions } from '@kbn/inference-tracing';
import { TRACE_DATA_STREAM_NAME } from './trace_index_manager';

/**
 * Baggage key used by @kbn/inference-tracing to mark spans as part of
 * an inference context. We replicate the check here rather than importing
 * the private helper so the agent_builder plugin stays decoupled.
 */
const INFERENCE_BAGGAGE_KEY = 'kibana.inference.tracing';
const INFERENCE_BAGGAGE_VALUE = '1';

/**
 * Custom attribute that the processor sets in {@link onStart} so it can later
 * recognise the span in {@link onEnd} without re-checking baggage.
 */
const SHOULD_TRACK_ATTR = '_ab_should_track';

/**
 * Shape of a single trace document indexed into the .chat-traces data stream.
 */
export interface TraceDocument {
  '@timestamp': string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  name: string;
  kind: string;
  duration_ms: number;
  status: string;
  space_id?: string;
  agent_id?: string;
  conversation_id?: string;
  gen_ai: {
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
  attributes: Record<string, unknown>;
}

interface ESSpanProcessorConfig {
  flushIntervalMs: number;
  maxBatchSize: number;
  maxQueueSize: number;
}

/**
 * OTel SpanProcessor that captures inference-scoped spans and bulk-indexes
 * them into the .chat-traces data stream in Elasticsearch.
 *
 * Follows the same inference context filtering pattern as
 * {@link BaseInferenceSpanProcessor} (baggage check + instrumentation scope)
 * but writes to a local ES data stream instead of an OTLP exporter.
 *
 * The ES client is late-bound because it isn't available when the processor
 * is constructed (tracing bootstraps before plugin start).
 */
export class AgentBuilderESSpanProcessor implements tracing.SpanProcessor {
  private queue: tracing.ReadableSpan[] = [];
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  private esClient: ElasticsearchClient | undefined;
  private shuttingDown = false;

  constructor(private readonly config: ESSpanProcessorConfig, private readonly logger: Logger) {}

  /**
   * Inject the internal ES client once it becomes available in plugin start().
   */
  setClient(client: ElasticsearchClient): void {
    this.esClient = client;

    // Start the periodic flush once we have a client
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => {
        this.flush().catch((err) => {
          this.logger.error(`Trace flush failed: ${err.message}`);
        });
      }, this.config.flushIntervalMs);
    }
  }

  /**
   * Filter spans on start: only track spans inside an inference context
   * (same check as BaseInferenceSpanProcessor).
   */
  onStart(span: tracing.Span, parentContext: api.Context): void {
    const baggage = propagation.getBaggage(parentContext);
    const inInferenceContext =
      baggage?.getEntry(INFERENCE_BAGGAGE_KEY)?.value === INFERENCE_BAGGAGE_VALUE;

    const shouldTrack =
      (inInferenceContext || span.instrumentationScope.name === 'inference') &&
      span.instrumentationScope.name !== '@elastic/transport';

    if (shouldTrack) {
      span.setAttribute(SHOULD_TRACK_ATTR, true);
    }
  }

  /**
   * When a tracked span ends, transform it and add it to the batch queue.
   */
  onEnd(span: tracing.ReadableSpan): void {
    if (!span.attributes[SHOULD_TRACK_ATTR]) {
      return;
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      this.logger.warn(
        `Trace queue full (${this.config.maxQueueSize}), dropping span [${span.name}]`
      );
      return;
    }

    this.queue.push(span);

    // Flush immediately if we've hit the batch threshold
    if (this.queue.length >= this.config.maxBatchSize) {
      this.flush().catch((err) => {
        this.logger.error(`Trace batch flush failed: ${err.message}`);
      });
    }
  }

  async forceFlush(): Promise<void> {
    await this.flush();
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
  }

  /**
   * Drains the current queue, transforms spans to trace documents,
   * and bulk-indexes them into the data stream.
   */
  private async flush(): Promise<void> {
    if (this.queue.length === 0 || !this.esClient) {
      return;
    }

    const batch = this.queue.splice(0, this.config.maxBatchSize);
    const operations = batch.flatMap((span) => {
      const doc = this.transformSpan(span);
      return [{ create: { _index: TRACE_DATA_STREAM_NAME } }, doc];
    });

    try {
      const response = await this.esClient.bulk({ operations, refresh: false });

      if (response.errors) {
        const failedCount = response.items.filter((item) => item.create?.error).length;
        this.logger.warn(`Trace bulk index: ${failedCount}/${batch.length} documents failed`);

        // Re-queue failed spans (up to queue limit) unless shutting down
        if (!this.shuttingDown) {
          const failedIndices = new Set(
            response.items
              .map((item, idx) => (item.create?.error ? idx : -1))
              .filter((idx) => idx >= 0)
          );
          const failedSpans = batch.filter((_, idx) => failedIndices.has(idx));
          const requeued = failedSpans.slice(0, this.config.maxQueueSize - this.queue.length);
          this.queue.push(...requeued);
        }
      } else {
        this.logger.debug(`Trace bulk index: ${batch.length} documents indexed`);
      }
    } catch (error) {
      this.logger.error(`Trace bulk index error: ${error.message}`);

      // Re-queue the entire batch on transport errors (up to limit)
      if (!this.shuttingDown) {
        const requeued = batch.slice(0, this.config.maxQueueSize - this.queue.length);
        this.queue.push(...requeued);
      }
    }
  }

  /**
   * Converts an OTel ReadableSpan into a flat trace document for ES.
   */
  private transformSpan(span: tracing.ReadableSpan): TraceDocument {
    const attrs = span.attributes;
    const startTimeMs = span.startTime[0] * 1000 + span.startTime[1] / 1_000_000;
    const endTimeMs = span.endTime[0] * 1000 + span.endTime[1] / 1_000_000;

    const parentSpanId = span.parentSpanContext?.spanId;

    // Build the flattened attributes map, excluding internal/large attrs
    const filteredAttributes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (key === SHOULD_TRACK_ATTR) continue;
      if (key === 'output.value' || key === 'input.value') continue;
      if (key === ElasticGenAIAttributes.AgentConfig) continue;
      filteredAttributes[key] = value;
    }

    const errorEvents = span.events.filter((e) => e.name === 'exception');
    const errorInfo =
      errorEvents.length > 0
        ? {
            message: String(errorEvents[0].attributes?.['exception.message'] ?? ''),
            type: String(errorEvents[0].attributes?.['exception.type'] ?? ''),
          }
        : undefined;

    return {
      '@timestamp': new Date(startTimeMs).toISOString(),
      trace_id: span.spanContext().traceId,
      span_id: span.spanContext().spanId,
      parent_span_id: parentSpanId,
      name: span.name,
      kind: String(attrs[ElasticGenAIAttributes.InferenceSpanKind] ?? 'UNKNOWN'),
      duration_ms: Math.round(endTimeMs - startTimeMs),
      status: span.status.code === 2 ? 'ERROR' : 'OK',
      space_id: asOptionalString(attrs['elastic.agent.space_id']),
      agent_id: asOptionalString(
        attrs[ElasticGenAIAttributes.AgentId] ?? attrs[GenAISemanticConventions.GenAIAgentId]
      ),
      conversation_id: asOptionalString(
        attrs[ElasticGenAIAttributes.AgentConversationId] ??
          attrs[GenAISemanticConventions.GenAIConversationId]
      ),
      gen_ai: {
        operation_name: asOptionalString(attrs[GenAISemanticConventions.GenAIOperationName]),
        system: asOptionalString(attrs[GenAISemanticConventions.GenAISystem]),
        request_model: asOptionalString(attrs[GenAISemanticConventions.GenAIRequestModel]),
        response_model: asOptionalString(attrs[GenAISemanticConventions.GenAIResponseModel]),
        usage_input_tokens: asOptionalNumber(attrs[GenAISemanticConventions.GenAIUsageInputTokens]),
        usage_output_tokens: asOptionalNumber(
          attrs[GenAISemanticConventions.GenAIUsageOutputTokens]
        ),
      },
      tool: {
        name: asOptionalString(attrs[GenAISemanticConventions.GenAIToolName]),
      },
      error: errorInfo,
      attributes: filteredAttributes,
    };
  }
}

const asOptionalString = (value: unknown): string | undefined =>
  value != null ? String(value) : undefined;

const asOptionalNumber = (value: unknown): number | undefined => {
  if (value == null) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
};
