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
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiIcon,
  EuiLink,
  EuiLoadingSpinner,
  EuiHorizontalRule,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { labels } from '../../../utils/i18n';
import { usePlugin } from '../../../hooks/plugins/use_plugin';
import { useSkill } from '../../../hooks/skills/use_skills';
import { DetailRow } from '../common/detail_row';

interface PluginDetailPanelProps {
  pluginId: string;
  onRemove: () => void;
  isAuto?: boolean;
}

export const PluginDetailPanel: React.FC<PluginDetailPanelProps> = ({
  pluginId,
  onRemove,
  isAuto = false,
}) => {
  const { euiTheme } = useEuiTheme();
  const { plugin, isLoading } = usePlugin({ pluginId });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

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
          border-radius: ${euiTheme.size.xs};
        `}
      >
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
                    <h2>{plugin.name}</h2>
                  </EuiTitle>
                </EuiFlexItem>
                {isAuto && (
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="logoElastic" size="m" aria-hidden={true} />
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              {isAuto ? (
                <EuiBadge color="hollow">{labels.agentPlugins.autoIncludedBadgeLabel}</EuiBadge>
              ) : (
                <EuiButtonEmpty
                  iconType="cross"
                  size="xs"
                  color="danger"
                  onClick={() => setIsConfirmOpen(true)}
                >
                  {labels.agentPlugins.removePluginButtonLabel}
                </EuiButtonEmpty>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
          <div
            css={css`
              margin-top: ${euiTheme.size.xs};
            `}
          >
            <EuiBadge color="hollow" iconType="bolt">
              {labels.agentPlugins.skillsCountBadge(plugin.skill_ids.length)}
            </EuiBadge>
          </div>
          <EuiText
            size="s"
            color="subdued"
            css={css`
              margin-top: ${euiTheme.size.s};
            `}
          >
            {plugin.description || '\u2014'}
          </EuiText>
        </div>

        <div
          css={css`
            padding: ${euiTheme.size.m};
          `}
        >
          <DetailRow label={labels.agentPlugins.pluginDetailIdLabel}>
            <EuiText size="s">{plugin.id}</EuiText>
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
          <EuiHorizontalRule margin="none" />
          <DetailRow label={labels.agentPlugins.pluginDetailSkillsLabel}>
            {plugin.skill_ids.length > 0 ? (
              <EuiFlexGroup direction="column" gutterSize="xs">
                {plugin.skill_ids.map((skillId) => (
                  <EuiFlexItem key={skillId} grow={false}>
                    <EuiLink onClick={() => setSelectedSkillId(skillId)}>{skillId}</EuiLink>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ) : (
              <EuiText size="s" color="subdued">
                {labels.plugins.noSkillsLabel}
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
      {selectedSkillId && (
        <SkillDetailFlyout
          skillId={selectedSkillId}
          pluginName={plugin.name}
          onClose={() => setSelectedSkillId(null)}
        />
      )}
    </div>
  );
};

/** Simple read-only flyout that fetches and displays a single skill's details. */
const SkillDetailFlyout: React.FC<{
  skillId: string;
  pluginName: string;
  onClose: () => void;
}> = ({ skillId, pluginName, onClose }) => {
  const { skill, isLoading } = useSkill({ skillId });

  return (
    <EuiFlyout onClose={onClose} size="m" aria-labelledby="pluginSkillDetailFlyoutTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="s">
          <h2 id="pluginSkillDetailFlyoutTitle">{skill?.name ?? skillId}</h2>
        </EuiTitle>
        <EuiText size="xs" color="subdued">
          {labels.agentPlugins.skillDetailInstalledVia(pluginName)}
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {isLoading ? (
          <EuiFlexGroup justifyContent="center" alignItems="center">
            <EuiLoadingSpinner size="l" />
          </EuiFlexGroup>
        ) : skill ? (
          <>
            <EuiFlexGroup direction="column" gutterSize="l">
              <EuiFlexItem grow={false}>
                <EuiTitle size="xxxs">
                  <h4>{labels.agentPlugins.pluginDetailNameLabel}</h4>
                </EuiTitle>
                <EuiText size="s">{skill.name}</EuiText>
              </EuiFlexItem>
              <EuiHorizontalRule margin="none" />
              <EuiFlexItem grow={false}>
                <EuiTitle size="xxxs">
                  <h4>{labels.agentPlugins.pluginDetailIdLabel}</h4>
                </EuiTitle>
                <EuiText size="s">{skill.id}</EuiText>
              </EuiFlexItem>
              <EuiHorizontalRule margin="none" />
              <EuiFlexItem grow={false}>
                <EuiTitle size="xxxs">
                  <h4>{labels.agentPlugins.pluginDetailDescriptionLabel}</h4>
                </EuiTitle>
                <EuiText size="s">{skill.description || '\u2014'}</EuiText>
              </EuiFlexItem>
              <EuiHorizontalRule margin="none" />
              <EuiFlexItem grow={false}>
                <EuiTitle size="xxxs">
                  <h4>{labels.agentSkills.skillDetailInstructionsLabel}</h4>
                </EuiTitle>
                <div
                  css={css`
                    white-space: pre-wrap;
                    word-break: break-word;
                  `}
                >
                  <EuiText size="s">{skill.content || '\u2014'}</EuiText>
                </div>
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        ) : null}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
