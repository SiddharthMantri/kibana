/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { transformError } from '@kbn/securitysolution-es-utils';
import { LIST_ITEM_URL } from '@kbn/securitysolution-list-constants';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers';
import {
  CreateListItemRequestBody,
  CreateListItemResponse,
} from '@kbn/securitysolution-lists-common/api';

import type { ListsPluginRouter } from '../../types';
import { buildSiemResponse } from '../utils';
import { getListClient } from '..';

export const createListItemRoute = (router: ListsPluginRouter): void => {
  router.versioned
    .post({
      access: 'public',
      path: LIST_ITEM_URL,
      security: {
        authz: {
          requiredPrivileges: ['lists-all'],
        },
      },
    })
    .addVersion(
      {
        validate: {
          request: {
            body: buildRouteValidationWithZod(CreateListItemRequestBody),
          },
        },
        version: '2023-10-31',
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const { id, list_id: listId, value, meta, refresh } = request.body;
          const lists = await getListClient(context);
          const list = await lists.getList({ id: listId });

          if (list == null) {
            return siemResponse.error({
              body: `list id: "${listId}" does not exist`,
              statusCode: 404,
            });
          }

          if (id != null) {
            const listItem = await lists.getListItem({ id });
            if (listItem != null) {
              return siemResponse.error({
                body: `list item id: "${id}" already exists`,
                statusCode: 409,
              });
            }
          }
          const createdListItem = await lists.createListItem({
            deserializer: list.deserializer,
            id,
            listId,
            meta,
            refresh,
            serializer: list.serializer,
            type: list.type,
            value,
          });

          if (createdListItem != null) {
            return response.ok({ body: CreateListItemResponse.parse(createdListItem) });
          } else {
            return siemResponse.error({
              body: 'list item invalid',
              statusCode: 400,
            });
          }
        } catch (err) {
          const error = transformError(err);
          return siemResponse.error({
            body: error.message,
            statusCode: error.statusCode,
          });
        }
      }
    );
};
