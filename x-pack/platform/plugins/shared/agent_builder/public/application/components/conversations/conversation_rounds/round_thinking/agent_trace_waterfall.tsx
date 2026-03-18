/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButtonIcon,
  EuiCallOut,
  EuiCodeBlock,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiResizableContainer,
  EuiSpacer,
  EuiStat,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/css';
import { i18n } from '@kbn/i18n';
import { type TraceSpanResponse, useAgentTrace } from '../../../../hooks/use_agent_trace';

interface NormalizedSpan extends TraceSpanResponse {
  /** ISO string copied from @timestamp for rendering compatibility */
  start_time: string;
  depth: number;
  children: NormalizedSpan[];
}

const LABEL_WIDTH = 360;
const INDENT_PX = 16;
const ROW_HEIGHT = 26;
const BAR_HEIGHT = 18;
const BAR_MIN_WIDTH = 2;

type SpanCategory = 'llm' | 'tool' | 'search' | 'http' | 'other';

const SPAN_COLORS: Record<SpanCategory, string> = {
  llm: '#6DCCB1',
  tool: '#79AAD9',
  search: '#EE789D',
  http: '#B9A888',
  other: '#D6BF57',
};

/**
 * Categorizes a span for consistent waterfall color coding and legend grouping.
 */
const getSpanCategory = (span: TraceSpanResponse): SpanCategory => {
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
const getTokenSummary = (span: TraceSpanResponse): string | null => {
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
const buildSpanTree = (spans: TraceSpanResponse[]): NormalizedSpan[] => {
  const spanMap = new Map<string, NormalizedSpan>();
  const roots: NormalizedSpan[] = [];

  for (const span of spans) {
    spanMap.set(span.span_id, normalize(span));
  }

  for (const node of spanMap.values()) {
    if (node.parent_span_id && spanMap.has(node.parent_span_id)) {
      spanMap.get(node.parent_span_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

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
const flattenTree = (nodes: NormalizedSpan[]): NormalizedSpan[] => {
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
const computeTickValues = (durationMs: number): number[] => {
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
const formatDuration = (ms: number): string => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 1 && ms > 0) return `${(ms * 1000).toFixed(0)}us`;
  return `${Math.round(ms)}ms`;
};

const WaterfallRow: React.FC<{
  span: NormalizedSpan;
  traceStartMs: number;
  traceDurationMs: number;
  isSelected: boolean;
  isFocused: boolean;
  onClick: () => void;
  tickPercents: number[];
}> = ({ span, traceStartMs, traceDurationMs, isSelected, isFocused, onClick, tickPercents }) => {
  const { euiTheme } = useEuiTheme();

  const spanStartMs = new Date(span.start_time).getTime();
  const offsetPercent =
    traceDurationMs > 0 ? ((spanStartMs - traceStartMs) / traceDurationMs) * 100 : 0;
  const widthPercent = traceDurationMs > 0 ? (span.duration_ms / traceDurationMs) * 100 : 100;

  const category = getSpanCategory(span);
  const barColor = SPAN_COLORS[category];
  const tokenSummary = getTokenSummary(span);
  const labelInside = widthPercent >= 8;
  const durationLabel = span.duration_ms >= 1 ? `${span.duration_ms.toFixed(0)}ms` : '<1ms';

  const focusOutline = isFocused
    ? `outline: 2px solid ${euiTheme.colors.primary}; outline-offset: -2px;`
    : '';

  const rowStyle = css`
    display: flex;
    align-items: center;
    height: ${ROW_HEIGHT}px;
    cursor: pointer;
    border-left: 3px solid ${isSelected ? barColor : 'transparent'};
    background-color: ${isSelected ? `${barColor}18` : 'transparent'};
    ${focusOutline}
    &:hover {
      background-color: ${isSelected ? `${barColor}22` : euiTheme.colors.lightShade};
    }
  `;

  const labelStyle = css`
    flex: 0 0 ${LABEL_WIDTH}px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 8px;
    overflow: hidden;
    font-size: 12px;
    line-height: ${ROW_HEIGHT}px;
    position: relative;
  `;

  const connectorStyle =
    span.depth > 0
      ? css`
          &::before {
            content: '';
            position: absolute;
            left: ${(span.depth - 1) * INDENT_PX + 10}px;
            top: 0;
            height: 50%;
            border-left: 1px solid ${euiTheme.colors.mediumShade};
            border-bottom: 1px solid ${euiTheme.colors.mediumShade};
            width: 6px;
          }
        `
      : '';

  const gridBg =
    tickPercents.length > 0
      ? tickPercents
          .map(
            (p) =>
              `linear-gradient(to right, ${euiTheme.colors.lightShade} 1px, transparent 1px) ${p}% 0 / 1px 100% no-repeat`
          )
          .join(', ')
      : 'none';

  const barContainerStyle = css`
    flex: 1 1 0%;
    position: relative;
    height: ${BAR_HEIGHT}px;
    min-width: 0;
    background: ${gridBg};
  `;

  const barStyle = css`
    position: absolute;
    top: 0;
    left: ${offsetPercent}%;
    width: max(${widthPercent}%, ${BAR_MIN_WIDTH}px);
    height: 100%;
    background-color: ${barColor};
    border-radius: 3px;
    display: flex;
    align-items: center;
    padding-left: 4px;
    overflow: hidden;
  `;

  return (
    <div
      className={rowStyle}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={-1}
      data-span-id={span.span_id}
    >
      <div className={`${labelStyle} ${connectorStyle}`}>
        <span style={{ minWidth: span.depth * INDENT_PX + 4, flexShrink: 0 }} />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: span.depth === 0 ? 600 : 400,
            fontSize: 12,
          }}
        >
          {span.name}
        </span>
        {tokenSummary && (
          <span
            style={{
              fontSize: 10,
              color: euiTheme.colors.mediumShade,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {tokenSummary}
          </span>
        )}
      </div>
      <div className={barContainerStyle}>
        <div className={barStyle}>
          {labelInside && (
            <span
              style={{
                color: euiTheme.colors.emptyShade,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                textShadow: '0 0 2px rgba(0,0,0,0.3)',
                fontSize: 10,
                lineHeight: `${BAR_HEIGHT}px`,
              }}
            >
              {durationLabel}
            </span>
          )}
        </div>
        {!labelInside && (
          <span
            style={{
              position: 'absolute',
              left: `calc(${offsetPercent}% + max(${widthPercent}%, ${BAR_MIN_WIDTH}px) + 4px)`,
              top: 0,
              fontSize: 10,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              lineHeight: `${BAR_HEIGHT}px`,
              color: euiTheme.colors.mediumShade,
            }}
          >
            {durationLabel}
          </span>
        )}
      </div>
    </div>
  );
};

const SpanDetail: React.FC<{ span: NormalizedSpan; onClose: () => void }> = ({ span, onClose }) => {
  const category = getSpanCategory(span);
  const inputTokens =
    (span.attributes?.['gen_ai.usage.input_tokens'] as number | undefined) ??
    span.gen_ai?.usage_input_tokens;
  const outputTokens =
    (span.attributes?.['gen_ai.usage.output_tokens'] as number | undefined) ??
    span.gen_ai?.usage_output_tokens;
  const hasTokens = inputTokens != null || outputTokens != null;

  const otherAttrs = Object.entries(span.attributes ?? {}).filter(
    ([k]) =>
      k !== 'gen_ai.usage.input_tokens' &&
      k !== 'gen_ai.usage.output_tokens' &&
      k !== 'gen_ai.usage.total_tokens' &&
      k !== '_ab_should_track'
  );

  return (
    <EuiPanel hasBorder hasShadow={false} paddingSize="s">
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <span
                style={{
                  display: 'inline-block',
                  width: 4,
                  height: 20,
                  borderRadius: 2,
                  backgroundColor: SPAN_COLORS[category],
                  flexShrink: 0,
                }}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="s">
                <h4 style={{ margin: 0 }}>{span.name}</h4>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            iconType="cross"
            aria-label={i18n.translate('xpack.agentBuilder.traceWaterfall.closeDetailAria', {
              defaultMessage: 'Close span detail',
            })}
            onClick={onClose}
            size="s"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>
              {i18n.translate('xpack.agentBuilder.traceWaterfall.durationLabel', {
                defaultMessage: 'Duration:',
              })}
            </strong>{' '}
            {(span.duration_ms ?? 0).toFixed(1)}ms
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>
              {i18n.translate('xpack.agentBuilder.traceWaterfall.kindLabel', {
                defaultMessage: 'Kind:',
              })}
            </strong>{' '}
            {span.kind ?? '-'}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>
              {i18n.translate('xpack.agentBuilder.traceWaterfall.statusLabel', {
                defaultMessage: 'Status:',
              })}
            </strong>{' '}
            {span.status ?? '-'}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      {hasTokens && (
        <>
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="m" responsive={false}>
            {inputTokens != null && (
              <EuiFlexItem>
                <EuiStat
                  title={String(inputTokens)}
                  description={i18n.translate('xpack.agentBuilder.traceWaterfall.inputTokensDesc', {
                    defaultMessage: 'Input tokens',
                  })}
                  titleSize="xxs"
                  isLoading={false}
                />
              </EuiFlexItem>
            )}
            {outputTokens != null && (
              <EuiFlexItem>
                <EuiStat
                  title={String(outputTokens)}
                  description={i18n.translate(
                    'xpack.agentBuilder.traceWaterfall.outputTokensDesc',
                    {
                      defaultMessage: 'Output tokens',
                    }
                  )}
                  titleSize="xxs"
                  isLoading={false}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </>
      )}

      {span.error && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            color="danger"
            iconType="error"
            title={
              span.error.type ??
              i18n.translate('xpack.agentBuilder.traceWaterfall.errorTitle', {
                defaultMessage: 'Error',
              })
            }
            size="s"
            announceOnMount={false}
          >
            {span.error.message && <p>{span.error.message}</p>}
          </EuiCallOut>
        </>
      )}

      {otherAttrs.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiAccordion
            id={`attrs-${span.span_id}`}
            buttonContent={i18n.translate('xpack.agentBuilder.traceWaterfall.attributesHeading', {
              defaultMessage: 'Attributes ({count})',
              values: { count: otherAttrs.length },
            })}
            paddingSize="xs"
          >
            <table style={{ fontSize: '12px', width: '100%' }}>
              <tbody>
                {otherAttrs.map(([key, value]) => {
                  const strValue =
                    typeof value === 'object' ? JSON.stringify(value) : String(value);
                  return (
                    <tr key={key}>
                      <td
                        style={{
                          fontWeight: 'bold',
                          padding: '2px 8px 2px 0',
                          whiteSpace: 'nowrap',
                          verticalAlign: 'top',
                        }}
                      >
                        {key}
                      </td>
                      <td style={{ padding: '2px 0', wordBreak: 'break-all' }}>
                        <EuiFlexGroup gutterSize="xs" alignItems="flexStart" responsive={false}>
                          <EuiFlexItem>{strValue}</EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiCopy textToCopy={strValue}>
                              {(copy) => (
                                <EuiButtonIcon
                                  iconType="copy"
                                  aria-label={i18n.translate(
                                    'xpack.agentBuilder.traceWaterfall.copyAttrAria',
                                    {
                                      defaultMessage: 'Copy {key}',
                                      values: { key },
                                    }
                                  )}
                                  onClick={copy}
                                  size="xs"
                                  color="text"
                                  style={{ opacity: 0.4 }}
                                />
                              )}
                            </EuiCopy>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </EuiAccordion>
        </>
      )}

      {span.gen_ai?.request_model && (
        <>
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="subdued">
            {i18n.translate('xpack.agentBuilder.traceWaterfall.modelLabel', {
              defaultMessage: 'Model: {model}',
              values: { model: span.gen_ai.response_model ?? span.gen_ai.request_model },
            })}
          </EuiText>
        </>
      )}

      {span.tool?.name && (
        <>
          <EuiSpacer size="xs" />
          <EuiBadge color="hollow">{span.tool.name}</EuiBadge>
        </>
      )}

      {span.gen_ai?.system && (
        <>
          <EuiSpacer size="xs" />
          <EuiCodeBlock language="text" fontSize="s" paddingSize="s">
            {`system: ${span.gen_ai.system}\noperation: ${span.gen_ai.operation_name ?? '-'}`}
          </EuiCodeBlock>
        </>
      )}
    </EuiPanel>
  );
};

interface AgentBuilderTraceWaterfallProps {
  traceId: string;
}

/**
 * Renders the trace waterfall for agent-builder conversation rounds.
 */
export const AgentBuilderTraceWaterfall: React.FC<AgentBuilderTraceWaterfallProps> = ({
  traceId,
}) => {
  const { data, isLoading, error } = useAgentTrace(traceId);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { euiTheme } = useEuiTheme();

  const { flatSpans, traceStartMs, traceDurationMs, tickPercents, tickLabels } = useMemo(() => {
    if (!data?.spans.length) {
      return {
        flatSpans: [],
        traceStartMs: 0,
        traceDurationMs: 0,
        tickPercents: [],
        tickLabels: [],
      };
    }

    const tree = buildSpanTree(data.spans);
    const flat = flattenTree(tree);

    const startTimes = data.spans.map((s) => new Date(s['@timestamp']).getTime());
    const minStart = Math.min(...startTimes);
    const maxEnd = Math.max(
      ...data.spans.map((s) => new Date(s['@timestamp']).getTime() + s.duration_ms)
    );
    const dur = maxEnd - minStart;

    const ticks = computeTickValues(dur);
    const percents = ticks.map((t) => (dur > 0 ? (t / dur) * 100 : 0));
    const labels = ticks.map((t) => formatDuration(t));

    return {
      flatSpans: flat,
      traceStartMs: minStart,
      traceDurationMs: dur,
      tickPercents: percents,
      tickLabels: labels,
    };
  }, [data]);

  const handleSpanClick = useCallback(
    (spanId: string) => setSelectedSpanId(spanId === selectedSpanId ? null : spanId),
    [selectedSpanId]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, flatSpans.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < flatSpans.length) {
        e.preventDefault();
        handleSpanClick(flatSpans[focusedIndex].span_id);
      } else if (e.key === 'Escape') {
        setSelectedSpanId(null);
      }
    },
    [flatSpans, focusedIndex, handleSpanClick]
  );

  if (isLoading) {
    return (
      <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 200 }}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="xl" />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (error) {
    return (
      <EuiCallOut
        title={i18n.translate('xpack.agentBuilder.traceWaterfall.loadErrorTitle', {
          defaultMessage: 'Failed to load trace',
        })}
        color="danger"
        iconType="error"
        announceOnMount={false}
      >
        <p>{String(error)}</p>
      </EuiCallOut>
    );
  }

  if (!data || data.spans.length === 0) {
    return (
      <EuiCallOut
        title={i18n.translate('xpack.agentBuilder.traceWaterfall.noSpansTitle', {
          defaultMessage: 'No spans found',
        })}
        color="warning"
        iconType="help"
        announceOnMount={false}
      >
        <p>
          {i18n.translate('xpack.agentBuilder.traceWaterfall.noSpansMessage', {
            defaultMessage:
              'No spans were found for trace ID: {traceId}. Trace collection may not be enabled.',
            values: { traceId },
          })}
        </p>
      </EuiCallOut>
    );
  }

  const selectedSpan = selectedSpanId ? flatSpans.find((s) => s.span_id === selectedSpanId) : null;

  const timeAxisStyle = css`
    display: flex;
    align-items: flex-end;
    height: 20px;
    border-bottom: 1px solid ${euiTheme.colors.lightShade};
    margin-bottom: 2px;
  `;

  const tickAreaStyle = css`
    flex: 1 1 0%;
    position: relative;
    height: 100%;
    min-width: 0;
  `;

  const renderWaterfallContent = () => (
    <>
      <div className={timeAxisStyle}>
        <div style={{ flex: `0 0 ${LABEL_WIDTH}px` }} />
        <div className={tickAreaStyle}>
          {tickLabels.map((label, idx) => (
            <span
              key={idx}
              style={{
                position: 'absolute',
                left: `${tickPercents[idx]}%`,
                transform:
                  idx === 0
                    ? 'none'
                    : idx === tickLabels.length - 1
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
                fontSize: 10,
                color: euiTheme.colors.mediumShade,
                whiteSpace: 'nowrap',
                bottom: 2,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
      {flatSpans.map((span, idx) => (
        <WaterfallRow
          key={span.span_id}
          span={span}
          traceStartMs={traceStartMs}
          traceDurationMs={traceDurationMs}
          isSelected={span.span_id === selectedSpanId}
          isFocused={idx === focusedIndex}
          onClick={() => {
            setFocusedIndex(idx);
            handleSpanClick(span.span_id);
          }}
          tickPercents={tickPercents}
        />
      ))}
    </>
  );

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="none"
      style={{ height: '100%' }}
      onKeyDown={handleKeyDown}
    >
      <EuiFlexItem grow={false}>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <strong>
                {i18n.translate('xpack.agentBuilder.traceWaterfall.spanCount', {
                  defaultMessage: '{count} spans',
                  values: { count: flatSpans.length },
                })}
              </strong>{' '}
              &middot;{' '}
              {i18n.translate('xpack.agentBuilder.traceWaterfall.totalDuration', {
                defaultMessage: '{duration}ms total',
                values: { duration: (data.duration_ms ?? 0).toFixed(1) },
              })}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
              {(Object.keys(SPAN_COLORS) as SpanCategory[]).map((category) => (
                <EuiFlexItem key={category} grow={false}>
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: SPAN_COLORS[category],
                        }}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        {category}
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
      </EuiFlexItem>

      <EuiFlexItem style={{ minHeight: 0 }}>
        {selectedSpan ? (
          <EuiResizableContainer direction="vertical" style={{ height: '100%' }}>
            {(EuiResizablePanel, EuiResizableButton) => (
              <>
                <EuiResizablePanel initialSize={55} minSize="20%" paddingSize="none">
                  <div
                    ref={scrollRef}
                    style={{ overflowY: 'auto', height: '100%' }}
                    tabIndex={0}
                    role="listbox"
                  >
                    {renderWaterfallContent()}
                  </div>
                </EuiResizablePanel>
                <EuiResizableButton indicator="border" />
                <EuiResizablePanel initialSize={45} minSize="15%" paddingSize="none">
                  <div style={{ overflowY: 'auto', height: '100%' }}>
                    <SpanDetail span={selectedSpan} onClose={() => setSelectedSpanId(null)} />
                  </div>
                </EuiResizablePanel>
              </>
            )}
          </EuiResizableContainer>
        ) : (
          <div
            ref={scrollRef}
            style={{ overflowY: 'auto', height: '100%' }}
            tabIndex={0}
            role="listbox"
          >
            {renderWaterfallContent()}
          </div>
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
