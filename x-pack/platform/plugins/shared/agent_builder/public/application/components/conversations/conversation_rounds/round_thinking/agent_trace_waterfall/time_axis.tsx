/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/css';
import { LABEL_WIDTH } from './constants';

interface TimeAxisProps {
  tickLabels: string[];
  tickPercents: number[];
}

/**
 * Renders timeline tick marks aligned with waterfall bar positions.
 */
export const TimeAxis: React.FC<TimeAxisProps> = ({ tickLabels, tickPercents }) => {
  const { euiTheme } = useEuiTheme();

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

  return (
    <div className={timeAxisStyle}>
      <div style={{ flex: `0 0 ${LABEL_WIDTH}px` }} />
      <div className={tickAreaStyle}>
        {tickLabels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            style={{
              position: 'absolute',
              left: `${tickPercents[index]}%`,
              transform:
                index === 0
                  ? 'none'
                  : index === tickLabels.length - 1
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
  );
};
