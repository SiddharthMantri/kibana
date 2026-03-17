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
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
  EuiPopover,
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
import { useFlyoutState } from '../../../hooks/use_flyout_state';
import { SkillLibraryPanel } from './skill_library_panel';
import { ActiveSkillRow } from './active_skill_row';

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
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const {
    isOpen: isLibraryOpen,
    openFlyout: openLibrary,
    closeFlyout: closeLibrary,
  } = useFlyoutState();

  const closeAddMenu = useCallback(() => setIsAddMenuOpen(false), []);

  const handleImportFromLibrary = useCallback(() => {
    closeAddMenu();
    openLibrary();
  }, [closeAddMenu, openLibrary]);

  const handleCreateSkill = useCallback(() => {
    closeAddMenu();
    navigateToAgentBuilderUrl(appPaths.manage.skillsNew);
  }, [closeAddMenu, navigateToAgentBuilderUrl]);

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
    <div
      css={css`
        height: 100%;
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
                <EuiPopover
                  button={
                    <EuiButton
                      fill
                      iconType="plusInCircle"
                      iconSide="left"
                      onClick={() => setIsAddMenuOpen((prev) => !prev)}
                    >
                      {labels.agentSkills.addSkillButton}
                    </EuiButton>
                  }
                  isOpen={isAddMenuOpen}
                  closePopover={closeAddMenu}
                  anchorPosition="downLeft"
                  panelPaddingSize="none"
                >
                  <EuiContextMenuPanel
                    items={[
                      <EuiContextMenuItem
                        key="importFromLibrary"
                        icon="importAction"
                        onClick={handleImportFromLibrary}
                      >
                        {labels.agentSkills.importFromLibraryMenuItem}
                      </EuiContextMenuItem>,
                      <EuiContextMenuItem
                        key="createSkill"
                        icon="pencil"
                        onClick={handleCreateSkill}
                      >
                        {labels.agentSkills.createSkillMenuItem}
                      </EuiContextMenuItem>,
                    ]}
                  />
                </EuiPopover>
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

      {isLibraryOpen && (
        <EuiFlyout
          type="push"
          side="right"
          size="s"
          onClose={closeLibrary}
          aria-labelledby="skillLibraryFlyoutTitle"
          pushMinBreakpoint="xs"
          hideCloseButton={false}
        >
          <EuiFlyoutHeader hasBorder>
            <SkillLibraryPanel.Header />
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <SkillLibraryPanel
              availableSkills={availableSkills}
              onAddSkill={handleAddSkill}
              isMutating={updateSkillsMutation.isLoading}
            />
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </div>
  );
};
