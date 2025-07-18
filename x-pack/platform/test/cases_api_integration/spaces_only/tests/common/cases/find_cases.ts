/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';

import { postCaseReq, findCasesResp } from '../../../../common/lib/mock';
import {
  deleteAllCaseItems,
  findCases,
  createCase,
  getAuthWithSuperUser,
} from '../../../../common/lib/api';

export default ({ getService }: FtrProviderContext): void => {
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const es = getService('es');
  const authSpace1 = getAuthWithSuperUser();

  describe('find_cases', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    it('should return 3 cases in space1', async () => {
      const a = await createCase(supertestWithoutAuth, postCaseReq, 200, authSpace1);
      const b = await createCase(supertestWithoutAuth, postCaseReq, 200, authSpace1);
      const c = await createCase(supertestWithoutAuth, postCaseReq, 200, authSpace1);

      const cases = await findCases({ supertest: supertestWithoutAuth, auth: authSpace1 });

      expect(cases).to.eql({
        ...findCasesResp,
        total: 3,
        cases: [a, b, c],
        count_open_cases: 3,
      });
    });

    it('should return 1 case in space2 when 2 cases were created in space1 and 1 in space2', async () => {
      const authSpace2 = getAuthWithSuperUser('space2');
      const [, , space2Case] = await Promise.all([
        createCase(supertestWithoutAuth, postCaseReq, 200, authSpace1),
        createCase(supertestWithoutAuth, postCaseReq, 200, authSpace1),
        createCase(supertestWithoutAuth, postCaseReq, 200, authSpace2),
      ]);

      const cases = await findCases({ supertest: supertestWithoutAuth, auth: authSpace2 });

      expect(cases).to.eql({
        ...findCasesResp,
        total: 1,
        cases: [space2Case],
        count_open_cases: 1,
      });
    });
  });
};
