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
  EuiLoadingSpinner,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { labels } from '../../../utils/i18n';
import { useSkill } from '../../../hooks/skills/use_skills';
import { DetailRow } from '../common/detail_row';

interface SkillDetailPanelProps {
  skillId: string;
  onEdit: () => void;
  onRemove: () => void;
  isReadOnly?: boolean;
}

export const SkillDetailPanel: React.FC<SkillDetailPanelProps> = ({
  skillId,
  onEdit,
  onRemove,
  isReadOnly = false,
}) => {
  const { euiTheme } = useEuiTheme();
  const { skill, isLoading } = useSkill({ skillId });
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

  if (!skill) return null;

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
        <div
          css={css`
            padding: ${euiTheme.size.m};
            border-bottom: ${euiTheme.border.thin};
            background-color: ${euiTheme.colors.backgroundBaseSubdued};
            padding: ${euiTheme.size.l};
          `}
        >
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiTitle size="s">
                    <h2>{skill.name}</h2>
                  </EuiTitle>
                </EuiFlexItem>
                {isReadOnly && (
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="logoElastic" size="m" aria-hidden={true} />
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              {isReadOnly ? (
                <EuiBadge color="hollow">{labels.agentSkills.autoIncludedBadgeLabel}</EuiBadge>
              ) : (
                <EuiFlexGroup gutterSize="s" responsive={false}>
                  {!skill.readonly && (
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty iconType="pencil" size="xs" onClick={onEdit}>
                        {labels.skills.editSkillButtonLabel}
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                  )}
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      iconType="cross"
                      size="xs"
                      color="danger"
                      onClick={() => setIsConfirmOpen(true)}
                    >
                      {labels.agentSkills.removeSkillButtonLabel}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiText
            size="xs"
            color="subdued"
            css={css`
              margin-top: ${euiTheme.size.xs};
            `}
          >
            {skill.id}
          </EuiText>
          <EuiText
            size="s"
            color="subdued"
            css={css`
              margin-top: ${euiTheme.size.s};
            `}
          >
            {skill.description}
          </EuiText>
        </div>

        <div
          css={css`
            padding: ${euiTheme.size.m};
          `}
        >
          <DetailRow
            label={labels.agentSkills.skillDetailInstructionsLabel}
            isLast={!skill.tool_ids || skill.tool_ids.length === 0}
          >
            <div
              css={css`
                white-space: pre-wrap;
                word-break: break-word;
              `}
            >
              <EuiText size="s">{skill.content}</EuiText>
            </div>
          </DetailRow>
          {skill.tool_ids && skill.tool_ids.length > 0 && (
            <DetailRow label={labels.skills.toolsLabel} isLast>
              <EuiFlexGroup direction="column" gutterSize="xs">
                {skill.tool_ids.map((toolId) => (
                  <EuiFlexItem key={toolId} grow={false}>
                    <EuiText size="s" color="primary">
                      {toolId}
                    </EuiText>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            </DetailRow>
          )}
        </div>
      </div>
      {isConfirmOpen && (
        <EuiConfirmModal
          title={labels.agentSkills.removeSkillConfirmTitle(skill.name)}
          aria-label={labels.agentSkills.removeSkillConfirmTitle(skill.name)}
          onCancel={() => setIsConfirmOpen(false)}
          onConfirm={() => {
            setIsConfirmOpen(false);
            onRemove();
          }}
          cancelButtonText={labels.agentSkills.removeSkillCancelButton}
          confirmButtonText={labels.agentSkills.removeSkillConfirmButton}
          buttonColor="danger"
        >
          <p>{labels.agentSkills.removeSkillConfirmBody}</p>
        </EuiConfirmModal>
      )}
    </div>
  );
};
