/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { ILicenseState } from '../lib';
import type { RewriteResponseCase, RewriteRequestCase } from './lib';
import { verifyAccessAndContext } from './lib';
import type { AlertingRequestHandlerContext } from '../types';
import { INTERNAL_BASE_ALERTING_API_PATH } from '../types';
import type { RulesSettingsFlapping, RulesSettingsFlappingProperties } from '../../common';
import { API_PRIVILEGES } from '../../common';

const bodySchema = schema.object({
  enabled: schema.boolean(),
  look_back_window: schema.number(),
  status_change_threshold: schema.number(),
});

const rewriteQueryReq: RewriteRequestCase<RulesSettingsFlappingProperties> = ({
  look_back_window: lookBackWindow,
  status_change_threshold: statusChangeThreshold,
  ...rest
}) => ({
  ...rest,
  lookBackWindow,
  statusChangeThreshold,
});

const rewriteBodyRes: RewriteResponseCase<RulesSettingsFlapping> = ({
  lookBackWindow,
  statusChangeThreshold,
  createdBy,
  updatedBy,
  createdAt,
  updatedAt,
  ...rest
}) => ({
  ...rest,
  look_back_window: lookBackWindow,
  status_change_threshold: statusChangeThreshold,
  created_by: createdBy,
  updated_by: updatedBy,
  created_at: createdAt,
  updated_at: updatedAt,
});

export const updateFlappingSettingsRoute = (
  router: IRouter<AlertingRequestHandlerContext>,
  licenseState: ILicenseState
) => {
  router.post(
    {
      path: `${INTERNAL_BASE_ALERTING_API_PATH}/rules/settings/_flapping`,
      validate: {
        body: bodySchema,
      },
      security: {
        authz: {
          requiredPrivileges: [`${API_PRIVILEGES.WRITE_FLAPPING_SETTINGS}`],
        },
      },
      options: {
        access: 'internal',
      },
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, req, res) {
        const rulesSettingsClient = (await context.alerting).getRulesSettingsClient();

        const updatedFlappingSettings = await rulesSettingsClient
          .flapping()
          .update(rewriteQueryReq(req.body));

        return res.ok({
          body: updatedFlappingSettings && rewriteBodyRes(updatedFlappingSettings),
        });
      })
    )
  );
};
