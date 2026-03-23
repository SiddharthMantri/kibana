/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiConfirmModal,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { labels } from '../../../utils/i18n';
import { useToolService } from '../../../hooks/tools/use_tools';
import { DetailRow } from '../common/detail_row';

interface ToolDetailPanelProps {
  toolId: string;
  onRemove: () => void;
  /** When true the tool is auto-included and cannot be removed. */
  isReadOnly?: boolean;
}

/**
 * Right-side detail panel for the selected tool in the agent tools page.
 * Displays tool metadata (ID, type, description, tags) and a remove action
 * with confirmation modal.
 */
export const ToolDetailPanel: React.FC<ToolDetailPanelProps> = ({
  toolId,
  onRemove,
  isReadOnly = false,
}) => {
  const { euiTheme } = useEuiTheme();
  const { tool, isLoading } = useToolService(toolId);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  if (isLoading) {
    return (
      <EuiFlexGroup
        justifyContent="center"
        alignItems="center"
        css={css`
          padding: ${euiTheme.size.xxl};
        `}
      >
        <EuiLoadingSpinner size="l" />
      </EuiFlexGroup>
    );
  }

  if (!tool) return null;

  return (
    <div
      css={css`
        height: 100%;
        overflow-y: auto;
        padding: 0;
      `}
    >
      <div
        css={css`
          border: ${euiTheme.border.thin};
          overflow: hidden;
        `}
      >
        {/* Header with tool name, badges, and remove button */}
        <div
          css={css`
            padding: ${euiTheme.size.m};
            border-bottom: ${euiTheme.border.thin};
            background-color: ${euiTheme.colors.backgroundBaseSubdued};
          `}
        >
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiTitle size="s">
                    <h2>{tool.id}</h2>
                  </EuiTitle>
                </EuiFlexItem>
                {tool.readonly && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">{labels.agentTools.readOnlyBadge}</EuiBadge>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
            {!isReadOnly && (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  iconType="cross"
                  size="xs"
                  color="danger"
                  onClick={() => setIsConfirmOpen(true)}
                >
                  {labels.agentTools.removeToolButtonLabel}
                </EuiButtonEmpty>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </div>

        {/* Detail rows: tags, description, type, ID */}
        <div
          css={css`
            padding: ${euiTheme.size.m};
          `}
        >
          {tool.tags.length > 0 && (
            <DetailRow label={labels.agentTools.toolDetailTagsLabel}>
              <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                {tool.tags.map((tag) => (
                  <EuiFlexItem key={tag} grow={false}>
                    <EuiBadge color="hollow">{tag}</EuiBadge>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            </DetailRow>
          )}
          <DetailRow label={labels.agentTools.toolDetailDescriptionLabel}>
            <EuiText size="s">{tool.description || '\u2014'}</EuiText>
          </DetailRow>
          <DetailRow label={labels.agentTools.toolDetailTypeLabel}>
            <EuiText size="s">{tool.type}</EuiText>
          </DetailRow>
          <DetailRow label={labels.agentTools.toolDetailIdLabel} isLast>
            <EuiText size="s">{tool.id}</EuiText>
          </DetailRow>
        </div>
      </div>

      {isConfirmOpen && (
        <EuiConfirmModal
          title={labels.agentTools.removeToolConfirmTitle(tool.id)}
          aria-label={labels.agentTools.removeToolConfirmTitle(tool.id)}
          onCancel={() => setIsConfirmOpen(false)}
          onConfirm={() => {
            setIsConfirmOpen(false);
            onRemove();
          }}
          cancelButtonText={labels.agentTools.removeToolCancelButton}
          confirmButtonText={labels.agentTools.removeToolConfirmButton}
          buttonColor="danger"
        >
          <p>{labels.agentTools.removeToolConfirmBody}</p>
        </EuiConfirmModal>
      )}
    </div>
  );
};
