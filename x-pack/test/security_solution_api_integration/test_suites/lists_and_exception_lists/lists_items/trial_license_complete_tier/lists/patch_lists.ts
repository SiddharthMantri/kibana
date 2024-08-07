/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import type { PatchListSchema, ListSchema } from '@kbn/securitysolution-io-ts-list-types';
import { LIST_URL } from '@kbn/securitysolution-list-constants';

import { getCreateMinimalListSchemaMock } from '@kbn/lists-plugin/common/schemas/request/create_list_schema.mock';
import { getListResponseMockWithoutAutoGeneratedValues } from '@kbn/lists-plugin/common/schemas/response/list_schema.mock';
import { getUpdateMinimalListSchemaMock } from '@kbn/lists-plugin/common/schemas/request/update_list_schema.mock';
import TestAgent from 'supertest/lib/agent';
import {
  createListsIndex,
  deleteListsIndex,
  removeListServerGeneratedProperties,
} from '../../../utils';
import { FtrProviderContext } from '../../../../../ftr_provider_context';

export default ({ getService }: FtrProviderContext) => {
  const log = getService('log');
  const retry = getService('retry');
  const utils = getService('securitySolutionUtils');

  describe('@ess @serverless patch_lists', () => {
    let supertest: TestAgent;

    before(async () => {
      supertest = await utils.createSuperTest();
    });

    describe('patch lists', () => {
      beforeEach(async () => {
        await createListsIndex(supertest, log);
      });

      afterEach(async () => {
        await deleteListsIndex(supertest, log);
      });

      it('should patch a single list property of name using an id', async () => {
        const listId = getCreateMinimalListSchemaMock().id as string;
        // create a simple list
        await supertest
          .post(LIST_URL)
          .set('kbn-xsrf', 'true')
          .send(getCreateMinimalListSchemaMock())
          .expect(200);

        // patch a simple list's name
        const patchedListPayload: PatchListSchema = {
          id: listId,
          name: 'some other name',
        };

        const { body } = await supertest
          .patch(LIST_URL)
          .set('kbn-xsrf', 'true')
          .send(patchedListPayload)
          .expect(200);

        const outputList: Partial<ListSchema> = {
          ...getListResponseMockWithoutAutoGeneratedValues(await utils.getUsername()),
          name: 'some other name',
          version: 2,
        };
        const bodyToCompare = removeListServerGeneratedProperties(body);
        expect(bodyToCompare).to.eql(outputList);

        await retry.waitFor('patches should be persistent', async () => {
          const { body: list } = await supertest
            .get(LIST_URL)
            .query({ id: listId })
            .set('kbn-xsrf', 'true')
            .expect(200);

          expect(list.name).to.be('some other name');
          return true;
        });
      });

      it('should patch a single list property of name using an auto-generated id', async () => {
        const { id, ...listNoId } = getCreateMinimalListSchemaMock();
        // create a simple list with no id which will use an auto-generated id
        const { body: createListBody } = await supertest
          .post(LIST_URL)
          .set('kbn-xsrf', 'true')
          .send(listNoId)
          .expect(200);

        // patch a simple list's name
        const patchedListPayload: PatchListSchema = {
          id: createListBody.id,
          name: 'some other name',
        };

        const { body } = await supertest
          .patch(LIST_URL)
          .set('kbn-xsrf', 'true')
          .send(patchedListPayload)
          .expect(200);

        const outputList: Partial<ListSchema> = {
          ...getListResponseMockWithoutAutoGeneratedValues(await utils.getUsername()),
          name: 'some other name',
          version: 2,
        };
        const bodyToCompare = removeListServerGeneratedProperties(body);
        expect(bodyToCompare).to.eql(outputList);

        await retry.waitFor('patches should be persistent', async () => {
          const { body: list } = await supertest
            .get(LIST_URL)
            .query({ id: createListBody.id })
            .set('kbn-xsrf', 'true');

          expect(list.name).to.be('some other name');
          return true;
        });
      });

      it('should not remove unspecified fields in payload', async () => {
        const listId = getCreateMinimalListSchemaMock().id as string;
        // create a simple list
        await supertest
          .post(LIST_URL)
          .set('kbn-xsrf', 'true')
          .send(getCreateMinimalListSchemaMock())
          .expect(200);

        // patch a simple list's name
        const patchedListPayload: PatchListSchema = {
          id: listId,
          name: 'some other name',
        };

        const { body } = await supertest
          .patch(LIST_URL)
          .set('kbn-xsrf', 'true')
          .send(patchedListPayload)
          .expect(200);

        const outputList: Partial<ListSchema> = {
          ...getListResponseMockWithoutAutoGeneratedValues(await utils.getUsername()),
          name: 'some other name',
          version: 2,
        };
        const bodyToCompare = removeListServerGeneratedProperties(body);
        expect(bodyToCompare).to.eql(outputList);

        await retry.waitFor('patches should be persistent', async () => {
          const { body: list } = await supertest
            .get(LIST_URL)
            .query({ id: getUpdateMinimalListSchemaMock().id })
            .set('kbn-xsrf', 'true');

          const persistentBodyToCompare = removeListServerGeneratedProperties(list);

          expect(persistentBodyToCompare).to.eql(outputList);
          return true;
        });
      });

      it('should change the version of a list when it patches a property', async () => {
        // create a simple list
        const { body: createdList } = await supertest
          .post(LIST_URL)
          .set('kbn-xsrf', 'true')
          .send(getCreateMinimalListSchemaMock())
          .expect(200);

        // patch a simple list property of name and description
        const patchPayload: PatchListSchema = {
          id: createdList.id,
          name: 'some other name',
          description: 'some other description',
        };

        const { body: patchedList } = await supertest
          .patch(LIST_URL)
          .set('kbn-xsrf', 'true')
          .send(patchPayload);

        expect(createdList.version).to.be(1);
        expect(patchedList.version).to.be(2);

        await retry.waitFor('patches should be persistent', async () => {
          const { body: list } = await supertest
            .get(LIST_URL)
            .query({ id: patchedList.id })
            .set('kbn-xsrf', 'true');

          expect(list.version).to.be(2);
          return true;
        });
      });

      it('should give a 404 if it is given a fake id', async () => {
        const simpleList: PatchListSchema = {
          ...getUpdateMinimalListSchemaMock(),
          id: '5096dec6-b6b9-4d8d-8f93-6c2602079d9d',
        };
        const { body } = await supertest
          .patch(LIST_URL)
          .set('kbn-xsrf', 'true')
          .send(simpleList)
          .expect(404);

        expect(body).to.eql({
          status_code: 404,
          message: 'list id: "5096dec6-b6b9-4d8d-8f93-6c2602079d9d" not found',
        });
      });
    });
  });
};
