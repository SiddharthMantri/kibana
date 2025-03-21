/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { match as RouteMatch } from 'react-router-dom';
import { Redirect } from 'react-router-dom';
import { Routes, Route } from '@kbn/shared-ux-router';

import { inventoryModels } from '@kbn/metrics-data-access-plugin/common';
import { RedirectToNodeDetail } from './redirect_to_node_detail';
import { RedirectToHostDetailViaIP } from './redirect_to_host_detail_via_ip';
import { RedirectToInventory } from './redirect_to_inventory';

interface LinkToPageProps {
  match: RouteMatch<{}>;
}

const ITEM_TYPES = inventoryModels.map((m) => m.id).join('|');

/**
 * @deprecated Link-to routes shouldn't be used anymore
 * Instead please use locators registered for the infra plugin
 * InventoryLocator & AssetDetailsLocator
 */
export const LinkToMetricsPage: React.FC<LinkToPageProps> = (props) => {
  return (
    <Routes>
      <Route
        path={`${props.match.url}/:nodeType(${ITEM_TYPES})-detail/:nodeId`}
        component={RedirectToNodeDetail}
      />
      <Route
        path={`${props.match.url}/host-detail-via-ip/:hostIp`}
        component={RedirectToHostDetailViaIP}
      />
      <Route path={`${props.match.url}/inventory`} component={RedirectToInventory} />
      <Redirect to="/" />
    </Routes>
  );
};
