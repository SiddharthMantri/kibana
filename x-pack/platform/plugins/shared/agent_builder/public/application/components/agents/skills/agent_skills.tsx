/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { PublicSkillSummary } from '@kbn/agent-builder-common';
import { useMutation, useQueryClient } from '@kbn/react-query';
import { labels } from '../../../utils/i18n';
import { useSkillsService } from '../../../hooks/skills/use_skills';
import { useAgentBuilderAgentById } from '../../../hooks/agents/use_agent_by_id';
import { useAgentBuilderServices } from '../../../hooks/use_agent_builder_service';
import { useToasts } from '../../../hooks/use_toasts';
import { queryKeys } from '../../../query_keys';
import { useNavigation } from '../../../hooks/use_navigation';
import { appPaths } from '../../../utils/app_paths';
import { SkillLibraryPanel } from './skill_library_panel';

export const AgentSkills: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const { euiTheme } = useEuiTheme();
  const { agentService } = useAgentBuilderServices();
  const { navigateToAgentBuilderUrl } = useNavigation();
  const { addSuccessToast, addErrorToast } = useToasts();
  const queryClient = useQueryClient();

  const { agent, isLoading: agentLoading } = useAgentBuilderAgentById(agentId);
  const { skills: allSkills, isLoading: skillsLoading } = useSkillsService();

  const [searchQuery, setSearchQuery] = useState('');

  // Skill IDs assigned to this agent. undefined means all skills are active (backward compat).
  const agentSkillIds = useMemo(
    () => agent?.configuration?.skill_ids,
    [agent?.configuration?.skill_ids]
  );

  const agentSkillIdSet = useMemo(
    () => (agentSkillIds ? new Set(agentSkillIds) : undefined),
    [agentSkillIds]
  );

  const activeSkills = useMemo(() => {
    if (!agentSkillIdSet) return allSkills;
    return allSkills.filter((s) => agentSkillIdSet.has(s.id));
  }, [allSkills, agentSkillIdSet]);

  const availableSkills = useMemo(() => {
    if (!agentSkillIdSet) return [];
    return allSkills.filter((s) => !agentSkillIdSet.has(s.id));
  }, [allSkills, agentSkillIdSet]);

  const filteredActiveSkills = useMemo(() => {
    if (!searchQuery.trim()) return activeSkills;
    const lower = searchQuery.toLowerCase();
    return activeSkills.filter(
      (s) => s.name.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower)
    );
  }, [activeSkills, searchQuery]);

  const updateSkillsMutation = useMutation({
    mutationFn: (newSkillIds: string[]) => {
      return agentService.update(agentId!, { configuration: { skill_ids: newSkillIds } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentProfiles.byId(agentId) });
    },
    onError: () => {
      addErrorToast({ title: labels.agentSkills.updateSkillsErrorToast });
    },
  });

  const handleAddSkill = useCallback(
    (skill: PublicSkillSummary) => {
      const currentIds = agentSkillIds ?? allSkills.map((s) => s.id);
      if (currentIds.includes(skill.id)) return;
      const newIds = [...currentIds, skill.id];
      updateSkillsMutation.mutate(newIds, {
        onSuccess: () => {
          addSuccessToast({ title: labels.agentSkills.addSkillSuccessToast(skill.name) });
        },
      });
    },
    [agentSkillIds, allSkills, updateSkillsMutation, addSuccessToast]
  );

  const handleRemoveSkill = useCallback(
    (skill: PublicSkillSummary) => {
      const currentIds = agentSkillIds ?? allSkills.map((s) => s.id);
      const newIds = currentIds.filter((id) => id !== skill.id);
      updateSkillsMutation.mutate(newIds, {
        onSuccess: () => {
          addSuccessToast({ title: labels.agentSkills.removeSkillSuccessToast(skill.name) });
        },
      });
    },
    [agentSkillIds, allSkills, updateSkillsMutation, addSuccessToast]
  );

  const handleEditSkill = useCallback(
    (skill: PublicSkillSummary) => {
      navigateToAgentBuilderUrl(appPaths.manage.skillDetails({ skillId: skill.id }));
    },
    [navigateToAgentBuilderUrl]
  );

  const isLoading = agentLoading || skillsLoading;

  if (isLoading) {
    return (
      <EuiFlexGroup
        alignItems="center"
        justifyContent="center"
        css={css`
          padding: ${euiTheme.size.xxl};
        `}
      >
        <EuiLoadingSpinner size="xl" />
      </EuiFlexGroup>
    );
  }

  return (
    <EuiFlexGroup
      gutterSize="none"
      responsive={false}
      css={css`
        height: 100%;
      `}
    >
      <EuiFlexItem
        grow={3}
        css={css`
          overflow-y: auto;
        `}
      >
        <div
          css={css`
            padding: ${euiTheme.size.l};
          `}
        >
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
            <EuiFlexItem grow={false}>
              <EuiTitle size="l">
                <h1>{labels.skills.title}</h1>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty iconType="discuss">
                    {labels.agentSkills.createFromChatButton}
                  </EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    iconType="plus"
                    onClick={() => navigateToAgentBuilderUrl(appPaths.manage.skillsNew)}
                  >
                    {labels.agentSkills.addSkillButton}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            {labels.agentSkills.pageDescription}
          </EuiText>

          <EuiSpacer size="l" />

          <EuiFlexGroup gutterSize="s" alignItems="center">
            <EuiFlexItem>
              <EuiFieldSearch
                placeholder={labels.agentSkills.searchActiveSkillsPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                incremental
                fullWidth
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon iconType="filter" aria-label="Filter" display="base" size="m" />
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size="l" />

          {filteredActiveSkills.length === 0 ? (
            <EuiText size="s" color="subdued" textAlign="center">
              {searchQuery.trim()
                ? labels.agentSkills.noActiveSkillsMatchMessage
                : labels.agentSkills.noActiveSkillsMessage}
            </EuiText>
          ) : (
            <EuiFlexGroup direction="column" gutterSize="m">
              {filteredActiveSkills.map((skill) => (
                <EuiFlexItem key={skill.id} grow={false}>
                  <ActiveSkillRow
                    skill={skill}
                    onEdit={handleEditSkill}
                    onRemove={handleRemoveSkill}
                  />
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          )}
        </div>
      </EuiFlexItem>

      <EuiFlexItem
        grow={2}
        css={css`
          border-left: ${euiTheme.border.thin};
          overflow-y: auto;
        `}
      >
        <SkillLibraryPanel
          availableSkills={availableSkills}
          onAddSkill={handleAddSkill}
          isMutating={updateSkillsMutation.isLoading}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

interface ActiveSkillRowProps {
  skill: PublicSkillSummary;
  onEdit: (skill: PublicSkillSummary) => void;
  onRemove: (skill: PublicSkillSummary) => void;
}

const ActiveSkillRow: React.FC<ActiveSkillRowProps> = ({ skill, onEdit, onRemove }) => {
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
