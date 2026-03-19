/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiResizableContainer,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useAgentTrace } from '../../../../../hooks/use_agent_trace';
import { SPAN_COLORS, type SpanCategory } from './constants';
import { SpanDetail } from './span_detail';
import { TimeAxis } from './time_axis';
import type { NormalizedSpan } from './types';
import { buildTraceWaterfallLayout } from './utils';
import { WaterfallRow } from './waterfall_row';

interface AgentBuilderTraceWaterfallProps {
  traceId: string;
}

export const AgentBuilderTraceWaterfall: React.FC<AgentBuilderTraceWaterfallProps> = ({
  traceId,
}) => {
  const { data, isLoading, error } = useAgentTrace(traceId);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { flatSpans, traceStartMs, traceDurationMs, tickPercents, tickLabels } = useMemo(
    () => buildTraceWaterfallLayout(data?.spans ?? []),
    [data?.spans]
  );

  const handleSpanClick = useCallback(
    (spanId: string) => setSelectedSpanId(spanId === selectedSpanId ? null : spanId),
    [selectedSpanId]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, flatSpans.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === 'Enter' && focusedIndex >= 0 && focusedIndex < flatSpans.length) {
        event.preventDefault();
        handleSpanClick(flatSpans[focusedIndex].span_id);
      } else if (event.key === 'Escape') {
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

  const selectedSpan: NormalizedSpan | null = selectedSpanId
    ? flatSpans.find((span) => span.span_id === selectedSpanId) ?? null
    : null;

  const renderWaterfallContent = () => (
    <>
      <TimeAxis tickLabels={tickLabels} tickPercents={tickPercents} />
      {flatSpans.map((span, index) => (
        <WaterfallRow
          key={span.span_id}
          span={span}
          traceStartMs={traceStartMs}
          traceDurationMs={traceDurationMs}
          isSelected={span.span_id === selectedSpanId}
          isFocused={index === focusedIndex}
          onClick={() => {
            setFocusedIndex(index);
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
