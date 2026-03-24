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
  EuiIcon,
  EuiLink,
  EuiLoadingSpinner,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { labels } from '../../../utils/i18n';
import { useToolService } from '../../../hooks/tools/use_tools';
import { appPaths } from '../../../utils/app_paths';
import { useNavigation } from '../../../hooks/use_navigation';

interface ToolDetailPanelProps {
  toolId: string;
  onRemove: () => void;
  /** When true the tool is built-in and cannot be removed. */
  isReadOnly?: boolean;
  /** When true the tool is auto-included via elastic capabilities. Implies isReadOnly. */
  isAutoIncluded?: boolean;
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
  isAutoIncluded = false,
}) => {
  const { euiTheme } = useEuiTheme();
  const { tool, isLoading } = useToolService(toolId);
  const { createAgentBuilderUrl } = useNavigation();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  /** URL to the tool's detail/edit page in the manage library, opened in a new tab. */
  const editInLibraryUrl = createAgentBuilderUrl(appPaths.manage.toolDetails({ toolId }));

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
          border-radius: ${euiTheme.size.base};
        `}
      >
        {/* Header: tool name, subtitle ID, action links */}
        <div
          css={css`
            padding: ${euiTheme.size.l};
            border-bottom: ${euiTheme.border.thin};
            background-color: ${euiTheme.colors.backgroundBaseSubdued};
          `}
        >
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiTitle size="s">
                    <h2>{tool.id}</h2>
                  </EuiTitle>
                </EuiFlexItem>
                {isAutoIncluded && (
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="logoElastic" size="m" aria-hidden={true} />
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
              <EuiText
                size="xs"
                color="subdued"
                css={css`
                  margin-top: ${euiTheme.size.xs};
                `}
              >
                {tool.id}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                {/* Built-in tools that are not auto-included get a read-only lock badge */}
                {isReadOnly && !isAutoIncluded && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow" iconType="lock">
                      {labels.agentTools.readOnlyBadge}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
                {/* "Edit in library" link opens the tool detail page in a new window */}
                {!isReadOnly && !isAutoIncluded && (
                  <EuiFlexItem grow={false}>
                    <EuiLink href={editInLibraryUrl} target="_blank" external>
                      {labels.agentTools.editInLibraryLink}
                    </EuiLink>
                  </EuiFlexItem>
                )}
                {isAutoIncluded ? (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">{labels.agentTools.autoIncludedBadgeLabel}</EuiBadge>
                  </EuiFlexItem>
                ) : isReadOnly ? null : (
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
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>
        <div
          css={css`
            padding: ${euiTheme.size.l};
          `}
        >
          <EuiTitle size="xxxs">
            <h4>{labels.agentTools.toolDetailDescriptionLabel}</h4>
          </EuiTitle>
          <EuiText
            size="s"
            css={css`
              margin-top: ${euiTheme.size.s};
            `}
          >
            {tool.description || '\u2014'}
          </EuiText>
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
