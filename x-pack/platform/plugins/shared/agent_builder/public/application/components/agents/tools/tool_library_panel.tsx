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
import type { ToolDefinition } from '@kbn/agent-builder-common';
import { labels } from '../../../utils/i18n';
import { useNavigation } from '../../../hooks/use_navigation';
import { appPaths } from '../../../utils/app_paths';
import { LibraryToggleRow } from '../common/library_toggle_row';

interface ToolLibraryPanelProps {
  onClose: () => void;
  allTools: ToolDefinition[];
  activeToolIdSet: Set<string>;
  onToggleTool: (tool: ToolDefinition, isActive: boolean) => void;
  mutatingToolId: string | null;
  enableElasticCapabilities?: boolean;
  builtinToolIdSet?: Set<string>;
}

/**
 * Flyout that lists all available tools from the library with toggle switches
 * to add/remove tools from the current agent. Mirrors the skill library panel pattern.
 * When elastic capabilities is enabled, builtin tools are locked on with a tooltip.
 */
export const ToolLibraryPanel: React.FC<ToolLibraryPanelProps> = ({
  onClose,
  allTools,
  activeToolIdSet,
  onToggleTool,
  mutatingToolId,
  enableElasticCapabilities = false,
  builtinToolIdSet,
}) => {
  const { createAgentBuilderUrl } = useNavigation();
  const manageLibraryUrl = createAgentBuilderUrl(appPaths.tools.list);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return allTools;
    const lower = searchQuery.toLowerCase();
    return allTools.filter(
      (t) => t.id.toLowerCase().includes(lower) || t.description.toLowerCase().includes(lower)
    );
  }, [allTools, searchQuery]);

  return (
    <EuiFlyout
      side="right"
      size="960px"
      onClose={onClose}
      aria-labelledby="toolLibraryFlyoutTitle"
      pushMinBreakpoint="xs"
      hideCloseButton={false}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h2 id="toolLibraryFlyoutTitle">{labels.agentTools.addToolFromLibraryTitle}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiLink href={manageLibraryUrl} external>
              {labels.agentTools.manageToolLibraryLink}
            </EuiLink>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiFieldSearch
          placeholder={labels.agentTools.searchAvailableToolsPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          incremental
          fullWidth
        />

        <EuiSpacer size="m" />

        <EuiText size="xs" color="subdued">
          {labels.agentTools.availableToolsSummary(filteredTools.length, allTools.length)}
        </EuiText>

        <EuiSpacer size="m" />

        {enableElasticCapabilities && (
          <>
            <EuiCallOut
              size="s"
              iconType="iInCircle"
              title={labels.agentTools.elasticCapabilitiesCallout}
              announceOnMount={false}
            />
            <EuiSpacer size="m" />
          </>
        )}

        {filteredTools.length === 0 ? (
          <EuiText size="s" color="subdued" textAlign="center">
            {searchQuery.trim()
              ? labels.agentTools.noAvailableToolsMatchMessage
              : labels.agentTools.noAvailableToolsMessage}
          </EuiText>
        ) : (
          <EuiFlexGroup direction="column" gutterSize="m">
            {filteredTools.map((tool) => {
              const isBuiltinManaged =
                enableElasticCapabilities && (builtinToolIdSet?.has(tool.id) ?? false);

              return (
                <EuiFlexItem key={tool.id} grow={false}>
                  <LibraryToggleRow
                    id={tool.id}
                    name={tool.id}
                    description={tool.description}
                    isActive={activeToolIdSet.has(tool.id)}
                    onToggle={(checked) => onToggleTool(tool, checked)}
                    isMutating={mutatingToolId === tool.id}
                    isDisabled={isBuiltinManaged}
                    disabledTooltip={
                      isBuiltinManaged
                        ? labels.agentTools.elasticCapabilitiesManagedTooltip
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
