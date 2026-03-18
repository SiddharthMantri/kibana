/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { registerTracesRoutes } from './traces';
import type { RouteDependencies } from './types';
import { internalApiPath } from '../../common/constants';

// ---------------------------------------------------------------------------
// Mock createTraceStorage so we can control search results without ES
// ---------------------------------------------------------------------------

const mockSearch = jest.fn();
const mockGetClient = jest.fn().mockReturnValue({ search: mockSearch });

jest.mock('../tracing/trace_index_manager', () => ({
  createTraceStorage: jest.fn(() => ({ getClient: mockGetClient })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMockContext = (spaceId = 'default') => ({
  agentBuilder: Promise.resolve({
    spaces: { getSpaceId: jest.fn().mockReturnValue(spaceId) },
  }),
  licensing: Promise.resolve({
    license: { status: 'active', hasAtLeast: jest.fn().mockReturnValue(true) },
  }),
});

const mockResponse = {
  ok: jest.fn((params: { body?: unknown }) => ({ status: 200, payload: params.body })),
  notFound: jest.fn((params?: { body?: { message?: string } }) => ({
    status: 404,
    payload: params?.body,
  })),
  badRequest: jest.fn((params?: { body?: { message?: string } }) => ({
    status: 400,
    payload: params?.body,
  })),
  internalError: jest.fn((params?: { body?: { message?: string } }) => ({
    status: 500,
    payload: params?.body,
  })),
};

const makeTraceDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: 'doc-1',
  _source: {
    trace_id: 'trace-abc',
    agent_id: 'agent-1',
    conversation_id: 'conv-1',
    space_id: 'default',
    '@timestamp': '2025-01-01T00:00:00Z',
    duration_ms: 1500,
    status: 'OK',
    span_count: 3,
    total_input_tokens: 50,
    total_output_tokens: 20,
    spans: [],
    ...overrides,
  },
});

// ---------------------------------------------------------------------------
// Route handler capture
// ---------------------------------------------------------------------------

type Handler = (ctx: unknown, req: unknown, res: unknown) => Promise<unknown>;
let routeHandlers: Record<string, Handler>;

const setupRoutes = () => {
  routeHandlers = {};

  const createVersionedRoute = (method: string, path: string) => ({
    addVersion: jest.fn().mockImplementation((_config: unknown, handler: Handler) => {
      routeHandlers[`${method}:${path}`] = handler;
      return { addVersion: jest.fn() };
    }),
  });

  const mockRouter = {
    versioned: {
      get: jest
        .fn()
        .mockImplementation((config: { path: string }) =>
          createVersionedRoute('GET', config.path)
        ),
    },
  } as unknown as jest.Mocked<IRouter>;

  const mockCoreSetup = {
    getStartServices: jest.fn().mockResolvedValue([
      { elasticsearch: { client: { asInternalUser: {} } } },
    ]),
  };

  registerTracesRoutes({
    router: mockRouter,
    coreSetup: mockCoreSetup as unknown as RouteDependencies['coreSetup'],
    logger: loggingSystemMock.createLogger(),
  } as unknown as RouteDependencies);

  return { mockRouter };
};

const listPath = `${internalApiPath}/agents/{agent_id}/traces`;
const singlePath = `${internalApiPath}/traces/{trace_id}`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Traces routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupRoutes();
  });

  describe(`GET ${listPath}`, () => {
    const getListHandler = () => routeHandlers[`GET:${listPath}`];

    it('returns paginated traces for an agent filtered by space', async () => {
      const doc = makeTraceDoc();
      mockSearch.mockResolvedValueOnce({
        hits: {
          total: { value: 1 },
          hits: [doc],
        },
      });

      const ctx = createMockContext('default');
      const request = {
        params: { agent_id: 'agent-1' },
        query: { size: 20, from: 0 },
      };

      const result = (await getListHandler()(ctx, request, mockResponse)) as {
        status: number;
        payload: { total: number; results: unknown[] };
      };

      expect(result.status).toBe(200);
      expect(result.payload.total).toBe(1);
      expect(result.payload.results).toHaveLength(1);
    });

    it('includes conversation_id filter when provided', async () => {
      mockSearch.mockResolvedValueOnce({ hits: { total: 0, hits: [] } });

      const ctx = createMockContext();
      const request = {
        params: { agent_id: 'agent-1' },
        query: { size: 20, from: 0, conversation_id: 'conv-xyz' },
      };

      await getListHandler()(ctx, request, mockResponse);

      const searchCall = mockSearch.mock.calls[0][0];
      const filters = searchCall.query.bool.filter;
      expect(filters).toEqual(
        expect.arrayContaining([{ term: { conversation_id: 'conv-xyz' } }])
      );
    });

    it('always filters by agent_id and space_id', async () => {
      mockSearch.mockResolvedValueOnce({ hits: { total: 0, hits: [] } });

      await getListHandler()(
        createMockContext('my-space'),
        { params: { agent_id: 'agent-42' }, query: { size: 10, from: 0 } },
        mockResponse
      );

      const filters = mockSearch.mock.calls[0][0].query.bool.filter;
      expect(filters).toEqual(
        expect.arrayContaining([
          { term: { agent_id: 'agent-42' } },
          { term: { space_id: 'my-space' } },
        ])
      );
    });

    it('excludes spans array from list results', async () => {
      mockSearch.mockResolvedValueOnce({ hits: { total: 0, hits: [] } });

      await getListHandler()(
        createMockContext(),
        { params: { agent_id: 'agent-1' }, query: { size: 20, from: 0 } },
        mockResponse
      );

      expect(mockSearch.mock.calls[0][0]._source).toEqual({ excludes: ['spans'] });
    });

    it('returns total as 0 when no hits', async () => {
      mockSearch.mockResolvedValueOnce({ hits: { total: 0, hits: [] } });

      const result = (await getListHandler()(
        createMockContext(),
        { params: { agent_id: 'agent-1' }, query: { size: 20, from: 0 } },
        mockResponse
      )) as { payload: { total: number; results: unknown[] } };

      expect(result.payload.total).toBe(0);
      expect(result.payload.results).toHaveLength(0);
    });
  });

  describe(`GET ${singlePath}`, () => {
    const getSingleHandler = () => routeHandlers[`GET:${singlePath}`];

    it('returns 404 when no trace found', async () => {
      mockSearch.mockResolvedValueOnce({ hits: { hits: [] } });

      const result = (await getSingleHandler()(
        createMockContext(),
        { params: { trace_id: 'missing-trace' } },
        mockResponse
      )) as { status: number };

      expect(result.status).toBe(404);
    });

    it('returns trace document when found', async () => {
      const doc = makeTraceDoc({ spans: [{ span_id: 'span-1', name: 'Converse' }] });
      mockSearch.mockResolvedValueOnce({ hits: { hits: [doc] } });

      const result = (await getSingleHandler()(
        createMockContext(),
        { params: { trace_id: 'trace-abc' } },
        mockResponse
      )) as { status: number; payload: Record<string, unknown> };

      expect(result.status).toBe(200);
      expect(result.payload.trace_id).toBe('trace-abc');
      expect(result.payload._id).toBe('doc-1');
    });

    it('filters by trace_id and space_id', async () => {
      mockSearch.mockResolvedValueOnce({ hits: { hits: [] } });

      await getSingleHandler()(
        createMockContext('prod-space'),
        { params: { trace_id: 'trace-xyz' } },
        mockResponse
      );

      const filters = mockSearch.mock.calls[0][0].query.bool.filter;
      expect(filters).toEqual(
        expect.arrayContaining([
          { term: { trace_id: 'trace-xyz' } },
          { term: { space_id: 'prod-space' } },
        ])
      );
    });
  });
});
