/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { IRouter } from '@kbn/core/server';
import { ILicenseState, validateEmptyStrings } from '../lib';
import { BASE_ACTION_API_PATH, RewriteResponseCase } from '../../common';
import { ActionResult, ActionsRequestHandlerContext } from '../types';
import { verifyAccessAndContext } from './verify_access_and_context';
import { connectorResponseSchemaV1 } from '../../common/routes/connector/response';

const paramSchema = schema.object({
  id: schema.string({
    meta: { description: 'An identifier for the connector.' },
  }),
});

export const bodySchema = schema.object({
  name: schema.string({
    validate: validateEmptyStrings,
    meta: { description: 'The display name for the connector.' },
  }),
  config: schema.recordOf(schema.string(), schema.any({ validate: validateEmptyStrings }), {
    defaultValue: {},
  }),
  secrets: schema.recordOf(schema.string(), schema.any({ validate: validateEmptyStrings }), {
    defaultValue: {},
  }),
});

const rewriteBodyRes: RewriteResponseCase<ActionResult> = ({
  actionTypeId,
  isPreconfigured,
  isMissingSecrets,
  isDeprecated,
  isSystemAction,
  ...res
}) => ({
  ...res,
  connector_type_id: actionTypeId,
  is_preconfigured: isPreconfigured,
  is_deprecated: isDeprecated,
  is_missing_secrets: isMissingSecrets,
  is_system_action: isSystemAction,
});

export const updateActionRoute = (
  router: IRouter<ActionsRequestHandlerContext>,
  licenseState: ILicenseState
) => {
  router.put(
    {
      path: `${BASE_ACTION_API_PATH}/connector/{id}`,
      options: {
        access: 'public',
        summary: `Update a connector`,
        tags: ['oas-tag:connectors'],
      },
      validate: {
        request: {
          body: bodySchema,
          params: paramSchema,
        },
        response: {
          200: {
            description: 'Indicates a successful call.',
            body: () => connectorResponseSchemaV1,
          },
        },
      },
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, req, res) {
        const actionsClient = (await context.actions).getActionsClient();
        const { id } = req.params;
        const { name, config, secrets } = req.body;

        return res.ok({
          body: rewriteBodyRes(
            await actionsClient.update({
              id,
              action: { name, config, secrets },
            })
          ),
        });
      })
    )
  );
};
