/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { PublicSkillSummary } from '@kbn/agent-builder-common';
import { labels } from '../../../utils/i18n';

export interface ActiveSkillRowProps {
  skill: PublicSkillSummary;
  onEdit: (skill: PublicSkillSummary) => void;
  onRemove: (skill: PublicSkillSummary) => void;
}

/**
 * A single row in the active skills list showing name, description,
 * and edit/remove action icons.
 */
export const ActiveSkillRow: React.FC<ActiveSkillRowProps> = ({ skill, onEdit, onRemove }) => {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiPanel
      hasBorder
      hasShadow={false}
      paddingSize="m"
      css={css`
        &:hover {
          background-color: ${euiTheme.colors.backgroundBaseSubdued};
        }
      `}
    >
      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
        <EuiFlexItem>
          <EuiText
            size="s"
            css={css`
              font-weight: ${euiTheme.font.weight.semiBold};
            `}
          >
            {skill.name}
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
            {skill.description}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                iconType="pencil"
                aria-label={labels.agentSkills.editSkillAriaLabel}
                color="text"
                onClick={() => onEdit(skill)}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                iconType="cross"
                aria-label={labels.agentSkills.removeSkillAriaLabel}
                color="danger"
                onClick={() => onRemove(skill)}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
