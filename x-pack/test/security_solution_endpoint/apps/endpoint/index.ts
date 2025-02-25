/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getRegistryUrl as getRegistryUrlFromIngest } from '@kbn/fleet-plugin/server';
import { isServerlessKibanaFlavor } from '@kbn/security-solution-plugin/common/endpoint/utils/kibana_status';
import { FtrProviderContext } from '../../configs/ftr_provider_context';

export default function (providerContext: FtrProviderContext) {
  const { loadTestFile, getService, getPageObjects } = providerContext;

  // FLAKY: https://github.com/elastic/kibana/issues/180401
  // FLAKY: https://github.com/elastic/kibana/issues/203894
  describe.skip('endpoint', function () {
    const ingestManager = getService('ingestManager');
    const log = getService('log');
    const endpointTestResources = getService('endpointTestResources');
    const kbnClient = getService('kibanaServer');
    const endpointRegistryHelpers = getService('endpointRegistryHelpers');

    before(async () => {
      if (!endpointRegistryHelpers.isRegistryEnabled()) {
        log.warning('These tests are being run with an external package registry');
      }

      const registryUrl =
        endpointRegistryHelpers.getRegistryUrlFromTestEnv() ?? getRegistryUrlFromIngest();
      log.info(`Package registry URL for tests: ${registryUrl}`);

      log.info('calling Fleet setup');
      await ingestManager.setup();

      log.info('installing/upgrading Endpoint fleet package');
      await endpointTestResources.installOrUpgradeEndpointFleetPackage();

      if (await isServerlessKibanaFlavor(kbnClient)) {
        log.info('login for serverless environment');
        const pageObjects = getPageObjects(['svlCommonPage']);
        await pageObjects.svlCommonPage.loginWithRole('endpoint_operations_analyst');
      }
    });
    loadTestFile(require.resolve('./endpoint_list'));
    loadTestFile(require.resolve('./endpoint_telemetry'));
    loadTestFile(require.resolve('./endpoint_permissions'));
    loadTestFile(require.resolve('./endpoint_solution_integrations'));
    loadTestFile(require.resolve('./endpoint_transform'));
  });
}
