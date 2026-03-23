/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  EuiButton,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { PluginDefinition } from '@kbn/agent-builder-common';
import { useMutation, useQueryClient } from '@kbn/react-query';
import { labels } from '../../../utils/i18n';
import { usePluginsService } from '../../../hooks/plugins/use_plugins';
import { useAgentBuilderAgentById } from '../../../hooks/agents/use_agent_by_id';
import { useAgentBuilderServices } from '../../../hooks/use_agent_builder_service';
import { useToasts } from '../../../hooks/use_toasts';
import { queryKeys } from '../../../query_keys';
import { useFlyoutState } from '../../../hooks/use_flyout_state';
import { ActiveItemRow } from '../common/active_item_row';
import { PluginLibraryPanel } from './plugin_library_panel';
import { PluginDetailPanel } from './plugin_detail_panel';
import { InstallPluginFlyout } from './install_plugin_flyout';

const FLEX_ITEM_WIDTH = '280px';

export const AgentPlugins: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const { euiTheme } = useEuiTheme();
  const { agentService } = useAgentBuilderServices();
  const { addSuccessToast, addErrorToast } = useToasts();
  const queryClient = useQueryClient();

  const { agent, isLoading: agentLoading } = useAgentBuilderAgentById(agentId);
  const { plugins: allPlugins, isLoading: pluginsLoading } = usePluginsService();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const pendingSelectPluginIdRef = useRef<string | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [mutatingPluginId, setMutatingPluginId] = useState<string | null>(null);
  const {
    isOpen: isLibraryOpen,
    openFlyout: openLibrary,
    closeFlyout: closeLibrary,
  } = useFlyoutState();
  const {
    isOpen: isInstallFlyoutOpen,
    openFlyout: openInstallFlyout,
    closeFlyout: closeInstallFlyout,
  } = useFlyoutState();

  const handleOpenLibrary = useCallback(() => {
    setIsAddMenuOpen(false);
    openLibrary();
  }, [openLibrary]);

  const handleOpenInstallFlyout = useCallback(() => {
    setIsAddMenuOpen(false);
    openInstallFlyout();
  }, [openInstallFlyout]);

  const agentPluginIds = useMemo(
    () => agent?.configuration?.plugin_ids,
    [agent?.configuration?.plugin_ids]
  );

  const agentPluginIdSet = useMemo(
    () => (agentPluginIds ? new Set(agentPluginIds) : undefined),
    [agentPluginIds]
  );

  const activePlugins = useMemo(() => {
    if (!agentPluginIdSet) return [];
    return allPlugins.filter((p) => agentPluginIdSet.has(p.id));
  }, [allPlugins, agentPluginIdSet]);

  useEffect(() => {
    if (pendingSelectPluginIdRef.current) {
      const pendingInActive = activePlugins.some((p) => p.id === pendingSelectPluginIdRef.current);
      if (pendingInActive) {
        setSelectedPluginId(pendingSelectPluginIdRef.current);
        pendingSelectPluginIdRef.current = null;
        return;
      }
    }

    if (!selectedPluginId) {
      if (activePlugins.length > 0) {
        setSelectedPluginId(activePlugins[0].id);
      }
    } else {
      const stillActive = activePlugins.some((p) => p.id === selectedPluginId);
      if (!stillActive) {
        setSelectedPluginId(activePlugins[0]?.id ?? null);
      }
    }
  }, [activePlugins, selectedPluginId]);

  const filteredActivePlugins = useMemo(() => {
    if (!searchQuery.trim()) return activePlugins;
    const lower = searchQuery.toLowerCase();
    return activePlugins.filter(
      (p) => p.name.toLowerCase().includes(lower) || p.description.toLowerCase().includes(lower)
    );
  }, [activePlugins, searchQuery]);

  const updatePluginsMutation = useMutation({
    mutationFn: (newPluginIds: string[]) => {
      return agentService.update(agentId!, { configuration: { plugin_ids: newPluginIds } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentProfiles.byId(agentId) });
    },
    onError: () => {
      addErrorToast({ title: labels.agentPlugins.updatePluginsErrorToast });
    },
  });

  const handleAddPlugin = useCallback(
    async (
      plugin: PluginDefinition,
      { selectOnSuccess = false }: { selectOnSuccess?: boolean } = {}
    ) => {
      const currentIds = agentPluginIds ?? [];
      if (currentIds.includes(plugin.id)) return;
      const newIds = [...currentIds, plugin.id];
      setMutatingPluginId(plugin.id);
      try {
        await updatePluginsMutation.mutateAsync(newIds);
        if (selectOnSuccess) {
          pendingSelectPluginIdRef.current = plugin.id;
        }
        addSuccessToast({ title: labels.agentPlugins.addPluginSuccessToast(plugin.name) });
      } finally {
        setMutatingPluginId(null);
      }
    },
    [agentPluginIds, updatePluginsMutation, addSuccessToast]
  );

  const handleRemovePlugin = useCallback(
    (plugin: PluginDefinition) => {
      const currentIds = agentPluginIds ?? [];
      const newIds = currentIds.filter((id) => id !== plugin.id);
      setMutatingPluginId(plugin.id);
      updatePluginsMutation.mutate(newIds, {
        onSuccess: () => {
          setSelectedPluginId(null);
          addSuccessToast({ title: labels.agentPlugins.removePluginSuccessToast(plugin.name) });
        },
        onSettled: () => setMutatingPluginId(null),
      });
    },
    [agentPluginIds, updatePluginsMutation, addSuccessToast]
  );

  const handleTogglePlugin = useCallback(
    (plugin: PluginDefinition, isActive: boolean) => {
      if (isActive) {
        handleAddPlugin(plugin);
      } else {
        handleRemovePlugin(plugin);
      }
    },
    [handleAddPlugin, handleRemovePlugin]
  );

  const handleRemoveSelectedPlugin = useCallback(() => {
    if (!selectedPluginId) return;
    const plugin = activePlugins.find((p) => p.id === selectedPluginId);
    if (plugin) {
      handleRemovePlugin(plugin);
    }
  }, [selectedPluginId, activePlugins, handleRemovePlugin]);

  const isLoading = agentLoading || pluginsLoading;

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
        display: flex;
        flex-direction: column;
        overflow: hidden;
      `}
    >
      <div
        css={css`
          padding: ${euiTheme.size.l};
          flex-shrink: 0;
        `}
      >
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiTitle size="l">
              <h1>{labels.plugins.title}</h1>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPopover
              aria-label={labels.agentPlugins.installPluginButton}
              button={
                <EuiButton
                  fill
                  iconType="plusInCircle"
                  iconSide="left"
                  onClick={() => setIsAddMenuOpen((prev) => !prev)}
                >
                  {labels.agentPlugins.installPluginButton}
                </EuiButton>
              }
              isOpen={isAddMenuOpen}
              closePopover={() => setIsAddMenuOpen(false)}
              anchorPosition="downLeft"
              panelPaddingSize="none"
            >
              <EuiContextMenuPanel
                items={[
                  <EuiContextMenuItem
                    key="fromUrlOrZip"
                    icon="link"
                    onClick={handleOpenInstallFlyout}
                  >
                    {labels.agentPlugins.fromUrlOrZipMenuItem}
                  </EuiContextMenuItem>,
                  <EuiContextMenuItem
                    key="fromLibrary"
                    icon="importAction"
                    onClick={handleOpenLibrary}
                  >
                    {labels.agentPlugins.fromLibraryMenuItem}
                  </EuiContextMenuItem>,
                ]}
              />
            </EuiPopover>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          {labels.agentPlugins.pageDescription}
        </EuiText>
      </div>

      <EuiFlexGroup
        gutterSize="none"
        responsive={false}
        css={css`
          flex: 1;
          overflow: hidden;
          padding: 0px ${euiTheme.size.l};
        `}
      >
        <EuiFlexItem
          grow={false}
          css={css`
            width: ${FLEX_ITEM_WIDTH};
            display: flex;
            flex-direction: column;
            overflow: hidden;
          `}
        >
          <div
            css={css`
              padding: 0px ${euiTheme.size.m} ${euiTheme.size.s} 0px;
              flex-shrink: 0;
            `}
          >
            <EuiFieldSearch
              placeholder={labels.agentPlugins.searchActivePluginsPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              incremental
              fullWidth
            />
          </div>

          <div
            css={css`
              flex: 1;
              overflow-y: auto;
              padding: 0px ${euiTheme.size.m} ${euiTheme.size.s} 0px;
            `}
          >
            {filteredActivePlugins.length === 0 ? (
              <EuiText size="s" color="subdued" textAlign="center">
                <p>
                  {searchQuery.trim()
                    ? labels.agentPlugins.noActivePluginsMatchMessage
                    : labels.agentPlugins.noActivePluginsMessage}
                </p>
              </EuiText>
            ) : (
              filteredActivePlugins.map((plugin) => (
                <ActiveItemRow
                  key={plugin.id}
                  id={plugin.id}
                  name={plugin.name}
                  isSelected={selectedPluginId === plugin.id}
                  onSelect={() => setSelectedPluginId(plugin.id)}
                  onRemove={() => handleRemovePlugin(plugin)}
                  isRemoving={updatePluginsMutation.isLoading}
                  removeAriaLabel={labels.agentPlugins.removePluginAriaLabel}
                />
              ))
            )}
          </div>
        </EuiFlexItem>

        <EuiFlexItem
          css={css`
            overflow: hidden;
          `}
        >
          {selectedPluginId ? (
            <PluginDetailPanel pluginId={selectedPluginId} onRemove={handleRemoveSelectedPlugin} />
          ) : (
            <EuiFlexGroup
              justifyContent="center"
              alignItems="center"
              css={css`
                height: 100%;
              `}
            >
              <EuiText size="s" color="subdued">
                {labels.agentPlugins.noPluginSelectedMessage}
              </EuiText>
            </EuiFlexGroup>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>

      {isLibraryOpen && (
        <PluginLibraryPanel
          onClose={closeLibrary}
          allPlugins={allPlugins}
          activePluginIdSet={agentPluginIdSet ?? new Set()}
          onTogglePlugin={handleTogglePlugin}
          mutatingPluginId={mutatingPluginId}
        />
      )}

      {isInstallFlyoutOpen && (
        <InstallPluginFlyout onClose={closeInstallFlyout} onPluginInstalled={handleAddPlugin} />
      )}
    </div>
  );
};
