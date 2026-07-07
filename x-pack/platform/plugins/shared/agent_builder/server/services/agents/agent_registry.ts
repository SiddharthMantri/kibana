/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MaybePromise } from '@kbn/utility-types';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { Logger } from '@kbn/logging';
import {
  createAgentNotFoundError,
  createAgentUnavailableError,
  createBadRequestError,
  chatAgentTypeId,
  mergeAgentConfiguration,
  type AgentBaseConfiguration,
  type AgentConfiguration,
  type AgentAccessControl,
} from '@kbn/agent-builder-common';
import { validateAgentId } from '@kbn/agent-builder-common/agents';
import type {
  AgentAvailabilityContext,
  AgentAvailabilityResult,
  AgentTypeRegistry,
} from '@kbn/agent-builder-server/agents';
import type { UiSettingsServiceStart } from '@kbn/core-ui-settings-server';
import type { SavedObjectsServiceStart } from '@kbn/core-saved-objects-server';
import type {
  AgentAccessControlUpdateRequest,
  AgentCreateRequest,
  AgentListOptions,
  AgentDeleteRequest,
  AgentUpdateRequest,
} from '../../../common/agents';
import type { AgentDefinitionWithPermissions } from '../../../common/http_api/agents';
import type {
  AgentAccessControlResult,
  GetAgentOptions,
  WritableAgentProvider,
  ReadonlyAgentProvider,
} from './agent_source';
import { isReadonlyProvider } from './agent_source';

// internal definition for our agents
export type InternalAgentDefinition = AgentDefinitionWithPermissions & {
  isAvailable: InternalAgentDefinitionAvailabilityHandler;
};

/**
 * An agent as returned by the registry: the provider-level definition plus the
 * effective configuration, computed by merging the agent type's base configuration
 * under the agent's own `configuration` (which stays the raw, editable delta).
 */
export type ResolvedAgentDefinition = InternalAgentDefinition & {
  effective_configuration: AgentConfiguration;
};

export type InternalAgentDefinitionAvailabilityHandler = (
  ctx: AgentAvailabilityContext
) => MaybePromise<AgentAvailabilityResult>;

export interface AgentRegistry {
  has(agentId: string): Promise<boolean>;
  /**
   * Fetch an agent and assert the caller has at least `opts.access` rights (default: 'read').
   * Throws `agentNotFound` if the agent doesn't exist OR the caller lacks the requested access.
   */
  get(agentId: string, opts?: GetAgentOptions): Promise<ResolvedAgentDefinition>;
  list(opts?: AgentListOptions): Promise<ResolvedAgentDefinition[]>;
  getIds(opts?: AgentListOptions): Promise<string[]>;
  create(createRequest: AgentCreateRequest): Promise<ResolvedAgentDefinition>;
  update(agentId: string, update: AgentUpdateRequest): Promise<ResolvedAgentDefinition>;
  delete(args: AgentDeleteRequest): Promise<boolean>;
  getAccessControl(agentId: string): Promise<AgentAccessControlResult>;
  updateAccessControl(
    agentId: string,
    update: AgentAccessControlUpdateRequest
  ): Promise<AgentAccessControl>;
}

interface CreateAgentRegistryOpts {
  request: KibanaRequest;
  spaceId: string;
  persistedProvider: WritableAgentProvider;
  builtinProvider: ReadonlyAgentProvider;
  uiSettings: UiSettingsServiceStart;
  savedObjects: SavedObjectsServiceStart;
  typeRegistry: AgentTypeRegistry;
  logger: Logger;
}

export const createAgentRegistry = (opts: CreateAgentRegistryOpts): AgentRegistry => {
  return new AgentRegistryImpl(opts);
};

/**
 * Whether an agent should surface in default listings (agent management page, pickers, ...).
 * Read-only managed built-ins (a non-chat type) are hidden — those are the "managed agents" we
 * keep out of the interactive surfaces. Chat agents and editable (persisted) agents always show,
 * so the admin-editable managed agent stays visible.
 */
