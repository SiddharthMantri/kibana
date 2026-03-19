/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TraceSpanResponse } from '../../../../../hooks/use_agent_trace';

export interface NormalizedSpan extends TraceSpanResponse {
  /** ISO string copied from @timestamp for rendering compatibility */
  start_time: string;
  depth: number;
  children: NormalizedSpan[];
}
