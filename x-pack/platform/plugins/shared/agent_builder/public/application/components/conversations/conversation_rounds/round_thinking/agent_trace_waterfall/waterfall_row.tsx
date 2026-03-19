/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/css';
import { BAR_HEIGHT, BAR_MIN_WIDTH, INDENT_PX, LABEL_WIDTH, ROW_HEIGHT, SPAN_COLORS } from './constants';
import type { NormalizedSpan } from './types';
import { getSpanCategory, getTokenSummary } from './utils';

interface WaterfallRowProps {
  span: NormalizedSpan;
  traceStartMs: number;
  traceDurationMs: number;
  isSelected: boolean;
  isFocused: boolean;
  onClick: () => void;
  tickPercents: number[];
}

/**
 * Renders one trace row with span label and positioned duration bar.
 */
export const WaterfallRow: React.FC<WaterfallRowProps> = ({
  span,
  traceStartMs,
  traceDurationMs,
  isSelected,
  isFocused,
  onClick,
  tickPercents,
}) => {
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
            (percent) =>
              `linear-gradient(to right, ${euiTheme.colors.lightShade} 1px, transparent 1px) ${percent}% 0 / 1px 100% no-repeat`
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
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
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