const isVisibleAgent = (agent: InternalAgentDefinition): boolean => {
  return agent.type === chatAgentTypeId || !agent.readonly;
};

class AgentRegistryImpl implements AgentRegistry {
  private readonly request: KibanaRequest;
  private readonly spaceId: string;
  private readonly persistedProvider: WritableAgentProvider;
  private readonly builtinProvider: ReadonlyAgentProvider;
  private readonly uiSettings: UiSettingsServiceStart;
  private readonly savedObjects: SavedObjectsServiceStart;
  private readonly typeRegistry: AgentTypeRegistry;
  private readonly logger: Logger;
  private readonly baseConfigCache = new Map<string, Promise<AgentBaseConfiguration>>();

  constructor({
    request,
    spaceId,
    persistedProvider,
    builtinProvider,
    uiSettings,
    savedObjects,
    typeRegistry,
    logger,
  }: CreateAgentRegistryOpts) {
    this.request = request;
    this.spaceId = spaceId;
    this.persistedProvider = persistedProvider;
    this.builtinProvider = builtinProvider;
    this.uiSettings = uiSettings;
    this.savedObjects = savedObjects;
    this.typeRegistry = typeRegistry;
    this.logger = logger;
  }

  private get orderedProviders() {
    return [this.builtinProvider, this.persistedProvider];
  }

  async has(agentId: string): Promise<boolean> {
    for (const provider of this.orderedProviders) {
      if (await provider.has(agentId)) {
        return true;
      }
    }
    return false;
  }

  async get(agentId: string, opts?: GetAgentOptions): Promise<ResolvedAgentDefinition> {
    for (const provider of this.orderedProviders) {
      if (await provider.has(agentId)) {
        const agent = await provider.get(agentId, opts);
        if (!(await this.isAvailable(agent))) {
          throw createAgentUnavailableError({ agentId });
        }
        return this.withEffectiveConfiguration(agent);
      }
    }
    throw createAgentNotFoundError({ agentId });
  }

  async list(opts: AgentListOptions = {}): Promise<ResolvedAgentDefinition[]> {
    const allAgents: InternalAgentDefinition[] = [];

    for (const provider of this.orderedProviders) {
      allAgents.push(...(await this.getAvailableAgents(provider, opts)));
    }

    const visibleAgents = opts.includeManaged ? allAgents : allAgents.filter(isVisibleAgent);

    return Promise.all(visibleAgents.map((agent) => this.withEffectiveConfiguration(agent)));
  }

  async getIds(opts: AgentListOptions = {}): Promise<string[]> {
    const builtinAgents = await this.getAvailableAgents(this.builtinProvider, opts);
    const visibleBuiltinAgents = opts.includeManaged
      ? builtinAgents
      : builtinAgents.filter(isVisibleAgent);
    // Persisted agents are always editable, so they are always visible.
    const persistedAgentIds = await this.persistedProvider.getIds(opts);

    return [...visibleBuiltinAgents.map(({ id }) => id), ...persistedAgentIds];
  }

  async create(createRequest: AgentCreateRequest): Promise<ResolvedAgentDefinition> {
    const { id: agentId } = createRequest;

    const validationError = validateAgentId({ agentId, builtIn: false });
    if (validationError) {
      throw createBadRequestError(`Invalid agent id: "${agentId}": ${validationError}`);
    }

    if (createRequest.type !== undefined && !this.typeRegistry.has(createRequest.type)) {
      throw createBadRequestError(`Unknown agent type: "${createRequest.type}"`);
    }

    if (await this.has(agentId)) {
      throw createBadRequestError(`Agent with id ${agentId} already exists`);
    }

    const agent = await this.persistedProvider.create(createRequest);
    return this.withEffectiveConfiguration(agent);
  }

