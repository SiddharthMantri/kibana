/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DeeplyMockedKeys } from '@kbn/utility-types-jest';
import type { FleetStartContract } from '@kbn/fleet-plugin/server';
import { createFleetStartContractMock } from '@kbn/fleet-plugin/server/mocks';
import type { MockedLogger } from '@kbn/logging-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { SavedObjectsClientFactory } from '../saved_objects';
import type {
  EndpointFleetServicesFactoryInterface,
  EndpointInternalFleetServicesInterface,
} from './endpoint_fleet_services_factory';
import { EndpointFleetServicesFactory } from './endpoint_fleet_services_factory';
import { createSavedObjectsClientFactoryMock } from '../saved_objects/saved_objects_client_factory.mocks';

export type EndpointInternalFleetServicesInterfaceMocked =
  DeeplyMockedKeys<EndpointInternalFleetServicesInterface>;

export interface EndpointFleetServicesFactoryInterfaceMocked
  extends EndpointFleetServicesFactoryInterface {
  asInternalUser: (
    ...args: Parameters<EndpointFleetServicesFactoryInterface['asInternalUser']>
  ) => EndpointInternalFleetServicesInterfaceMocked;
}

export interface CreateEndpointFleetServicesFactoryMockOptions {
  fleetDependencies: DeeplyMockedKeys<FleetStartContract>;
  savedObjects: SavedObjectsClientFactory;
  logger: MockedLogger;
}

export interface CreateEndpointFleetServicesFactoryResponse {
  service: EndpointFleetServicesFactoryInterfaceMocked;
  dependencies: CreateEndpointFleetServicesFactoryMockOptions;
}

export const createEndpointFleetServicesFactoryMock = (
  dependencies: Partial<CreateEndpointFleetServicesFactoryMockOptions> = {}
): CreateEndpointFleetServicesFactoryResponse => {
  const {
    fleetDependencies = createFleetStartContractMock(),
    savedObjects = createSavedObjectsClientFactoryMock().service,
    logger = loggingSystemMock.createLogger(),
  } = dependencies;

  // Fix up the agent service to return the same client for the different types of `as*()`
  fleetDependencies.agentService.asInternalScopedUser.mockReturnValue(
    fleetDependencies.agentService.asInternalUser
  );
  fleetDependencies.agentService.asScoped.mockReturnValue(
    fleetDependencies.agentService.asInternalUser
  );

  const serviceFactoryMock = new EndpointFleetServicesFactory(
    fleetDependencies,
    savedObjects,
    logger
  ) as unknown as EndpointFleetServicesFactoryInterfaceMocked;

  const realAsInternalUserFn = serviceFactoryMock.asInternalUser.bind(serviceFactoryMock);
  const asInternalUserSpy = jest.spyOn(serviceFactoryMock, 'asInternalUser');

  asInternalUserSpy.mockImplementation((...args) => {
    const fleetInternalServicesMocked = realAsInternalUserFn(...args);
    jest.spyOn(fleetInternalServicesMocked, 'ensureInCurrentSpace');
    jest.spyOn(fleetInternalServicesMocked, 'getPolicyNamespace');
    jest.spyOn(fleetInternalServicesMocked, 'getIntegrationNamespaces');
    jest.spyOn(fleetInternalServicesMocked, 'getSoClient');

    return fleetInternalServicesMocked;
  });

  return {
    service: serviceFactoryMock,
    dependencies: { fleetDependencies, savedObjects, logger },
  };
};
