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
  EuiLink,
  EuiLoadingSpinner,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { labels } from '../../../utils/i18n';
import { usePlugin } from '../../../hooks/plugins/use_plugin';
import { useNavigation } from '../../../hooks/use_navigation';
import { appPaths } from '../../../utils/app_paths';
import { DetailRow } from '../common/detail_row';

interface PluginDetailPanelProps {
  pluginId: string;
  onRemove: () => void;
}

/**
 * Detail panel displayed on the right side of the agent plugins page.
 * Shows plugin metadata (ID, name, description, skills, author, source)
 * with a remove action and confirmation modal.
 */
export const PluginDetailPanel: React.FC<PluginDetailPanelProps> = ({ pluginId, onRemove }) => {
  const { euiTheme } = useEuiTheme();
  const { plugin, isLoading } = usePlugin({ pluginId });
  const { createAgentBuilderUrl } = useNavigation();
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

  if (!plugin) return null;

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
                    <h2>{plugin.name}</h2>
                  </EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">
                    {labels.agentPlugins.skillsCountBadge(plugin.skill_ids.length)}
                  </EuiBadge>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                iconType="cross"
                size="xs"
                color="danger"
                onClick={() => setIsConfirmOpen(true)}
              >
                {labels.agentPlugins.removePluginButtonLabel}
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>

        <div
          css={css`
            padding: ${euiTheme.size.m};
          `}
        >
          <DetailRow label={labels.agentPlugins.pluginDetailIdLabel}>
            <EuiText size="s">{plugin.id}</EuiText>
          </DetailRow>
          <DetailRow label={labels.agentPlugins.pluginDetailNameLabel}>
            <EuiText size="s">{plugin.name}</EuiText>
          </DetailRow>
          <DetailRow label={labels.agentPlugins.pluginDetailDescriptionLabel}>
            <EuiText size="s">{plugin.description || '\u2014'}</EuiText>
          </DetailRow>
          <DetailRow label={labels.agentPlugins.pluginDetailSkillsLabel}>
            {plugin.skill_ids.length > 0 ? (
              <EuiFlexGroup direction="column" gutterSize="xs">
                {plugin.skill_ids.map((skillId) => (
                  <EuiFlexItem key={skillId} grow={false}>
                    <EuiLink href={createAgentBuilderUrl(appPaths.skills.details({ skillId }))}>
                      {skillId}
                    </EuiLink>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ) : (
              <EuiText size="s" color="subdued">
                {labels.plugins.noSkillsLabel}
              </EuiText>
            )}
          </DetailRow>
          <DetailRow label={labels.agentPlugins.pluginDetailAuthorLabel}>
            <EuiText size="s">{plugin.manifest.author?.name || '\u2014'}</EuiText>
          </DetailRow>
          <DetailRow label={labels.agentPlugins.pluginDetailSourceLabel} isLast>
            {plugin.source_url ? (
              <EuiLink href={plugin.source_url} target="_blank" external>
                {plugin.source_url}
              </EuiLink>
            ) : (
              <EuiText size="s" color="subdued">
                {'\u2014'}
              </EuiText>
            )}
          </DetailRow>
        </div>
      </div>
      {isConfirmOpen && (
        <EuiConfirmModal
          title={labels.agentPlugins.removePluginConfirmTitle(plugin.name)}
          aria-label={labels.agentPlugins.removePluginConfirmTitle(plugin.name)}
          onCancel={() => setIsConfirmOpen(false)}
          onConfirm={() => {
            setIsConfirmOpen(false);
            onRemove();
          }}
          cancelButtonText={labels.agentPlugins.removePluginCancelButton}
          confirmButtonText={labels.agentPlugins.removePluginConfirmButton}
          buttonColor="danger"
        >
          <p>{labels.agentPlugins.removePluginConfirmBody}</p>
        </EuiConfirmModal>
      )}
    </div>
  );
};
