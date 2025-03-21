/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';

import {
  getNonMigratedSignalsInfo,
  checkIfMigratedIndexOutdated,
} from './get_non_migrated_signals_info';
import { getIndexVersionsByIndex } from './get_index_versions_by_index';
import { getSignalVersionsByIndex } from './get_signal_versions_by_index';
import { getLatestIndexTemplateVersion } from './get_latest_index_template_version';
import { getIndexAliasPerSpace } from './get_index_alias_per_space';

jest.mock('./get_index_versions_by_index', () => ({ getIndexVersionsByIndex: jest.fn() }));
jest.mock('./get_signal_versions_by_index', () => ({ getSignalVersionsByIndex: jest.fn() }));
jest.mock('./get_latest_index_template_version', () => ({
  getLatestIndexTemplateVersion: jest.fn(),
}));
jest.mock('./get_index_alias_per_space', () => ({ getIndexAliasPerSpace: jest.fn() }));

const getIndexVersionsByIndexMock = getIndexVersionsByIndex as jest.Mock;
const getSignalVersionsByIndexMock = getSignalVersionsByIndex as jest.Mock;
const getLatestIndexTemplateVersionMock = getLatestIndexTemplateVersion as jest.Mock;
const getIndexAliasPerSpaceMock = getIndexAliasPerSpace as jest.Mock;

const TEMPLATE_VERSION = 77;

describe('getNonMigratedSignalsInfo', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  const logger = loggerMock.create();

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();

    getLatestIndexTemplateVersionMock.mockReturnValue(TEMPLATE_VERSION);
    getIndexVersionsByIndexMock.mockReturnValue({
      '.siem-signals-another-1-legacy': 10,
      '.siem-signals-default-old-one': 42,
    });
    getSignalVersionsByIndexMock.mockReturnValue({
      '.siem-signals-another-1-legacy': [{ count: 2, version: 10 }],
    });
    getIndexAliasPerSpaceMock.mockReturnValue({
      '.siem-signals-another-1-legacy': {
        alias: '.siem-signals-another-1',
        indexName: '.siem-signals-another-1-legacy',
        space: 'another-1',
      },
      '.siem-signals-default-old-one': {
        alias: '.siem-signals-default',
        indexName: '.siem-signals-default-old-one',
        space: 'default',
      },
    });
  });

  it('returns empty results if no siem indices found', async () => {
    getIndexAliasPerSpaceMock.mockReturnValue({});

    const result = await getNonMigratedSignalsInfo({
      esClient,
      signalsIndex: 'siem-signals',
      logger,
    });

    expect(result).toEqual({
      isMigrationRequired: false,
      spaces: [],
      indices: [],
    });
  });

  it('returns empty when error happens', async () => {
    getLatestIndexTemplateVersionMock.mockRejectedValueOnce(new Error('Test failure'));
    const debugSpy = jest.spyOn(logger, 'debug');

    const result = await getNonMigratedSignalsInfo({
      esClient,
      signalsIndex: 'siem-signals',
      logger,
    });

    expect(result).toEqual({
      isMigrationRequired: false,
      spaces: [],
      indices: [],
    });
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Test failure'));
  });

  it('returns empty results if no siem indices or signals outdated', async () => {
    getIndexVersionsByIndexMock.mockReturnValue({
      '.siem-signals-another-1-legacy': TEMPLATE_VERSION,
      '.siem-signals-default-old-one': TEMPLATE_VERSION,
    });
    getSignalVersionsByIndexMock.mockReturnValue({
      '.siem-signals-another-1-legacy': [{ count: 2, version: TEMPLATE_VERSION }],
    });

    const result = await getNonMigratedSignalsInfo({
      esClient,
      signalsIndex: 'siem-signals',
      logger,
    });

    expect(result).toEqual({
      isMigrationRequired: false,
      spaces: [],
      indices: [],
    });
  });
  it('returns results for outdated index', async () => {
    getIndexVersionsByIndexMock.mockReturnValue({
      '.siem-signals-another-1-legacy': TEMPLATE_VERSION,
      '.siem-signals-default-old-one': 16,
    });
    getSignalVersionsByIndexMock.mockReturnValue({
      '.siem-signals-another-1-legacy': [{ count: 2, version: TEMPLATE_VERSION }],
    });

    const result = await getNonMigratedSignalsInfo({
      esClient,
      signalsIndex: 'siem-signals',
      logger,
    });

    expect(result).toEqual({
      indices: ['.siem-signals-default-old-one'],
      isMigrationRequired: true,
      spaces: ['default'],
    });
  });
  it('return empty result for migrated in v8 index', async () => {
    getIndexAliasPerSpaceMock.mockReturnValue({
      '.reindexed-v8-siem-signals-another-1-000001': {
        alias: '.siem-signals-another-1',
        indexName: '.reindexed-v8-siem-signals-another-1-000001',
        space: 'another-1-000001',
      },
      '.siem-signals-another-1-000002': {
        alias: '.siem-signals-another-1',
        indexName: '.siem-signals-another-1-000002',
        space: 'another-1',
      },
    });

    getIndexVersionsByIndexMock.mockReturnValue({
      '.reindexed-v8-siem-signals-another-1-000001': 57,
      '.siem-signals-another-1-000002': TEMPLATE_VERSION,
      '.reindexed-v8-siem-signals-another-1-000001-r000077': TEMPLATE_VERSION, // outdated .reindexed-v8-siem-signals-another-1-000001 is already migrated
    });
    getSignalVersionsByIndexMock.mockReturnValue({});

    const result = await getNonMigratedSignalsInfo({
      esClient,
      signalsIndex: 'siem-signals',
      logger,
    });

    expect(result).toEqual({
      indices: [],
      isMigrationRequired: false,
      spaces: [],
    });
  });
  it('returns results for outdated signals in index', async () => {
    getIndexVersionsByIndexMock.mockReturnValue({
      '.siem-signals-another-1-legacy': TEMPLATE_VERSION,
      '.siem-signals-default-old-one': TEMPLATE_VERSION,
    });
    getSignalVersionsByIndexMock.mockReturnValue({
      '.siem-signals-another-1-legacy': [{ count: 2, version: 12 }],
    });

    const result = await getNonMigratedSignalsInfo({
      esClient,
      signalsIndex: 'siem-signals',
      logger,
    });

    expect(result).toEqual({
      indices: ['.siem-signals-another-1-legacy'],
      isMigrationRequired: true,
      spaces: ['another-1'],
    });
  });
  it('returns indices in multiple spaces', async () => {
    getIndexVersionsByIndexMock.mockReturnValue({
      '.siem-signals-another-1-legacy': 11,
      '.siem-signals-default-old-one': 11,
    });
    getSignalVersionsByIndexMock.mockReturnValue({
      '.siem-signals-another-1-legacy': [{ count: 2, version: 11 }],
    });

    const result = await getNonMigratedSignalsInfo({
      esClient,
      signalsIndex: 'siem-signals',
      logger,
    });

    expect(result).toEqual({
      indices: ['.siem-signals-another-1-legacy', '.siem-signals-default-old-one'],
      isMigrationRequired: true,
      spaces: ['another-1', 'default'],
    });
  });
});

