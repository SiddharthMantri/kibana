/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiButton,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { PublicSkillSummary } from '@kbn/agent-builder-common';
import { labels } from '../../../utils/i18n';
import { useNavigation } from '../../../hooks/use_navigation';
import { appPaths } from '../../../utils/app_paths';

interface SkillLibraryPanelProps {
  availableSkills: PublicSkillSummary[];
  onAddSkill: (skill: PublicSkillSummary) => void;
  isMutating: boolean;
}

/**
 * Right sidebar panel that displays available skills from the library,
 * allowing the user to search and add them to the current agent.
 */
export const SkillLibraryPanel: React.FC<SkillLibraryPanelProps> = ({
  availableSkills,
  onAddSkill,
  isMutating,
}) => {
  const { euiTheme } = useEuiTheme();
  const { createAgentBuilderUrl } = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return availableSkills;
    const lower = searchQuery.toLowerCase();
    return availableSkills.filter(
      (s) => s.name.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower)
    );
  }, [availableSkills, searchQuery]);

  const manageLibraryUrl = createAgentBuilderUrl(appPaths.manage.skills);

  return (
    <div
      css={css`
        padding: ${euiTheme.size.l};
      `}
    >
      {/* Header */}
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h2>{labels.agentSkills.addSkillFromLibraryTitle}</h2>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiLink href={manageLibraryUrl} external>
            {labels.agentSkills.manageSkillLibraryLink}
          </EuiLink>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Search */}
      <EuiFieldSearch
        placeholder={labels.agentSkills.searchAvailableSkillsPlaceholder}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        incremental
        fullWidth
      />

      <EuiSpacer size="m" />

      {/* Summary count */}
      <EuiText size="xs" color="subdued">
        {labels.agentSkills.availableSkillsSummary(filteredSkills.length, availableSkills.length)}
      </EuiText>

      <EuiSpacer size="m" />

      {/* Skills list */}
      {filteredSkills.length === 0 ? (
        <EuiText size="s" color="subdued" textAlign="center">
          {searchQuery.trim()
            ? labels.agentSkills.noAvailableSkillsMatchMessage
            : labels.agentSkills.noAvailableSkillsMessage}
        </EuiText>
      ) : (
        <EuiFlexGroup direction="column" gutterSize="m">
          {filteredSkills.map((skill) => (
            <EuiFlexItem key={skill.id} grow={false}>
              <AvailableSkillRow skill={skill} onAdd={onAddSkill} isMutating={isMutating} />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      )}
    </div>
  );
};

interface AvailableSkillRowProps {
  skill: PublicSkillSummary;
  onAdd: (skill: PublicSkillSummary) => void;
  isMutating: boolean;
}

/**
 * A single row in the available skills list showing name, truncated description,
 * and a "+ Add" button.
 */
const AvailableSkillRow: React.FC<AvailableSkillRowProps> = ({ skill, onAdd, isMutating }) => {
  const { euiTheme } = useEuiTheme();

  return (
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
        <EuiButton
          size="s"
          iconType="plus"
          onClick={() => onAdd(skill)}
          isLoading={isMutating}
          isDisabled={isMutating}
        >
          {labels.agentSkills.addButtonLabel}
        </EuiButton>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
