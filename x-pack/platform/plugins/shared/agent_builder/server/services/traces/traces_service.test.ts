/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { createTracesService } from './traces_service';

const mockSearch = jest.fn();
const mockGetClient = jest.fn().mockReturnValue({ search: mockSearch });

jest.mock('../../tracing/trace_index_manager', () => ({
  createTraceStorage: jest.fn(() => ({ getClient: mockGetClient })),
}));

/**
 * Builds a started traces service with lightweight start dependencies.
 */
const createStartedService = () => {
  const tracesService = createTracesService();
  tracesService.setup();

  const start = tracesService.start({
    logger: loggingSystemMock.createLogger(),
    elasticsearch: {
      client: {
        asScoped: jest.fn().mockReturnValue({ asInternalUser: {} }),
      },
    } as any,
    spaces: {
      spacesService: {
        getSpaceId: jest.fn().mockReturnValue('test-space'),
      },
    } as any,
  });

  return { start };
};

describe('TracesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('#listTraces', () => {
    it('applies agent, space, and conversation filters', async () => {
      mockSearch.mockResolvedValueOnce({
        hits: {
          total: { value: 1 },
          hits: [{ _id: 'doc-1', _source: { trace_id: 'trace-1', agent_id: 'agent-1' } }],
        },
      });

      const { start } = createStartedService();
      const client = start.getScopedClient({
        request: {
          params: { agent_id: 'agent-1' },
          query: { size: 20, from: 0, conversation_id: 'conv-1' },
        } as any,
      });

      const response = await client.listTraces();

      expect(response.total).toBe(1);
      expect(response.results).toEqual(
        expect.arrayContaining([expect.objectContaining({ _id: 'doc-1', trace_id: 'trace-1' })])
      );
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          size: 20,
          from: 0,
          _source: { excludes: ['spans'] },
          query: {
            bool: {
              filter: expect.arrayContaining([
                { term: { agent_id: 'agent-1' } },
                { term: { space_id: 'test-space' } },
                { term: { conversation_id: 'conv-1' } },
              ]),
            },
          },
        })
      );
    });

    it('normalizes numeric total hits from ES', async () => {
      mockSearch.mockResolvedValueOnce({
        hits: {
          total: 0,
          hits: [],
        },
      });

      const { start } = createStartedService();
      const client = start.getScopedClient({
        request: {
          params: { agent_id: 'agent-1' },
          query: { size: 20, from: 0 },
        } as any,
      });

      const response = await client.listTraces();
      expect(response).toEqual({ total: 0, results: [] });
    });
  });

  describe('#getTraceById', () => {
    it('returns undefined when no trace matches', async () => {
      mockSearch.mockResolvedValueOnce({ hits: { hits: [] } });

      const { start } = createStartedService();
      const client = start.getScopedClient({
        request: {
          params: { trace_id: 'missing-trace' },
        } as any,
      });

      const result = await client.getTraceById();
      expect(result).toBeUndefined();
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          size: 1,
          query: {
            bool: {
              filter: expect.arrayContaining([
                { term: { trace_id: 'missing-trace' } },
                { term: { space_id: 'test-space' } },
              ]),
            },
          },
        })
      );
    });

    it('returns the trace document when found', async () => {
      mockSearch.mockResolvedValueOnce({
        hits: {
          hits: [{ _id: 'doc-7', _source: { trace_id: 'trace-7', spans: [] } }],
        },
      });

      const { start } = createStartedService();
      const client = start.getScopedClient({
        request: {
          params: { trace_id: 'trace-7' },
        } as any,
      });

      const result = await client.getTraceById();
      expect(result).toEqual(
        expect.objectContaining({
          _id: 'doc-7',
          trace_id: 'trace-7',
        })
      );
    });
  });
});
