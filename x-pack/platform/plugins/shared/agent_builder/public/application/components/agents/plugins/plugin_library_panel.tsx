/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
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
import type { PluginDefinition } from '@kbn/agent-builder-common';
import { labels } from '../../../utils/i18n';
import { useNavigation } from '../../../hooks/use_navigation';
import { appPaths } from '../../../utils/app_paths';
import { LibraryToggleRow } from '../common/library_toggle_row';

interface PluginLibraryPanelProps {
  onClose: () => void;
  allPlugins: PluginDefinition[];
  activePluginIdSet: Set<string>;
  onTogglePlugin: (plugin: PluginDefinition, isActive: boolean) => void;
  mutatingPluginId: string | null;
  /** Plugins auto-included by the Elastic Capabilities flag. Their toggles are locked on. */
  autoPluginIdSet?: Set<string>;
}

export const PluginLibraryPanel: React.FC<PluginLibraryPanelProps> = ({
  onClose,
  allPlugins,
  activePluginIdSet,
  onTogglePlugin,
  mutatingPluginId,
  autoPluginIdSet,
}) => {
  const { createAgentBuilderUrl } = useNavigation();
  const manageLibraryUrl = createAgentBuilderUrl(appPaths.plugins.list);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) return allPlugins;
    const lower = searchQuery.toLowerCase();
    return allPlugins.filter(
      (p) => p.name.toLowerCase().includes(lower) || p.description.toLowerCase().includes(lower)
    );
  }, [allPlugins, searchQuery]);

  return (
    <EuiFlyout
      side="right"
      size="960px"
      onClose={onClose}
      aria-labelledby="pluginLibraryFlyoutTitle"
      pushMinBreakpoint="xs"
      hideCloseButton={false}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h2 id="pluginLibraryFlyoutTitle">{labels.agentPlugins.addPluginFromLibraryTitle}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiLink href={manageLibraryUrl} external>
              {labels.agentPlugins.managePluginLibraryLink}
            </EuiLink>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiFieldSearch
          placeholder={labels.agentPlugins.searchAvailablePluginsPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          incremental
          fullWidth
        />

        <EuiSpacer size="m" />

        <EuiText size="xs" color="subdued">
          {labels.agentPlugins.availablePluginsSummary(filteredPlugins.length, allPlugins.length)}
        </EuiText>

        <EuiSpacer size="m" />

        {filteredPlugins.length === 0 ? (
          <EuiText size="s" color="subdued" textAlign="center">
            {searchQuery.trim()
              ? labels.agentPlugins.noAvailablePluginsMatchMessage
              : labels.agentPlugins.noAvailablePluginsMessage}
          </EuiText>
        ) : (
          <EuiFlexGroup direction="column" gutterSize="m">
            {filteredPlugins.map((plugin) => (
              <EuiFlexItem key={plugin.id} grow={false}>
                <LibraryToggleRow
                  id={plugin.id}
                  name={plugin.name}
                  description={plugin.description}
                  isActive={activePluginIdSet.has(plugin.id)}
                  onToggle={(checked) => onTogglePlugin(plugin, checked)}
                  isMutating={mutatingPluginId === plugin.id}
                  isDisabled={autoPluginIdSet?.has(plugin.id)}
                  disabledTooltip={
                    autoPluginIdSet?.has(plugin.id)
                      ? labels.agentPlugins.autoPluginManagedTooltip
                      : undefined
                  }
                />
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
