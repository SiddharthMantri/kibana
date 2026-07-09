/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import { chatAgentTypeId, type AgentConfiguration } from '@kbn/agent-builder-common';
import type {
  AgentConfigContext,
  AgentBaseConfiguration,
  AgentTypeRegistry,
} from '@kbn/agent-builder-server/agents';
import { mergeAgentConfiguration } from '@kbn/agent-builder-server/agents';

/**
 * Resolves an agent type's base configuration for the given context, folding it under the
 * agent's own (raw) configuration to produce the effective configuration used at execution time.
 *
 * This is deliberately an execution-time concern, not a registry read-time one: the agent type
 * stays a black box at the API boundary, and its contribution to execution is never exposed as a
 * merged blob on the agent shape.
 *
 * An agent referencing an unregistered type (e.g. its providing plugin is disabled) falls back to
 * the `chat` type's empty base so it keeps working; the fallback is warned once per unknown type id.
 */
export const createConfigurationResolver = ({
  typeRegistry,
  logger,
}: {
  typeRegistry: AgentTypeRegistry;
  logger: Logger;
}) => {
  const warnedUnknownTypes = new Set<string>();

  const resolveBaseConfiguration = async (
    typeId: string,
    ctx: AgentConfigContext
  ): Promise<AgentBaseConfiguration> => {
    let type = typeRegistry.get(typeId);
    if (!type) {
      if (!warnedUnknownTypes.has(typeId)) {
        warnedUnknownTypes.add(typeId);
        logger.warn(
          `Agent references unknown agent type "${typeId}", falling back to the "${chatAgentTypeId}" type's base configuration`
        );
      }
      type = typeRegistry.get(chatAgentTypeId);
    }
    const base = type?.baseConfiguration ?? {};
    return typeof base === 'function' ? base(ctx) : base;
  };

  return async ({
    agentType,
    configuration,
    ctx,
  }: {
    agentType: string;
    configuration: AgentConfiguration;
    ctx: AgentConfigContext;
  }): Promise<AgentConfiguration> => {
    const base = await resolveBaseConfiguration(agentType, ctx);
    return mergeAgentConfiguration(base, configuration);
  };
};

export type ConfigurationResolver = ReturnType<typeof createConfigurationResolver>;
