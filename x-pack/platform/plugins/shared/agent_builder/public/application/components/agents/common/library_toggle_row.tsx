/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiSwitch,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';

export interface LibraryToggleRowProps {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  onToggle: (isActive: boolean) => void;
  isMutating: boolean;
  /** When true the toggle is locked on and non-interactive. */
  isDisabled?: boolean;
  /** Tooltip shown when the toggle is disabled. */
  disabledTooltip?: string;
}

export const LibraryToggleRow: React.FC<LibraryToggleRowProps> = ({
  name,
  description,
  isActive,
  onToggle,
  isMutating,
  isDisabled = false,
  disabledTooltip,
}) => {
  const { euiTheme } = useEuiTheme();

  const toggle = (
    <EuiSwitch
      label={name}
      showLabel={false}
      checked={isDisabled ? true : isActive}
      onChange={(e) => onToggle(e.target.checked)}
      disabled={isDisabled || isMutating}
      compressed
    />
  );

  return (
    <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
      <EuiFlexItem>
        <EuiText
          size="s"
          css={css`
            font-weight: ${euiTheme.font.weight.semiBold};
          `}
        >
          {name}
        </EuiText>
        <EuiText
          size="xs"
          color="subdued"
          css={css`
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          `}
        >
          {description}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        {isDisabled && disabledTooltip ? (
          <EuiToolTip content={disabledTooltip}>{toggle}</EuiToolTip>
        ) : (
          toggle
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
