/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TraceSpanResponse } from '../../../../../hooks/use_agent_trace';
import type { SpanCategory } from './constants';
import type { NormalizedSpan } from './types';

/**
 * Categorizes a span for consistent waterfall color coding and legend grouping.
 */
export const getSpanCategory = (span: TraceSpanResponse): SpanCategory => {
  const name = span.name.toLowerCase();
  const attrs = span.attributes ?? {};

  if (attrs['gen_ai.system'] || attrs['gen_ai.operation.name'] || name.includes('chat')) {
    return 'llm';
  }
  if (name.includes('tool') || attrs['gen_ai.tool.name'] || span.tool?.name) {
    return 'tool';
  }
  if (name.includes('retriev') || name.includes('search') || name.includes('esql')) {
    return 'search';
  }
  if (name.startsWith('post') || name.startsWith('get') || name.includes('route')) {
    return 'http';
  }
  return 'other';
};

/**
 * Derives compact token usage labels rendered in the span list row.
 */
export const getTokenSummary = (span: TraceSpanResponse): string | null => {
  const input =
    (span.attributes?.['gen_ai.usage.input_tokens'] as number | undefined) ??
    span.gen_ai?.usage_input_tokens;
  const output =
    (span.attributes?.['gen_ai.usage.output_tokens'] as number | undefined) ??
    span.gen_ai?.usage_output_tokens;
  if (input == null && output == null) return null;

  const parts: string[] = [];
  if (input != null) parts.push(`${input} in`);
  if (output != null) parts.push(`${output} out`);
  return parts.join(' / ');
};

/**
 * Normalizes backend span timestamps and initializes tree metadata.
 */
const normalize = (span: TraceSpanResponse): NormalizedSpan => ({
  ...span,
  start_time: span['@timestamp'],
  depth: 0,
  children: [],
});

/**
 * Builds an ordered parent/child span tree used by the waterfall list.
 */
export const buildSpanTree = (spans: TraceSpanResponse[]): NormalizedSpan[] => {
  const spanMap = new Map<string, NormalizedSpan>();
  const roots: NormalizedSpan[] = [];

  for (const span of spans) {
    spanMap.set(span.span_id, normalize(span));
  }

  for (const node of spanMap.values()) {
    if (node.parent_span_id && spanMap.has(node.parent_span_id)) {
      spanMap.get(node.parent_span_id)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // This recursively annotates depth and keeps child rows chronologically stable.
  const setDepths = (node: NormalizedSpan, depth: number) => {
    node.depth = depth;
    node.children.sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    for (const child of node.children) {
      setDepths(child, depth + 1);
    }
  };

  roots.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  for (const root of roots) {
    setDepths(root, 0);
  }

  return roots;
};

/**
 * Flattens the span tree to drive keyboard navigation and row rendering.
 */
export const flattenTree = (nodes: NormalizedSpan[]): NormalizedSpan[] => {
  const result: NormalizedSpan[] = [];
  const recurse = (nodeList: NormalizedSpan[]) => {
    for (const node of nodeList) {
      result.push(node);
      recurse(node.children);
    }
  };
  recurse(nodes);
  return result;
};

/**
 * Computes a fixed number of axis ticks across the total trace duration.
 */
export const computeTickValues = (durationMs: number): number[] => {
  if (durationMs <= 0) return [];
  const count = 5;
  const step = durationMs / count;
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) {
    ticks.push(i * step);
  }
  return ticks;
};

/**
 * Formats millisecond durations for timeline axis labels.
 */
export const formatDuration = (ms: number): string => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 1 && ms > 0) return `${(ms * 1000).toFixed(0)}us`;
  return `${Math.round(ms)}ms`;
};

interface TraceWaterfallLayout {
  flatSpans: NormalizedSpan[];
  traceStartMs: number;
  traceDurationMs: number;
  tickPercents: number[];
  tickLabels: string[];
}

/**
 * Derives all timeline and row geometry values from raw trace spans.
 */
export const buildTraceWaterfallLayout = (spans: TraceSpanResponse[]): TraceWaterfallLayout => {
  if (!spans.length) {
    return {
      flatSpans: [],
      traceStartMs: 0,
      traceDurationMs: 0,
      tickPercents: [],
      tickLabels: [],
    };
  }

  const tree = buildSpanTree(spans);
  const flat = flattenTree(tree);
  const startTimes = spans.map((span) => new Date(span['@timestamp']).getTime());
  const minStart = Math.min(...startTimes);
  const maxEnd = Math.max(...spans.map((span) => new Date(span['@timestamp']).getTime() + span.duration_ms));
  const duration = maxEnd - minStart;
  const ticks = computeTickValues(duration);

  return {
    flatSpans: flat,
    traceStartMs: minStart,
    traceDurationMs: duration,
    tickPercents: ticks.map((tick) => (duration > 0 ? (tick / duration) * 100 : 0)),
    tickLabels: ticks.map((tick) => formatDuration(tick)),
  };
};
