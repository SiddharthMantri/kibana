/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Client } from '@elastic/elasticsearch';

/**
 * Client used to query the elasticsearch cluster.
 *
 * @public
 */
export type ElasticsearchClient = Omit<
  Client,
  'connectionPool' | 'serializer' | 'extend' | 'close' | 'diagnostic'
>;

/**
 * Options for configuring per-request logging.
 *
 * @public
 */
export interface ElasticsearchRequestLoggingOptions {
  /**
   * The logger name to use for logging requests. It results in the logger name `elasticsearch.query.<loggerName>`.
   * This allows grouping logs by the logger name, and using different configurations for each logger.
   */
  loggerName: string;
}
