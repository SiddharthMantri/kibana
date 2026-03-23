/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiCallOut,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { PublicSkillSummary } from '@kbn/agent-builder-common';
import { labels } from '../../../utils/i18n';
import { useNavigation } from '../../../hooks/use_navigation';
import { appPaths } from '../../../utils/app_paths';
import { LibraryToggleRow } from '../common/library_toggle_row';

interface SkillLibraryPanelProps {
  onClose: () => void;
  allSkills: PublicSkillSummary[];
  activeSkillIdSet: Set<string>;
  onToggleSkill: (skill: PublicSkillSummary, isActive: boolean) => void;
  mutatingSkillId: string | null;
  enableElasticCapabilities?: boolean;
  builtinSkillIdSet?: Set<string>;
}

export const SkillLibraryPanel: React.FC<SkillLibraryPanelProps> = ({
  onClose,
  allSkills,
  activeSkillIdSet,
  onToggleSkill,
  mutatingSkillId,
  enableElasticCapabilities = false,
  builtinSkillIdSet,
}) => {
  const { createAgentBuilderUrl } = useNavigation();
  const manageLibraryUrl = createAgentBuilderUrl(appPaths.manage.skills);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return allSkills;
    const lower = searchQuery.toLowerCase();
    return allSkills.filter(
      (s) => s.name.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower)
    );
  }, [allSkills, searchQuery]);

  return (
    <EuiFlyout
      side="right"
      size="960px"
      onClose={onClose}
      aria-labelledby="skillLibraryFlyoutTitle"
      pushMinBreakpoint="xs"
      hideCloseButton={false}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h2 id="skillLibraryFlyoutTitle">{labels.agentSkills.addSkillFromLibraryTitle}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiLink href={manageLibraryUrl} external>
              {labels.agentSkills.manageSkillLibraryLink}
            </EuiLink>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiFieldSearch
          placeholder={labels.agentSkills.searchAvailableSkillsPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          incremental
          fullWidth
        />

        <EuiSpacer size="m" />

        <EuiText size="xs" color="subdued">
          {labels.agentSkills.availableSkillsSummary(filteredSkills.length, allSkills.length)}
        </EuiText>

        <EuiSpacer size="m" />

        {enableElasticCapabilities && (
          <>
            <EuiCallOut
              size="s"
              iconType="iInCircle"
              title={labels.agentSkills.elasticCapabilitiesCallout}
              announceOnMount={false}
            />
            <EuiSpacer size="m" />
          </>
        )}

        {filteredSkills.length === 0 ? (
          <EuiText size="s" color="subdued" textAlign="center">
            {searchQuery.trim()
              ? labels.agentSkills.noAvailableSkillsMatchMessage
              : labels.agentSkills.noAvailableSkillsMessage}
          </EuiText>
        ) : (
          <EuiFlexGroup direction="column" gutterSize="m">
            {filteredSkills.map((skill) => {
              const isBuiltinManaged =
                enableElasticCapabilities && (builtinSkillIdSet?.has(skill.id) ?? false);

              return (
                <EuiFlexItem key={skill.id} grow={false}>
                  <LibraryToggleRow
                    id={skill.id}
                    name={skill.name}
                    description={skill.description}
                    isActive={activeSkillIdSet.has(skill.id)}
                    onToggle={(checked) => onToggleSkill(skill, checked)}
                    isMutating={mutatingSkillId === skill.id}
                    isDisabled={isBuiltinManaged}
                    disabledTooltip={
                      isBuiltinManaged
                        ? labels.agentSkills.elasticCapabilitiesManagedTooltip
                        : undefined
                    }
                  />
                </EuiFlexItem>
              );
            })}
          </EuiFlexGroup>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
