/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IEsSearchResponse } from '@kbn/search-types';

import type { Inspect, Maybe } from '../../../common';
import type { ServiceItem } from '../common';

export interface ObservedServiceDetailsStrategyResponse extends IEsSearchResponse {
  serviceDetails: ServiceItem;
  inspect?: Maybe<Inspect>;
}
