/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { tracing } from '@elastic/opentelemetry-node/sdk';
import { loggerMock } from '@kbn/logging-mocks';
import type { MockedLogger } from '@kbn/logging-mocks';
import { AgentBuilderESSpanProcessor } from './es_span_processor';
import type { TraceStorage } from './trace_index_manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an epoch ms timestamp as an OTel [seconds, nanoseconds] tuple */
const toHrTime = (epochMs: number): [number, number] => [
  Math.floor(epochMs / 1000),
  (epochMs % 1000) * 1_000_000,
];

interface MakeSpanOptions {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  scope?: string;
  startMs?: number;
  endMs?: number;
  errorCode?: number;
  attributes?: Record<string, unknown>;
  events?: Array<{ name: string; attributes?: Record<string, unknown> }>;
  /** Whether _ab_should_track is set (simulates onStart having flagged this span) */
  shouldTrack?: boolean;
}

const makeReadableSpan = (opts: MakeSpanOptions = {}): tracing.ReadableSpan => {
  const {
    traceId = 'trace-abc',
    spanId = 'span-001',
    parentSpanId,
    name = 'test-span',
    scope = 'inference',
    startMs = 1_000_000,
    endMs = 1_001_000,
    errorCode = 0,
    attributes = {},
    events = [],
    shouldTrack = true,
  } = opts;

  return {
    name,
    kind: 0,
    spanContext: () => ({ traceId, spanId, traceFlags: 1 }),
    parentSpanContext: parentSpanId ? { spanId: parentSpanId, traceId, traceFlags: 1 } : undefined,
    startTime: toHrTime(startMs),
    endTime: toHrTime(endMs),
    status: { code: errorCode },
    attributes: {
      ...(shouldTrack ? { _ab_should_track: true } : {}),
      ...attributes,
    },
    events,
    links: [],
    resource: { attributes: {} } as unknown as tracing.ReadableSpan['resource'],
    instrumentationScope: { name: scope },
    duration: toHrTime(endMs - startMs),
    ended: true,
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  } as unknown as tracing.ReadableSpan;
};

const makeRootSpan = (overrides: MakeSpanOptions = {}): tracing.ReadableSpan =>
  makeReadableSpan({ spanId: 'root-span', ...overrides });

const makeChildSpan = (overrides: MakeSpanOptions = {}): tracing.ReadableSpan =>
  makeReadableSpan({ spanId: 'child-span', parentSpanId: 'root-span', ...overrides });

// ---------------------------------------------------------------------------
// Mock storage
// ---------------------------------------------------------------------------

