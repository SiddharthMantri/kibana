/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  httpServerMock,
  savedObjectsServiceMock,
  uiSettingsServiceMock,
} from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { chatAgentTypeId, ADMIN_INSTRUCTIONS_HEADER } from '@kbn/agent-builder-common';
import type { AgentTypeDefinition, AgentTypeRegistry } from '@kbn/agent-builder-server/agents';
import type { AgentListOptions } from '../../../common/agents';
import { createMockedInternalAgent } from '../../test_utils/agents';
import { createAgentRegistry, type InternalAgentDefinition } from './agent_registry';
import type { ReadonlyAgentProvider, WritableAgentProvider } from './agent_source';

const createTypeRegistryStub = (types: AgentTypeDefinition[] = []): AgentTypeRegistry => {
  const typeMap = new Map<string, AgentTypeDefinition>(types.map((type) => [type.id, type]));
  if (!typeMap.has(chatAgentTypeId)) {
    typeMap.set(chatAgentTypeId, { id: chatAgentTypeId });
  }
  return {
    register: jest.fn(),
    has: (typeId) => typeMap.has(typeId),
    get: (typeId) => typeMap.get(typeId),
    list: () => [...typeMap.values()],
  };
};

const createBuiltinProviderMock = (
  agents: InternalAgentDefinition[] = []
): ReadonlyAgentProvider => ({
  id: 'builtin',
  readonly: true,
  has: (agentId) => agents.some((agent) => agent.id === agentId),
  get: (agentId) => agents.find((agent) => agent.id === agentId)!,
  list: () => agents,
});

const createPersistedProviderMock = (
  agents: InternalAgentDefinition[] = []
): jest.Mocked<WritableAgentProvider> => ({
  id: 'persisted',
  readonly: false,
  has: jest.fn(async (agentId: string) => agents.some((agent) => agent.id === agentId)),
  get: jest.fn(async (agentId: string) => agents.find((agent) => agent.id === agentId)!),
  list: jest.fn(async (_opts: AgentListOptions) => agents),
  getIds: jest.fn(async (_opts: AgentListOptions) => agents.map((agent) => agent.id)),
  create: jest.fn(async (createRequest) =>
    createMockedInternalAgent({ id: createRequest.id, type: createRequest.type ?? chatAgentTypeId })
  ),
  update: jest.fn(async (agentId, update) => {
    const current = agents.find((agent) => agent.id === agentId)!;
    return {
      ...current,
      configuration: { ...current.configuration, ...update.configuration },
    };
  }),
  delete: jest.fn(),
  getAccessControl: jest.fn(),
  updateAccessControl: jest.fn(),
});

const createRegistry = ({
  types,
  builtinAgents = [],
  persistedAgents = [],
  logger = loggerMock.create(),
  persistedProvider,
}: {
  types?: AgentTypeDefinition[];
  builtinAgents?: InternalAgentDefinition[];
  persistedAgents?: InternalAgentDefinition[];
  logger?: ReturnType<typeof loggerMock.create>;
  persistedProvider?: WritableAgentProvider;
} = {}) => {
  return createAgentRegistry({
    request: httpServerMock.createKibanaRequest(),
    spaceId: 'space-1',
    uiSettings: uiSettingsServiceMock.createStartContract(),
    savedObjects: savedObjectsServiceMock.createStartContract(),
    typeRegistry: createTypeRegistryStub(types),
    logger,
    builtinProvider: createBuiltinProviderMock(builtinAgents),
    persistedProvider: persistedProvider ?? createPersistedProviderMock(persistedAgents),
  });
};

const investigationType: AgentTypeDefinition = {
  id: 'investigation',
  baseConfiguration: {
    instructions: 'base instructions',
    skill_ids: ['base-skill'],
    connector_ids: [],
  },
};

