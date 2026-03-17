/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { api, tracing } from '@elastic/opentelemetry-node/sdk';
import { propagation } from '@opentelemetry/api';
import type { Logger } from '@kbn/core/server';
import { ElasticGenAIAttributes, GenAISemanticConventions } from '@kbn/inference-tracing';
import type { TraceStorage, TraceDocumentProperties, SpanProperties } from './trace_index_manager';

type TraceStorageClient = ReturnType<TraceStorage['getClient']>;

/**
 * Baggage key used by @kbn/inference-tracing to mark spans as part of
 * an inference context. We replicate the check here rather than importing
 * the private helper so the agent_builder plugin stays decoupled.
 */
const INFERENCE_BAGGAGE_KEY = 'kibana.inference.tracing';
const INFERENCE_BAGGAGE_VALUE = '1';

/**
 * Custom attribute set in {@link onStart} so {@link onEnd} can recognise
 * the span without re-checking baggage.
 */
const SHOULD_TRACK_ATTR = '_ab_should_track';

/**
 * Maximum time (ms) to keep an incomplete trace in the buffer before
 * discarding it. Protects against orphaned spans when a root span never
 * arrives (e.g. process crash mid-execution).
 */
const ORPHAN_TIMEOUT_MS = 60_000;

export type { TraceDocumentProperties as TraceDocument };

interface ESSpanProcessorConfig {
  flushIntervalMs: number;
  maxBatchSize: number;
  maxQueueSize: number;
}

/**
 * Buffered entry for an in-progress trace. Spans accumulate here until
 * the root span (no parent) arrives, at which point the trace is
 * assembled into a {@link TraceDocumentProperties} and queued for indexing.
 */
interface PendingTrace {
  spans: tracing.ReadableSpan[];
  firstSeenMs: number;
}

/**
 * OTel SpanProcessor that captures inference-scoped spans, assembles them
 * into complete trace documents (one per conversation round), and indexes
 * them into the .chat-traces system index.
 *
 * Spans arrive via onEnd() in child-first order (OTel guarantees children
 * end before parents). The processor buffers them by trace_id in a Map.
 * When the root span arrives (no parent_span_id) the entire trace is
 * transformed into a single TraceDocumentProperties with pre-computed
 * summaries and the full span tree, then queued for bulk indexing.
 *
 * A periodic sweep discards traces that have been buffering longer than
 * {@link ORPHAN_TIMEOUT_MS} without a root span arriving.
 */
export class AgentBuilderESSpanProcessor implements tracing.SpanProcessor {
  /** Completed trace documents waiting to be flushed. */
  private writeQueue: TraceDocumentProperties[] = [];
  /** Spans buffered by trace_id waiting for their root span. */
  private pendingTraces = new Map<string, PendingTrace>();
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  private storageClient: TraceStorageClient | undefined;
  private shuttingDown = false;

  constructor(private readonly config: ESSpanProcessorConfig, private readonly logger: Logger) {}

