/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useSendMessage } from '../../../../context/send_message/send_message_context';

const enabledLabel = i18n.translate(
  'xpack.agentBuilder.conversationInput.continueOnDisconnect.enabled',
  { defaultMessage: 'Background mode on – execution continues if you leave' }
);

const disabledLabel = i18n.translate(
  'xpack.agentBuilder.conversationInput.continueOnDisconnect.disabled',
  { defaultMessage: 'Background mode off – execution stops if you leave' }
);

/**
 * Small icon-button toggle that lets the user opt-in to keeping an agent
 * execution alive on the server when the browser tab is closed or the user
 * logs out. Mirrors the pattern Claude/ChatGPT use for "notify when done".
 */
export const ContinueOnDisconnectToggle: React.FC = () => {
  const { continueOnDisconnect, setContinueOnDisconnect } = useSendMessage();

  const label = continueOnDisconnect ? enabledLabel : disabledLabel;

  return (
    <EuiToolTip content={label} position="top">
      <EuiButtonIcon
        aria-label={label}
        data-test-subj="agentBuilderContinueOnDisconnectToggle"
        iconType="cloudSunny"
        size="xs"
        color={continueOnDisconnect ? 'primary' : 'subdued'}
        display={continueOnDisconnect ? 'fill' : 'empty'}
        onClick={() => setContinueOnDisconnect(!continueOnDisconnect)}
      />
    </EuiToolTip>
  );
};