describe('AgentRegistry', () => {
  describe('effective configuration resolution', () => {
    it('returns both the raw delta and the merged effective configuration on get', async () => {
      const agent = createMockedInternalAgent({
        id: 'investigator',
        type: 'investigation',
        configuration: { tools: [], skill_ids: ['my-skill'], connector_ids: ['github-1'] },
      });
      const registry = createRegistry({ types: [investigationType], persistedAgents: [agent] });

      const resolved = await registry.get('investigator');

      expect(resolved.configuration).toEqual({
        tools: [],
        skill_ids: ['my-skill'],
        connector_ids: ['github-1'],
      });
      expect(resolved.effective_configuration).toEqual({
        tools: [],
        instructions: 'base instructions',
        skill_ids: ['base-skill', 'my-skill'],
        connector_ids: ['github-1'],
      });
    });

    it('resolves chat agents against an empty base (identity)', async () => {
      const agent = createMockedInternalAgent({
        id: 'chat-agent',
        configuration: { tools: [], instructions: 'mine' },
      });
      const registry = createRegistry({ persistedAgents: [agent] });

      const resolved = await registry.get('chat-agent');

      expect(resolved.effective_configuration).toEqual(resolved.configuration);
    });

    it('get, list, create and update all return the same merged shape', async () => {
      const agent = createMockedInternalAgent({
        id: 'investigator',
        type: 'investigation',
        configuration: { tools: [], instructions: 'delta' },
      });
      const registry = createRegistry({ types: [investigationType], persistedAgents: [agent] });

      const expectedInstructions = `base instructions\n\n${ADMIN_INSTRUCTIONS_HEADER}\ndelta`;

      const fromGet = await registry.get('investigator');
      const fromList = (await registry.list({ includeManaged: true })).find(
        ({ id }) => id === 'investigator'
      );
      const fromUpdate = await registry.update('investigator', {});

      expect(fromGet.effective_configuration.instructions).toBe(expectedInstructions);
      expect(fromList?.effective_configuration.instructions).toBe(expectedInstructions);
      expect(fromUpdate.effective_configuration.instructions).toBe(expectedInstructions);
    });

    it('invokes a function base with the request context and caches it per registry instance', async () => {
      const baseConfiguration = jest.fn().mockResolvedValue({ skill_ids: ['from-fn'] });
      const agentA = createMockedInternalAgent({ id: 'a', type: 'investigation' });
      const agentB = createMockedInternalAgent({ id: 'b', type: 'investigation' });
      const registry = createRegistry({
        types: [{ id: 'investigation', baseConfiguration }],
        persistedAgents: [agentA, agentB],
      });

      const resolvedA = await registry.get('a');
      const resolvedB = await registry.get('b');

      expect(resolvedA.effective_configuration.skill_ids).toEqual(['from-fn']);
      expect(resolvedB.effective_configuration.skill_ids).toEqual(['from-fn']);
      expect(baseConfiguration).toHaveBeenCalledTimes(1);
      expect(baseConfiguration).toHaveBeenCalledWith({
        request: expect.anything(),
        spaceId: 'space-1',
      });
    });

    it('a base change is reflected on the next resolution without touching the stored delta (no migration)', async () => {
      const agent = createMockedInternalAgent({
        id: 'investigator',
        type: 'investigation',
        configuration: { tools: [], skill_ids: ['my-skill'] },
      });

      const before = await createRegistry({
        types: [investigationType],
        persistedAgents: [agent],
      }).get('investigator');
      const after = await createRegistry({
        types: [
          {
            id: 'investigation',
            baseConfiguration: { skill_ids: ['base-skill', 'pagerduty-triage'] },
          },
        ],
        persistedAgents: [agent],
      }).get('investigator');

      expect(before.effective_configuration.skill_ids).toEqual(['base-skill', 'my-skill']);
      expect(after.effective_configuration.skill_ids).toEqual([
        'base-skill',
        'pagerduty-triage',
        'my-skill',
      ]);
      expect(agent.configuration).toEqual({ tools: [], skill_ids: ['my-skill'] });
    });

    it('falls back to the chat base and warns once when the type is not registered', async () => {
      const logger = loggerMock.create();
      const agentA = createMockedInternalAgent({
        id: 'a',
        type: 'ghost',
        configuration: { tools: [], instructions: 'mine' },
      });
      const agentB = createMockedInternalAgent({ id: 'b', type: 'ghost' });
      const registry = createRegistry({ persistedAgents: [agentA, agentB], logger });

      const resolved = await registry.get('a');
      await registry.get('b');

      expect(resolved.effective_configuration).toEqual(resolved.configuration);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('"ghost"'));
    });
  });

  describe('agent visibility', () => {
    // built-in agents are always read-only; the managed built-in is the one we hide
    const readOnlyManagedAgent = createMockedInternalAgent({
      id: 'managed-builtin',
      type: 'investigation',
      readonly: true,
    });
    const chatAgent = createMockedInternalAgent({ id: 'chat-agent', readonly: false });
    // the seeded, admin-editable managed agent — must stay visible
    const editableManagedAgent = createMockedInternalAgent({
      id: 'nightshift-investigator',
      type: 'investigation',
      readonly: false,
    });

    const createVisibilityRegistry = () =>
      createRegistry({
        types: [investigationType],
        builtinAgents: [readOnlyManagedAgent],
        persistedAgents: [chatAgent, editableManagedAgent],
      });

    it('hides read-only managed built-ins but shows editable managed agents in list', async () => {
      const agents = await createVisibilityRegistry().list();

      expect(agents.map(({ id }) => id)).toEqual(['chat-agent', 'nightshift-investigator']);
    });

    it('includes read-only managed built-ins in list when includeManaged is true', async () => {
      const agents = await createVisibilityRegistry().list({ includeManaged: true });

      expect(agents.map(({ id }) => id)).toEqual([
        'managed-builtin',
        'chat-agent',
        'nightshift-investigator',
      ]);
    });

    it('applies the same visibility rule to getIds', async () => {
      const registry = createVisibilityRegistry();

      expect(await registry.getIds()).toEqual(['chat-agent', 'nightshift-investigator']);
      expect(await registry.getIds({ includeManaged: true })).toEqual([
        'managed-builtin',
        'chat-agent',
        'nightshift-investigator',
      ]);
    });

    it('still resolves hidden read-only managed agents by id', async () => {
      const resolved = await createVisibilityRegistry().get('managed-builtin');

      expect(resolved.id).toBe('managed-builtin');
      expect(resolved.effective_configuration.skill_ids).toEqual(['base-skill']);
    });
  });

  describe('create', () => {
    it('rejects an unknown agent type', async () => {
      const registry = createRegistry();

      await expect(
        registry.create({
          id: 'new-agent',
          type: 'unknown-type',
          name: 'New agent',
          description: 'desc',
          configuration: { tools: [] },
        })
      ).rejects.toThrow('Unknown agent type: "unknown-type"');
    });

    it('accepts a registered type and returns the merged configuration', async () => {
      const registry = createRegistry({ types: [investigationType] });

      const created = await registry.create({
        id: 'new-agent',
        type: 'investigation',
        name: 'New agent',
        description: 'desc',
        configuration: { tools: [] },
      });

      expect(created.type).toBe('investigation');
      expect(created.effective_configuration.skill_ids).toEqual(['base-skill']);
      expect(created.effective_configuration.connector_ids).toEqual([]);
    });
  });

  describe('update', () => {
    it('passes only the caller-provided delta to the persisted provider (base values never persisted)', async () => {
      const agent = createMockedInternalAgent({
        id: 'investigator',
        type: 'investigation',
        configuration: { tools: [], skill_ids: ['my-skill'] },
      });
      const persistedProvider = createPersistedProviderMock([agent]);
      const registry = createRegistry({ types: [investigationType], persistedProvider });

      const update = { configuration: { skill_ids: ['my-skill', 'another-skill'] } };
      await registry.update('investigator', update);

      expect(persistedProvider.update).toHaveBeenCalledWith('investigator', update);
    });

    it('repeated read-modify-write of the delta never grows it with base values', async () => {
      let stored = createMockedInternalAgent({
        id: 'investigator',
        type: 'investigation',
        configuration: { tools: [], instructions: 'my instructions' },
      });
      const persistedProvider = createPersistedProviderMock([]);
      persistedProvider.has.mockImplementation(async (id) => id === 'investigator');
      persistedProvider.get.mockImplementation(async () => stored);
      persistedProvider.update.mockImplementation(async (_id, update) => {
        stored = {
          ...stored,
          configuration: { ...stored.configuration, ...update.configuration },
        };
        return stored;
      });
      const registry = createRegistry({ types: [investigationType], persistedProvider });

      for (let i = 0; i < 2; i++) {
        const current = await registry.get('investigator');
        await registry.update('investigator', { configuration: current.configuration });
      }

      expect(stored.configuration).toEqual({ tools: [], instructions: 'my instructions' });
    });
  });
});
