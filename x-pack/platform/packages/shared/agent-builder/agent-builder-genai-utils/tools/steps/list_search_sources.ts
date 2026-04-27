/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { take } from 'lodash';
import type { ElasticsearchClient } from '@kbn/core/server';
import { EsResourceType, isAllowedDotIndex } from '@kbn/agent-builder-common';
import { isNotFoundError } from '@kbn/es-errors';

export interface DataStreamSearchSource {
  type: EsResourceType.dataStream;
  name: string;
  indices: string[];
  timestamp_field: string;
}

export interface AliasSearchSource {
  type: EsResourceType.alias;
  name: string;
  indices: string[];
}

export interface IndexSearchSource {
  type: EsResourceType.index;
  name: string;
}

export type EsSearchSource = DataStreamSearchSource | AliasSearchSource | IndexSearchSource;

export interface ListSourcesResponse {
  indices: IndexSearchSource[];
  aliases: AliasSearchSource[];
  data_streams: DataStreamSearchSource[];
  warnings?: string[];
}

/**
 * List the search sources (indices, aliases and datastreams) matching a given index pattern,
 * using the `_resolve_index` API.
 *
 * Dot-prefixed visibility policy
 * ------------------------------
 * By default, resources whose name starts with `.` are filtered out unless the name
 * matches a curated allow-list of user-facing dot-prefixed patterns (e.g. `.alerts-*`,
 * `.ml-anomalies-*`, `.slo-observability.*`, `.entities.*`, `.lists`, `.items`,
 * `.siem-signals-*`, `.monitoring-*`). The allow-list lives at
 * `@kbn/agent-builder-common` ({@link isAllowedDotIndex}); see that module for the
 * canonical list and guidance on how to add patterns.
 *
 * Set `includeSystemIndices: true` to bypass the allow-list filter entirely (used by
 * internal callers that perform explicit single-resource lookups, e.g. CCS resolution).
 *
 * The filter applies uniformly to indices, aliases, and data streams by name so that
 * off-list internal resources (e.g. `.fleet-*`, `.chat-*`, `.internal.alerts-*`) do
 * not surface regardless of which result bucket they land in.
 */
export const listSearchSources = async ({
  pattern,
  perTypeLimit = 100,
  includeHidden = false,
  includeSystemIndices = false,
  excludeIndicesRepresentedAsAlias = true,
  excludeIndicesRepresentedAsDatastream = true,
  esClient,
}: {
  pattern: string;
  perTypeLimit?: number;
  includeHidden?: boolean;
  /**
   * When true, bypass the dot-prefixed allow-list and return every resource
   * resolved by Elasticsearch (subject to the user's ES permissions). Defaults to
   * false, which hides internal dot-prefixed resources that are not on the curated
   * allow-list in `@kbn/agent-builder-common`.
   */
  includeSystemIndices?: boolean;
  excludeIndicesRepresentedAsAlias?: boolean;
  excludeIndicesRepresentedAsDatastream?: boolean;
  esClient: ElasticsearchClient;
}): Promise<ListSourcesResponse> => {
  // Local helper: a resource is visible either because the caller opted into the
  // full set (`includeSystemIndices`), or because the name passes the dot-prefixed
  // allow-list check. Centralized so the per-bucket filters stay readable.
  const isResourceVisible = (name: string): boolean =>
    includeSystemIndices || isAllowedDotIndex(name);

  try {
    const resolveRes = await esClient.indices.resolveIndex({
      name: [pattern],
      allow_no_indices: true,
      expand_wildcards: includeHidden ? ['open', 'hidden'] : ['open'],
    });

    // data streams — apply the allow-list visibility filter by name.
    const dataStreamSources = resolveRes.data_streams
      .filter((dataStream) => isResourceVisible(dataStream.name))
      .map<DataStreamSearchSource>((dataStream) => {
        return {
          type: EsResourceType.dataStream,
          name: dataStream.name,
          indices: Array.isArray(dataStream.backing_indices)
            ? dataStream.backing_indices
            : [dataStream.backing_indices],
          timestamp_field: dataStream.timestamp_field,
        };
      });

    // aliases — apply the allow-list visibility filter by name.
    const aliasSources = resolveRes.aliases
      .filter((alias) => isResourceVisible(alias.name))
      .map<AliasSearchSource>((alias) => {
        return {
          type: EsResourceType.alias,
          name: alias.name,
          indices: Array.isArray(alias.indices) ? alias.indices : [alias.indices],
        };
      });

    // indices. We compute the "represented as alias/datastream" dedupe sets from
    // the UNFILTERED ES response, not from the visibility-filtered aliasSources /
    // dataStreamSources — even if a parent alias/DS is hidden by the allow-list,
    // we still want the backing index to be recognized as such so it doesn't
    // double-count. The name-based visibility filter below will drop any backing
    // indices that are themselves off-list.
    const resolvedDataStreamNames = resolveRes.data_streams.map((ds) => ds.name);
    const resolvedAliasNames = resolveRes.aliases.map((alias) => alias.name);

    const indexSources = resolveRes.indices
      .filter((index) => {
        if (!isResourceVisible(index.name)) {
          return false;
        }

        if (
          excludeIndicesRepresentedAsAlias &&
          index.aliases?.length &&
          index.aliases.some((alias) => resolvedAliasNames.includes(alias))
        ) {
          return false;
        }

        if (
          excludeIndicesRepresentedAsDatastream &&
          index.data_stream &&
          resolvedDataStreamNames.includes(index.data_stream)
        ) {
          return false;
        }

        return true;
      })
      .map<IndexSearchSource>((index) => {
        return {
          type: EsResourceType.index,
          name: index.name,
        };
      });

    const warnings: string[] = [];
    if (dataStreamSources.length > perTypeLimit) {
      warnings.push(
        `DataStreams results truncated to ${perTypeLimit} elements - Total result count was ${dataStreamSources.length}`
      );
    }
    if (aliasSources.length > perTypeLimit) {
      warnings.push(
        `Aliases results truncated to ${perTypeLimit} elements - Total result count was ${aliasSources.length}`
      );
    }
    if (indexSources.length > perTypeLimit) {
      warnings.push(
        `Indices results truncated to ${perTypeLimit} elements - Total result count was ${indexSources.length}`
      );
    }

    return {
      warnings,
      data_streams: take(dataStreamSources, perTypeLimit),
      aliases: take(aliasSources, perTypeLimit),
      indices: take(indexSources, perTypeLimit),
    };
  } catch (e) {
    if (isNotFoundError(e)) {
      return {
        data_streams: [],
        aliases: [],
        indices: [],
        warnings: ['No sources found.'],
      };
    }
    throw e;
  }
};
