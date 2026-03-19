/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFlyoutResizable,
  EuiFlyoutHeader,
  EuiTitle,
  EuiFlyoutBody,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { AgentBuilderTraceWaterfall } from './agent_trace_waterfall';

const traceFlyoutTitle = i18n.translate('xpack.agentBuilder.conversation.traceFlyout.title', {
  defaultMessage: 'Trace',
});

interface TraceFlyoutProps {
  isOpen: boolean;
  traceId?: string;
  onClose: () => void;
}

/**
 * Hosts the trace waterfall in a resizable flyout bound to a trace ID.
 */
export const TraceFlyout: React.FC<TraceFlyoutProps> = ({ isOpen, traceId, onClose }) => {
  // Keep component mounted by caller while avoiding flyout rendering when closed or trace is missing.
  if (!isOpen || !traceId) {
    return null;
  }

  const { euiTheme } = useEuiTheme();
  const baseFlyoutZIndex =
    typeof euiTheme.levels.flyout === 'number'
      ? euiTheme.levels.flyout
      : Number(euiTheme.levels.flyout);

  return (
    <EuiFlyoutResizable
      onClose={onClose}
      aria-labelledby="traceFlyoutTitle"
      size={620}
      minWidth={400}
      maxWidth={1200}
      ownFocus={false}
      css={css`
        z-index: ${baseFlyoutZIndex + 4};
        .euiFlyoutBody__overflowContent {
          height: 100%;
          padding: 0;
        }
        .euiFlyoutBody__overflow {
          overflow: hidden;
        }
      `}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="s">
          <h2 id="traceFlyoutTitle" style={{ wordBreak: 'break-all' }}>
            {traceFlyoutTitle}: {traceId}
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <div style={{ height: '100%', padding: 16 }}>
          <AgentBuilderTraceWaterfall traceId={traceId} />
        </div>
      </EuiFlyoutBody>
    </EuiFlyoutResizable>
  );
};
