/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { IEsSearchResponse } from '@kbn/search-types';

import type { Inspect, Maybe } from '../../../common';
import type { HostItem } from '../common';

export interface HostDetailsStrategyResponse extends IEsSearchResponse {
  hostDetails: HostItem;
  inspect?: Maybe<Inspect>;
}

export type { HostDetailsRequestOptions } from '../../../../api/search_strategy';

export interface AggregationRequest {
  [aggField: string]: estypes.AggregationsAggregationContainer;
}
