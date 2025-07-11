/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/css';
import {
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSkeletonTitle,
  useEuiTheme,
  useEuiFontSize,
} from '@elastic/eui';
import { useConversation } from '../../hooks/use_conversation';
import { chatCommonLabels } from './i18n';

interface ConversationHeaderProps {
  conversationId: string | undefined;
}

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({ conversationId }) => {
  const { conversation, isLoading: isConvLoading } = useConversation({ conversationId });

  const { euiTheme } = useEuiTheme();

  const containerClass = css`
    padding: ${euiTheme.size.s} ${euiTheme.size.m};
    border-bottom: solid ${euiTheme.border.width.thin} ${euiTheme.border.color};
  `;

  const conversationTitleClass = css`
    font-weight: ${euiTheme.font.weight.semiBold};
    font-size: ${useEuiFontSize('m').fontSize};
  `;

  return (
    <EuiFlexItem grow={false}>
      <EuiPanel
        hasBorder={false}
        hasShadow={false}
        borderRadius="none"
        color="subdued"
        className={containerClass}
      >
        <EuiFlexGroup alignItems="center">
          <EuiFlexItem grow>
            <EuiTitle>
              <EuiSkeletonTitle size="m" isLoading={conversationId !== undefined && isConvLoading}>
                <h3 className={conversationTitleClass}>
                  {conversation?.title || chatCommonLabels.chat.conversations.newConversationLabel}
                </h3>
              </EuiSkeletonTitle>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </EuiFlexItem>
  );
};
