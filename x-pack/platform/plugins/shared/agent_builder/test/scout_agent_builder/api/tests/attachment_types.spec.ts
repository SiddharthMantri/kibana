/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest } from '../fixtures';
import { COMMON_HEADERS, INTERNAL_AGENT_BUILDER } from '../fixtures/constants';

apiTest.describe(
  'Agent Builder — registered attachment types',
  { tag: [...tags.stateful.classic, ...tags.serverless.search] },
  () => {
    let adminInteractiveCookieHeader: Record<string, string>;

    apiTest.beforeAll(async ({ samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
      adminInteractiveCookieHeader = cookieHeader;
    });

    apiTest(
      'GET /internal/attachments/_types lists all registered attachment types',
      async ({ apiClient, log }) => {
        const response = await apiClient.get(`${INTERNAL_AGENT_BUILDER}/attachments/_types`, {
          headers: { ...COMMON_HEADERS, ...adminInteractiveCookieHeader },
          responseType: 'json',
        });

        expect(response).toHaveStatusCode(200);
        const { types } = response.body as { types: string[] };
        expect(Array.isArray(types)).toBe(true);
        expect(types.length).toBeGreaterThan(0);

        log.info(`${types.length} registered attachment types:`);
        for (const type of [...types].sort()) {
          log.info(`  - ${type}`);
        }
      }
    );
  }
);
