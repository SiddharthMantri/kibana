/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiText, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';

export interface DetailRowProps {
  label: string;
  children: React.ReactNode;
  isLast?: boolean;
}

export const DetailRow: React.FC<DetailRowProps> = ({ label, children, isLast = false }) => {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiFlexGroup
      gutterSize="none"
      responsive={false}
      css={css`
        padding: ${euiTheme.size.m};
        border-bottom: ${isLast ? 'none' : euiTheme.border.thin};
      `}
    >
      <EuiFlexItem
        grow={false}
        css={css`
          width: 180px;
          padding-right: ${euiTheme.size.m};
        `}
      >
        <EuiText size="s">
          <strong>{label}</strong>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow>{children}</EuiFlexItem>
    </EuiFlexGroup>
  );
};
