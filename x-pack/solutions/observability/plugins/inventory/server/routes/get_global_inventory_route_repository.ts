/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { entitiesRoutes } from './entities/route';
import { entityDefinitionsRoutes } from './entity_definition/get_entity_definitions';
import { hasDataRoutes } from './has_data/route';

export function getGlobalInventoryServerRouteRepository() {
  return {
    ...entitiesRoutes,
    ...entityDefinitionsRoutes,
    ...hasDataRoutes,
  };
}

export type InventoryServerRouteRepository = ReturnType<
  typeof getGlobalInventoryServerRouteRepository
>;