  /**
   * Inject the StorageIndexAdapter once it becomes available in plugin start().
   */
  setStorage(traceStorage: TraceStorage): void {
    this.storageClient = traceStorage.getClient();

    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => {
        this.sweepOrphans();
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
   * Buffer spans by trace_id. When the root span (no parent) arrives,
   * assemble the complete trace document and move it to the write queue.
   */
  onEnd(span: tracing.ReadableSpan): void {
    if (!span.attributes[SHOULD_TRACK_ATTR]) {
      return;
    }

    const traceId = span.spanContext().traceId;
    const isRoot = !span.parentSpanContext?.spanId;

    let pending = this.pendingTraces.get(traceId);
    if (!pending) {
      pending = { spans: [], firstSeenMs: Date.now() };
      this.pendingTraces.set(traceId, pending);
    }
    pending.spans.push(span);

    if (isRoot) {
      this.pendingTraces.delete(traceId);
      const doc = this.assembleTrace(traceId, pending.spans);

      if (this.writeQueue.length >= this.config.maxQueueSize) {
        this.logger.warn(
          `Trace write queue full (${this.config.maxQueueSize}), dropping trace [${traceId}]`
        );
        return;
      }
      this.writeQueue.push(doc);

      if (this.writeQueue.length >= this.config.maxBatchSize) {
        this.flush().catch((err) => {
          this.logger.error(`Trace batch flush failed: ${err.message}`);
        });
      }
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

    // Flush any remaining buffered traces even if their root never arrived
    for (const [traceId, pending] of this.pendingTraces) {
      const doc = this.assembleTrace(traceId, pending.spans);
      this.writeQueue.push(doc);
    }
    this.pendingTraces.clear();

    await this.flush();
  }

  /**
   * Discard traces that have been buffering longer than the orphan timeout.
   * This prevents unbounded memory growth if a root span never arrives.
   */
  private sweepOrphans(): void {
    const now = Date.now();
    for (const [traceId, pending] of this.pendingTraces) {
      if (now - pending.firstSeenMs > ORPHAN_TIMEOUT_MS) {
        this.logger.warn(
          `Discarding orphaned trace [${traceId}] with ${pending.spans.length} spans ` +
            `(buffered for ${now - pending.firstSeenMs}ms without a root span)`
        );
        this.pendingTraces.delete(traceId);
      }
    }
  }

  /**
   * Drains the write queue and bulk-indexes complete trace documents.
   */
  private async flush(): Promise<void> {
    if (this.writeQueue.length === 0 || !this.storageClient) {
      return;
    }

    const batch = this.writeQueue.splice(0, this.config.maxBatchSize);
    const operations = batch.map((doc) => ({ index: { document: doc } }));

    try {
      const response = await this.storageClient.bulk({ operations, refresh: false });

      if (response.errors) {
        const failedCount = response.items.filter((item) => {
          const op = Object.keys(item)[0] as keyof typeof item;
          return item[op]?.error;
        }).length;
        this.logger.warn(`Trace bulk index: ${failedCount}/${batch.length} traces failed`);

        if (!this.shuttingDown) {
          const failedIndices = new Set(
            response.items
              .map((item, idx) => {
                const op = Object.keys(item)[0] as keyof typeof item;
                return item[op]?.error ? idx : -1;
              })
              .filter((idx) => idx >= 0)
          );
          const failedDocs = batch.filter((_, idx) => failedIndices.has(idx));
          const space = this.config.maxQueueSize - this.writeQueue.length;
          this.writeQueue.push(...failedDocs.slice(0, space));
        }
      } else {
        this.logger.debug(`Trace bulk index: ${batch.length} traces indexed`);
      }
    } catch (error) {
      this.logger.error(`Trace bulk index error: ${error.message}`);

      if (!this.shuttingDown) {
        const space = this.config.maxQueueSize - this.writeQueue.length;
        this.writeQueue.push(...batch.slice(0, space));
      }
    }
  }

  /**
   * Assembles a complete trace document from all collected spans.
   * The root span provides trace-level metadata (agent_id, space_id, etc.),
   * and token counts are aggregated across all LLM spans.
   */
  private assembleTrace(traceId: string, spans: tracing.ReadableSpan[]): TraceDocumentProperties {
    const rootSpan = spans.find((s) => !s.parentSpanContext?.spanId);

    // Root span attributes provide the trace-level metadata
    const rootAttrs = rootSpan?.attributes ?? {};
    const rootStartMs = rootSpan
      ? rootSpan.startTime[0] * 1000 + rootSpan.startTime[1] / 1_000_000
      : Date.now();
    const rootEndMs = rootSpan
      ? rootSpan.endTime[0] * 1000 + rootSpan.endTime[1] / 1_000_000
      : rootStartMs;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let hasError = false;

    const spanDocs: SpanProperties[] = spans.map((span) => {
      const attrs = span.attributes;
      const startMs = span.startTime[0] * 1000 + span.startTime[1] / 1_000_000;
      const endMs = span.endTime[0] * 1000 + span.endTime[1] / 1_000_000;

      const inputTokens = asOptionalNumber(attrs[GenAISemanticConventions.GenAIUsageInputTokens]);
      const outputTokens = asOptionalNumber(attrs[GenAISemanticConventions.GenAIUsageOutputTokens]);
      if (inputTokens) totalInputTokens += inputTokens;
      if (outputTokens) totalOutputTokens += outputTokens;

      const isError = span.status.code === 2;
      if (isError) hasError = true;

      const errorEvents = span.events.filter((e) => e.name === 'exception');
      const errorInfo =
        errorEvents.length > 0
          ? {
              message: String(errorEvents[0].attributes?.['exception.message'] ?? ''),
              type: String(errorEvents[0].attributes?.['exception.type'] ?? ''),
            }
          : undefined;

      // Build filtered attributes, excluding internal/large values
      const filteredAttributes: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(attrs)) {
        if (key === SHOULD_TRACK_ATTR) continue;
        if (key === 'output.value' || key === 'input.value') continue;
        if (key === ElasticGenAIAttributes.AgentConfig) continue;
        filteredAttributes[key] = value;
      }

      return {
        span_id: span.spanContext().spanId,
        parent_span_id: span.parentSpanContext?.spanId,
        name: span.name,
        kind: String(attrs[ElasticGenAIAttributes.InferenceSpanKind] ?? 'UNKNOWN'),
        '@timestamp': new Date(startMs).toISOString(),
        duration_ms: Math.round(endMs - startMs),
        status: isError ? 'ERROR' : 'OK',
        gen_ai: {
          operation_name: asOptionalString(attrs[GenAISemanticConventions.GenAIOperationName]),
          system: asOptionalString(attrs[GenAISemanticConventions.GenAISystem]),
          request_model: asOptionalString(attrs[GenAISemanticConventions.GenAIRequestModel]),
          response_model: asOptionalString(attrs[GenAISemanticConventions.GenAIResponseModel]),
          usage_input_tokens: inputTokens,
          usage_output_tokens: outputTokens,
        },
        tool: {
          name: asOptionalString(attrs[GenAISemanticConventions.GenAIToolName]),
        },
        error: errorInfo,
        attributes: filteredAttributes,
      };
    });

    return {
      '@timestamp': new Date(rootStartMs).toISOString(),
      trace_id: traceId,
      space_id: asOptionalString(rootAttrs['elastic.agent.space_id']),
      agent_id: asOptionalString(
        rootAttrs[ElasticGenAIAttributes.AgentId] ??
          rootAttrs[GenAISemanticConventions.GenAIAgentId]
      ),
      conversation_id: asOptionalString(
        rootAttrs[ElasticGenAIAttributes.AgentConversationId] ??
          rootAttrs[GenAISemanticConventions.GenAIConversationId]
      ),
      duration_ms: Math.round(rootEndMs - rootStartMs),
      status: hasError ? 'ERROR' : 'OK',
      span_count: spans.length,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      spans: spanDocs,
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