  async update(agentId: string, update: AgentUpdateRequest): Promise<ResolvedAgentDefinition> {
    for (const provider of this.orderedProviders) {
      if (await provider.has(agentId)) {
        if (isReadonlyProvider(provider)) {
          throw createBadRequestError(`Agent ${agentId} is read-only and can't be updated`);
        } else {
          const agent = await provider.update(agentId, update);
          return this.withEffectiveConfiguration(agent);
        }
      }
    }
    throw createAgentNotFoundError({ agentId });
  }

  async delete({ id: agentId }: AgentDeleteRequest): Promise<boolean> {
    for (const provider of this.orderedProviders) {
      if (await provider.has(agentId)) {
        if (isReadonlyProvider(provider)) {
          throw createBadRequestError(`Agent ${agentId} is read-only and can't be deleted`);
        } else {
          return provider.delete(agentId);
        }
      }
    }
    throw createAgentNotFoundError({ agentId });
  }

  async getAccessControl(agentId: string): Promise<AgentAccessControlResult> {
    for (const provider of this.orderedProviders) {
      if (await provider.has(agentId)) {
        if (isReadonlyProvider(provider)) {
          throw createBadRequestError(
            `Agent ${agentId} is read-only and does not support access control lists`
          );
        }
        return provider.getAccessControl(agentId);
      }
    }
    throw createAgentNotFoundError({ agentId });
  }

  async updateAccessControl(
    agentId: string,
    update: AgentAccessControlUpdateRequest
  ): Promise<AgentAccessControl> {
    for (const provider of this.orderedProviders) {
      if (await provider.has(agentId)) {
        if (isReadonlyProvider(provider)) {
          throw createBadRequestError(
            `Agent ${agentId} is read-only and does not support access control lists`
          );
        }
        return provider.updateAccessControl(agentId, update);
      }
    }
    throw createAgentNotFoundError({ agentId });
  }

  private async withEffectiveConfiguration(
    agent: InternalAgentDefinition
  ): Promise<ResolvedAgentDefinition> {
    const base = await this.resolveBaseConfiguration(agent.type);
    return {
      ...agent,
      effective_configuration: mergeAgentConfiguration(base, agent.configuration),
    };
  }

  private resolveBaseConfiguration(typeId: string): Promise<AgentBaseConfiguration> {
    const cached = this.baseConfigCache.get(typeId);
    if (cached) {
      return cached;
    }

    const resolving = (async () => {
      let type = this.typeRegistry.get(typeId);
      if (!type) {
        this.logger.warn(
          `Agent references unknown agent type "${typeId}", falling back to the "${chatAgentTypeId}" type's base configuration`
        );
        type = this.typeRegistry.get(chatAgentTypeId);
      }
      const base = type?.baseConfiguration;
      if (!base) {
        return {};
      }
      return typeof base === 'function'
        ? await base({ request: this.request, spaceId: this.spaceId })
        : base;
    })();

    this.baseConfigCache.set(typeId, resolving);
    return resolving;
  }

  private async isAvailable(agent: InternalAgentDefinition): Promise<boolean> {
    const soClient = this.savedObjects.getScopedClient(this.request);
    const uiSettingsClient = this.uiSettings.asScopedToClient(soClient);

    const context: AgentAvailabilityContext = {
      spaceId: this.spaceId,
      request: this.request,
      uiSettings: uiSettingsClient,
    };

    const status = await agent.isAvailable(context);
    return status.status === 'available';
  }

  private async getAvailableAgents(
    provider: ReadonlyAgentProvider | WritableAgentProvider,
    opts: AgentListOptions
  ): Promise<InternalAgentDefinition[]> {
    const availableAgents: InternalAgentDefinition[] = [];
    const providerAgents = await provider.list(opts);

    for (const agent of providerAgents) {
      if (await this.isAvailable(agent)) {
        availableAgents.push(agent);
      }
    }

    return availableAgents;
  }
}