const makeMockStorage = () => {
  const bulkMock = jest.fn().mockResolvedValue({ errors: false, items: [] });
  const storageClient = { bulk: bulkMock };
  const storage = {
    getClient: () => storageClient,
  } as unknown as TraceStorage;
  return { storage, bulkMock };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentBuilderESSpanProcessor', () => {
  let processor: AgentBuilderESSpanProcessor;
  let logger: MockedLogger;
  let bulkMock: jest.Mock;
  let storage: TraceStorage;

  const defaultConfig = { flushIntervalMs: 5000, maxBatchSize: 100, maxQueueSize: 1000 };

  beforeEach(() => {
    jest.useFakeTimers();
    logger = loggerMock.create();
    const mock = makeMockStorage();
    bulkMock = mock.bulkMock;
    storage = mock.storage;
    processor = new AgentBuilderESSpanProcessor(defaultConfig, logger);
  });

  afterEach(async () => {
    // Shut down to clear the setInterval started by setStorage
    await processor.shutdown();
    jest.useRealTimers();
  });

  describe('onEnd + buffering', () => {
    it('ignores spans without _ab_should_track', () => {
      processor.setStorage(storage);
      const span = makeReadableSpan({ shouldTrack: false });
      processor.onEnd(span);
      // Nothing queued
      return processor.forceFlush().then(() => {
        expect(bulkMock).not.toHaveBeenCalled();
      });
    });

    it('buffers child spans and assembles trace when root arrives', async () => {
      processor.setStorage(storage);

      // Child arrives first (OTel children-first guarantee)
      processor.onEnd(makeChildSpan({ traceId: 'trace-1', startMs: 1_000_100, endMs: 1_000_500 }));
      // Root not yet arrived — nothing in write queue
      await processor.forceFlush();
      expect(bulkMock).not.toHaveBeenCalled();

      // Root span arrives
      processor.onEnd(makeRootSpan({ traceId: 'trace-1', startMs: 1_000_000, endMs: 1_001_000 }));
      await processor.forceFlush();

      expect(bulkMock).toHaveBeenCalledTimes(1);
      const [{ operations }] = bulkMock.mock.calls[0];
      expect(operations).toHaveLength(1);
      const doc = operations[0].index.document;
      expect(doc.trace_id).toBe('trace-1');
      expect(doc.span_count).toBe(2);
    });

    it('assembles a single root span without children', async () => {
      processor.setStorage(storage);
      processor.onEnd(makeRootSpan({ traceId: 'trace-solo' }));
      await processor.forceFlush();

      expect(bulkMock).toHaveBeenCalledTimes(1);
      const doc = bulkMock.mock.calls[0][0].operations[0].index.document;
      expect(doc.span_count).toBe(1);
      expect(doc.status).toBe('OK');
    });

    it('sets status to ERROR when any span has error code 2', async () => {
      processor.setStorage(storage);
      processor.onEnd(makeChildSpan({ traceId: 'trace-err', errorCode: 2 }));
      processor.onEnd(makeRootSpan({ traceId: 'trace-err' }));
      await processor.forceFlush();

      const doc = bulkMock.mock.calls[0][0].operations[0].index.document;
      expect(doc.status).toBe('ERROR');
    });

    it('aggregates token counts from all spans', async () => {
      processor.setStorage(storage);
      processor.onEnd(
        makeChildSpan({
          traceId: 'trace-tokens',
          attributes: {
            'gen_ai.usage.input_tokens': 10,
            'gen_ai.usage.output_tokens': 5,
          },
        })
      );
      processor.onEnd(
        makeChildSpan({
          traceId: 'trace-tokens',
          spanId: 'child-2',
          parentSpanId: 'root-span',
          attributes: {
            'gen_ai.usage.input_tokens': 20,
            'gen_ai.usage.output_tokens': 8,
          },
        })
      );
      processor.onEnd(makeRootSpan({ traceId: 'trace-tokens' }));
      await processor.forceFlush();

      const doc = bulkMock.mock.calls[0][0].operations[0].index.document;
      expect(doc.total_input_tokens).toBe(30);
      expect(doc.total_output_tokens).toBe(13);
    });

    it('drops trace when writeQueue is at maxQueueSize', async () => {
      const smallProcessor = new AgentBuilderESSpanProcessor(
        { flushIntervalMs: 5000, maxBatchSize: 100, maxQueueSize: 1 },
        logger
      );

      // Fill queue to capacity without storage so flush does nothing
      smallProcessor.onEnd(makeRootSpan({ traceId: 'trace-fill' }));
      // Second trace should be dropped (queue full)
      smallProcessor.onEnd(makeRootSpan({ traceId: 'trace-drop', spanId: 'root-span-2' }));

      smallProcessor.setStorage(storage);
      await smallProcessor.forceFlush();

      const doc = bulkMock.mock.calls[0][0].operations[0].index.document;
      expect(doc.trace_id).toBe('trace-fill');
      expect(bulkMock.mock.calls[0][0].operations).toHaveLength(1);
      expect(loggerMock.collect(logger).warn).toEqual(
        expect.arrayContaining([
          expect.arrayContaining([expect.stringContaining('write queue full')]),
        ])
      );
    });

    it('strips output.value, input.value and _ab_should_track from stored attributes', async () => {
      processor.setStorage(storage);
      processor.onEnd(
        makeRootSpan({
          traceId: 'trace-strip',
          attributes: {
            'output.value': 'large response',
            'input.value': 'large input',
            'elastic.agent.space_id': 'default',
          },
        })
      );
      await processor.forceFlush();

      const span = bulkMock.mock.calls[0][0].operations[0].index.document.spans[0];
      expect(span.attributes).not.toHaveProperty('output.value');
      expect(span.attributes).not.toHaveProperty('input.value');
      expect(span.attributes).not.toHaveProperty('_ab_should_track');
      expect(span.attributes).toHaveProperty(['elastic.agent.space_id'], 'default');
    });
  });

  describe('orphan sweep', () => {
    it('discards incomplete traces after ORPHAN_TIMEOUT_MS (60s)', async () => {
      processor.setStorage(storage);

      // Add child span with no root
      processor.onEnd(makeChildSpan({ traceId: 'orphan-trace' }));

      // Advance past orphan timeout (60s) + one flush interval (5s) so the sweep fires
      jest.advanceTimersByTime(66_000);

      // After sweep, the orphan is gone; no docs written on next flush
      await processor.forceFlush();
      expect(bulkMock).not.toHaveBeenCalled();
      expect(loggerMock.collect(logger).warn).toEqual(
        expect.arrayContaining([
          expect.arrayContaining([expect.stringContaining('Discarding orphaned trace')]),
        ])
      );
    });
  });

  describe('shutdown', () => {
    it('flushes incomplete traces on shutdown', async () => {
      processor.setStorage(storage);

      // Add a child span with no root (would be orphan)
      processor.onEnd(makeChildSpan({ traceId: 'incomplete-trace' }));

      await processor.shutdown();

      expect(bulkMock).toHaveBeenCalledTimes(1);
      const doc = bulkMock.mock.calls[0][0].operations[0].index.document;
      expect(doc.trace_id).toBe('incomplete-trace');
      expect(doc.span_count).toBe(1);
    });

    it('stops the flush timer on shutdown', async () => {
      processor.setStorage(storage);

      // Queue a trace so the shutdown flush has something to write
      processor.onEnd(makeRootSpan({ traceId: 'pre-shutdown' }));
      await processor.shutdown();

      // Shutdown should have flushed the pre-shutdown trace
      expect(bulkMock).toHaveBeenCalledTimes(1);

      // Timer is cleared — a new trace added after shutdown doesn't get flushed
      processor.onEnd(makeRootSpan({ traceId: 'post-shutdown', spanId: 'root-span-2' }));
      jest.advanceTimersByTime(10_000);
      expect(bulkMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('flush error handling', () => {
    it('re-queues failed documents on transport error', async () => {
      bulkMock.mockRejectedValueOnce(new Error('ES connection error'));
      processor.setStorage(storage);
      processor.onEnd(makeRootSpan({ traceId: 'trace-retry' }));

      await processor.forceFlush();

      // Retried on second flush
      await processor.forceFlush();
      expect(bulkMock).toHaveBeenCalledTimes(2);
      const secondDoc = bulkMock.mock.calls[1][0].operations[0].index.document;
      expect(secondDoc.trace_id).toBe('trace-retry');
    });

    it('re-queues individual failed items in a bulk response', async () => {
      bulkMock
        .mockResolvedValueOnce({
          errors: true,
          items: [{ index: { error: { reason: 'mapping error' } } }],
        })
        .mockResolvedValue({ errors: false, items: [] });

      processor.setStorage(storage);
      processor.onEnd(makeRootSpan({ traceId: 'trace-partial-fail' }));
      await processor.forceFlush();

      // Retried on second flush
      await processor.forceFlush();
      expect(bulkMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('setStorage / flush timer', () => {
    it('queues docs before setStorage and flushes them once storage is available', async () => {
      // Queue a completed trace before storage is set
      processor.onEnd(makeRootSpan({ traceId: 'pre-storage' }));

      // No storage → forceFlush does nothing
      await processor.forceFlush();
      expect(bulkMock).not.toHaveBeenCalled();

      // Once storage is set, flush drains the queue
      processor.setStorage(storage);
      await processor.forceFlush();
      expect(bulkMock).toHaveBeenCalledTimes(1);
      expect(bulkMock.mock.calls[0][0].operations[0].index.document.trace_id).toBe('pre-storage');
    });
  });
});
