/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MouseEvent } from 'react';
import React from 'react';
import { waitFor, renderHook } from '@testing-library/react';
import { useNavigationProps } from './use_navigation_props';
import type { DataView } from '@kbn/data-views-plugin/public';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverTestProvider } from '../__mocks__/test_provider';
import type { DiscoverServices } from '../build_services';
import { createDiscoverServicesMock } from '../__mocks__/services';

const mockServices = {
  ...createDiscoverServicesMock(),
  singleDocLocator: { getRedirectUrl: jest.fn(() => 'mock-doc-redirect-url'), navigate: jest.fn() },
  contextLocator: {
    getRedirectUrl: jest.fn(() => 'mock-context-redirect-url'),
    navigate: jest.fn(),
  },
  locator: {
    getUrl: jest.fn(() => Promise.resolve('mock-referrer')),
    useUrl: jest.fn(() => 'mock-referrer'),
  },
  filterManager: {
    getAppFilters: jest.fn(() => []),
    getGlobalFilters: jest.fn(() => []),
  },
  data: {
    query: {
      queryString: { getQuery: jest.fn(() => ({ query: 'response:200', language: 'kuery' })) },
      timefilter: { timefilter: { getTime: jest.fn(() => ({ from: 'now-15m', to: 'now' })) } },
    },
  },
} as unknown as DiscoverServices;
const mockContextLocatorNavigate = jest.spyOn(mockServices.contextLocator, 'navigate');
const mockSingleDocLocatorNavigate = jest.spyOn(mockServices.singleDocLocator, 'navigate');

const dataViewMock = {
  id: '1',
  title: 'test',
  fields: [],
  isPersisted: () => false,
  toSpec: () => ({
    id: '1',
    title: 'test',
    fields: [],
  }),
} as unknown as DataView;

const render = async () => {
  const renderResult = renderHook(
    () =>
      useNavigationProps({
        dataView: dataViewMock,
        rowIndex: 'mock-index',
        rowId: 'mock-id',
        columns: ['mock-column'],
      }),
    {
      wrapper: ({ children }: React.PropsWithChildren<{}>) => (
        <MemoryRouter initialEntries={['/']}>
          <DiscoverTestProvider services={mockServices}>{children}</DiscoverTestProvider>
        </MemoryRouter>
      ),
    }
  );
  await waitFor(() => new Promise((resolve) => resolve(null)));
  return renderResult;
};

describe('useNavigationProps', () => {
  it('should call context and single doc callbacks with correct params', async () => {
    const { result } = await render();
    const commonParams = {
      index: {
        id: '1',
        title: 'test',
        fields: [],
      },
      rowId: 'mock-id',
      referrer: 'mock-referrer',
    };

    await result.current.onOpenContextView({ preventDefault: jest.fn() } as unknown as MouseEvent);
    expect(mockContextLocatorNavigate.mock.calls[0][0]).toEqual({
      ...commonParams,
      columns: ['mock-column'],
      filters: [],
    });

    await result.current.onOpenSingleDoc({ preventDefault: jest.fn() } as unknown as MouseEvent);
    expect(mockSingleDocLocatorNavigate.mock.calls[0][0]).toEqual({
      ...commonParams,
      rowIndex: 'mock-index',
    });
  });

  test('should create valid links to the context and single doc pages', async () => {
    const { result } = await render();

    expect(result.current.singleDocHref).toMatchInlineSnapshot(`"mock-doc-redirect-url"`);
    expect(result.current.contextViewHref).toMatchInlineSnapshot(`"mock-context-redirect-url"`);
  });
});