describe('checkIfMigratedIndexOutdated', () => {
  const indexVersionsByIndex = {
    '.siem-signals-default-000001': 57,
    '.siem-signals-another-6-000001': 57,
    '.siem-signals-default-000002': 77,
    '.siem-signals-another-5-000001': 57,
    '.reindexed-v8-siem-signals-another-1-000001': 57,
    '.siem-signals-another-7-000001': 57,
    '.reindexed-v8-siem-signals-another-2-000001': 57,
    '.siem-signals-another-3-000001': 57,
    '.reindexed-v8-siem-signals-another-4-000001': 57,
    '.siem-signals-another-3-000002': 77,
    '.siem-signals-another-9-000001': 57,
    '.siem-signals-another-8-000001': 57,
    '.siem-signals-another-2-000002': 77,
    '.siem-signals-another-10-000001': 57,
    '.siem-signals-another-1-000002': 77,
    '.siem-signals-another-2-000001-r000077': 77,
    '.reindexed-v8-siem-signals-another-1-000001-r000077': 77,
  };

  const migratedIndices = [
    '.reindexed-v8-siem-signals-another-1-000001',
    '.reindexed-v8-siem-signals-another-2-000001',
    '.reindexed-v8-siem-signals-another-1-000001-r000077',
  ];

  migratedIndices.forEach((index) => {
    it(`should correctly find index "${index}" is migrated`, () => {
      expect(checkIfMigratedIndexOutdated(index, indexVersionsByIndex, TEMPLATE_VERSION)).toBe(
        false
      );
    });
  });

  it('should find non migrated index', () => {
    expect(
      checkIfMigratedIndexOutdated(
        '.reindexed-v8-siem-signals-another-4-000001',
        indexVersionsByIndex,
        TEMPLATE_VERSION
      )
    ).toBe(true);
  });
});
