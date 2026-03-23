/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  EuiBadge,
  EuiButton,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { ToolDefinition, ToolSelection } from '@kbn/agent-builder-common';
import { useMutation, useQueryClient } from '@kbn/react-query';
import { labels } from '../../../utils/i18n';
import { useToolsService } from '../../../hooks/tools/use_tools';
import { useAgentBuilderAgentById } from '../../../hooks/agents/use_agent_by_id';
import { useAgentBuilderServices } from '../../../hooks/use_agent_builder_service';
import { useToasts } from '../../../hooks/use_toasts';
import { queryKeys } from '../../../query_keys';
import { useFlyoutState } from '../../../hooks/use_flyout_state';
import { isToolSelected, toggleToolSelection } from '../../../utils/tool_selection_utils';
import { ActiveItemRow } from '../common/active_item_row';
import { ToolLibraryPanel } from './tool_library_panel';
import { ToolDetailPanel } from './tool_detail_panel';

const FLEX_ITEM_WIDTH = '280px';

export const AgentTools: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const { euiTheme } = useEuiTheme();
  const { agentService } = useAgentBuilderServices();
  const { addSuccessToast, addErrorToast } = useToasts();
  const queryClient = useQueryClient();

  const { agent, isLoading: agentLoading } = useAgentBuilderAgentById(agentId);
  const { tools: allTools, isLoading: toolsLoading } = useToolsService();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [mutatingToolId, setMutatingToolId] = useState<string | null>(null);
  const {
    isOpen: isLibraryOpen,
    openFlyout: openLibrary,
    closeFlyout: closeLibrary,
  } = useFlyoutState();

  const agentToolSelections = useMemo(
    () => agent?.configuration?.tools ?? [],
    [agent?.configuration?.tools]
  );

  const enableElasticCapabilities = agent?.configuration?.enable_elastic_capabilities ?? false;

  const builtinTools = useMemo(() => allTools.filter((t) => t.readonly), [allTools]);

  const builtinToolIdSet = useMemo(() => new Set(builtinTools.map((t) => t.id)), [builtinTools]);

  const activeTools = useMemo(() => {
    if (!agent) return [];
    const explicitTools = allTools.filter((t) => isToolSelected(t, agentToolSelections));
    if (enableElasticCapabilities) {
      const explicitIdSet = new Set(explicitTools.map((t) => t.id));
      const builtinNotExplicit = builtinTools.filter((t) => !explicitIdSet.has(t.id));
      return [...explicitTools, ...builtinNotExplicit];
    }
    return explicitTools;
  }, [allTools, agentToolSelections, agent, enableElasticCapabilities, builtinTools]);

  const activeToolIdSet = useMemo(() => new Set(activeTools.map((t) => t.id)), [activeTools]);

  const libraryActiveToolIdSet = useMemo(() => {
    if (enableElasticCapabilities) return new Set([...activeToolIdSet, ...builtinToolIdSet]);
    return activeToolIdSet;
  }, [activeToolIdSet, enableElasticCapabilities, builtinToolIdSet]);

  useEffect(() => {
    if (!selectedToolId) {
      if (activeTools.length > 0) {
        setSelectedToolId(activeTools[0].id);
      }
    } else {
      const stillActive = activeTools.some((t) => t.id === selectedToolId);
      if (!stillActive) {
        setSelectedToolId(activeTools[0]?.id ?? null);
      }
    }
  }, [activeTools, selectedToolId]);

  const filteredActiveTools = useMemo(() => {
    if (!searchQuery.trim()) return activeTools;
    const lower = searchQuery.toLowerCase();
    return activeTools.filter(
      (t) => t.id.toLowerCase().includes(lower) || t.description.toLowerCase().includes(lower)
    );
  }, [activeTools, searchQuery]);

  const updateToolsMutation = useMutation({
    mutationFn: (newToolSelections: ToolSelection[]) => {
      return agentService.update(agentId!, { configuration: { tools: newToolSelections } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentProfiles.byId(agentId) });
    },
    onError: () => {
      addErrorToast({ title: labels.agentTools.updateToolsErrorToast });
    },
  });

  const handleAddTool = useCallback(
    async (tool: ToolDefinition) => {
      if (isToolSelected(tool, agentToolSelections)) return;
      const newSelections = toggleToolSelection(tool.id, allTools, agentToolSelections);
      setMutatingToolId(tool.id);
      try {
        await updateToolsMutation.mutateAsync(newSelections);
        addSuccessToast({ title: labels.agentTools.addToolSuccessToast(tool.id) });
      } finally {
        setMutatingToolId(null);
      }
    },
    [agentToolSelections, allTools, updateToolsMutation, addSuccessToast]
  );

  const handleRemoveTool = useCallback(
    (tool: ToolDefinition) => {
      const newSelections = toggleToolSelection(tool.id, allTools, agentToolSelections);
      setMutatingToolId(tool.id);
      updateToolsMutation.mutate(newSelections, {
        onSuccess: () => {
          setSelectedToolId(null);
          addSuccessToast({ title: labels.agentTools.removeToolSuccessToast(tool.id) });
        },
        onSettled: () => setMutatingToolId(null),
      });
    },
    [agentToolSelections, allTools, updateToolsMutation, addSuccessToast]
  );

  const handleToggleTool = useCallback(
    (tool: ToolDefinition, isActive: boolean) => {
      if (enableElasticCapabilities && tool.readonly) return;
      if (isActive) {
        handleAddTool(tool);
      } else {
        handleRemoveTool(tool);
      }
    },
    [handleAddTool, handleRemoveTool, enableElasticCapabilities]
  );

  const handleRemoveSelectedTool = useCallback(() => {
    if (!selectedToolId) return;
    const tool = activeTools.find((t) => t.id === selectedToolId);
    if (tool) {
      if (enableElasticCapabilities && tool.readonly) return;
      handleRemoveTool(tool);
    }
  }, [selectedToolId, activeTools, handleRemoveTool, enableElasticCapabilities]);

  const isLoading = agentLoading || toolsLoading;

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
              <h1>{labels.tools.title}</h1>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton fill iconType="plusInCircle" iconSide="left" onClick={openLibrary}>
              {labels.agentTools.addToolButton}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          {labels.agentTools.pageDescription}
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
              placeholder={labels.agentTools.searchActiveToolsPlaceholder}
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
            {filteredActiveTools.length === 0 ? (
              <EuiText size="s" color="subdued" textAlign="center">
                <p>
                  {searchQuery.trim()
                    ? labels.agentTools.noActiveToolsMatchMessage
                    : labels.agentTools.noActiveToolsMessage}
                </p>
              </EuiText>
            ) : (
              filteredActiveTools.map((tool) => {
                const isBuiltinManaged = enableElasticCapabilities && tool.readonly;
                return (
                  <ActiveItemRow
                    key={tool.id}
                    id={tool.id}
                    name={tool.id}
                    isSelected={selectedToolId === tool.id}
                    onSelect={() => setSelectedToolId(tool.id)}
                    onRemove={() => handleRemoveTool(tool)}
                    isRemoving={updateToolsMutation.isLoading}
                    removeAriaLabel={labels.agentTools.removeToolAriaLabel}
                    readOnlyContent={
                      isBuiltinManaged ? (
                        <EuiBadge color="hollow">
                          {labels.agentTools.elasticCapabilitiesReadOnlyBadge}
                        </EuiBadge>
                      ) : undefined
                    }
                  />
                );
              })
            )}
          </div>
        </EuiFlexItem>

        <EuiFlexItem
          css={css`
            overflow: hidden;
          `}
        >
          {selectedToolId ? (
            <ToolDetailPanel
              toolId={selectedToolId}
              onRemove={handleRemoveSelectedTool}
              isReadOnly={
                enableElasticCapabilities &&
                (activeTools.find((t) => t.id === selectedToolId)?.readonly ?? false)
              }
            />
          ) : (
            <EuiFlexGroup
              justifyContent="center"
              alignItems="center"
              css={css`
                height: 100%;
              `}
            >
              <EuiText size="s" color="subdued">
                {labels.agentTools.noToolSelectedMessage}
              </EuiText>
            </EuiFlexGroup>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>

      {isLibraryOpen && (
        <ToolLibraryPanel
          onClose={closeLibrary}
          allTools={allTools}
          activeToolIdSet={libraryActiveToolIdSet}
          onToggleTool={handleToggleTool}
          mutatingToolId={mutatingToolId}
          enableElasticCapabilities={enableElasticCapabilities}
          builtinToolIdSet={builtinToolIdSet}
        />
      )}
    </div>
  );
};
