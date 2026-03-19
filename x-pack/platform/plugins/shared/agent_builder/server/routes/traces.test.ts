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
import type { InternalStartServices } from '../services';
import { internalApiPath } from '../../common/constants';
import type { TracesClient, TracesListResponseBody } from '../services/traces';

const createMockContext = () => ({
  licensing: Promise.resolve({
    license: { status: 'active', hasAtLeast: jest.fn().mockReturnValue(true) },
  }),
});

type Handler = (ctx: unknown, req: unknown, res: unknown) => Promise<unknown>;
let routeHandlers: Record<string, Handler>;

const mockListTraces = jest.fn<Promise<TracesListResponseBody>, []>();
const mockGetTraceById = jest.fn<Promise<Record<string, unknown> | undefined>, []>();
const mockGetScopedClient = jest.fn<
  TracesClient,
  [
    {
      request: unknown;
    },
  ]
>();

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
    getStartServices: jest.fn(),
  };
  const mockTracesService = {
    getScopedClient: mockGetScopedClient,
  };
  const mockGetInternalServices = () =>
    ({
      traces: mockTracesService,
    } as unknown as InternalStartServices);

  registerTracesRoutes({
    router: mockRouter,
    coreSetup: mockCoreSetup as unknown as RouteDependencies['coreSetup'],
    getInternalServices: mockGetInternalServices,
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
    mockGetScopedClient.mockReturnValue({
      listTraces: mockListTraces,
      getTraceById: mockGetTraceById,
    });
    setupRoutes();
  });

  describe(`GET ${listPath}`, () => {
    const getListHandler = () => routeHandlers[`GET:${listPath}`];

    it('returns list traces payload from traces service', async () => {
      const servicePayload: TracesListResponseBody = {
        total: 1,
        results: [{ _id: 'doc-1', trace_id: 'trace-abc' }],
      };
      mockListTraces.mockResolvedValueOnce(servicePayload);

      const request = {
        params: { agent_id: 'agent-1' },
        query: { size: 20, from: 0 },
      };

      const result = (await getListHandler()(createMockContext(), request, {
        ok: jest.fn((params: { body?: unknown }) => ({ status: 200, payload: params.body })),
      })) as {
        status: number;
        payload: { total: number; results: unknown[] };
      };

      expect(result.status).toBe(200);
      expect(result.payload.total).toBe(1);
      expect(result.payload.results).toHaveLength(1);
      expect(mockGetScopedClient).toHaveBeenCalledWith({ request });
      expect(mockListTraces).toHaveBeenCalledTimes(1);
    });
  });

  describe(`GET ${singlePath}`, () => {
    const getSingleHandler = () => routeHandlers[`GET:${singlePath}`];

    it('returns 404 when traces service does not find a trace', async () => {
      mockGetTraceById.mockResolvedValueOnce(undefined);

      const result = (await getSingleHandler()(
        createMockContext(),
        { params: { trace_id: 'missing-trace' } },
        {
          ok: jest.fn((params: { body?: unknown }) => ({ status: 200, payload: params.body })),
          notFound: jest.fn((params?: { body?: { message?: string } }) => ({
            status: 404,
            payload: params?.body,
          })),
        }
      )) as { status: number };

      expect(result.status).toBe(404);
      expect(mockGetTraceById).toHaveBeenCalledTimes(1);
    });

    it('returns trace document from traces service', async () => {
      mockGetTraceById.mockResolvedValueOnce({
        _id: 'doc-1',
        trace_id: 'trace-abc',
        spans: [{ span_id: 'span-1', name: 'Converse' }],
      });

      const request = { params: { trace_id: 'trace-abc' } };
      const result = (await getSingleHandler()(
        createMockContext(),
        request,
        {
          ok: jest.fn((params: { body?: unknown }) => ({ status: 200, payload: params.body })),
          notFound: jest.fn((params?: { body?: { message?: string } }) => ({
            status: 404,
            payload: params?.body,
          })),
        }
      )) as { status: number; payload: Record<string, unknown> };

      expect(result.status).toBe(200);
      expect(result.payload.trace_id).toBe('trace-abc');
      expect(result.payload._id).toBe('doc-1');
      expect(mockGetScopedClient).toHaveBeenCalledWith({ request });
    });
  });
});
