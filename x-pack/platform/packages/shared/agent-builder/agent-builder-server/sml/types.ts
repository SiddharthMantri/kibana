/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { AttachmentInput } from '@kbn/agent-builder-common/attachments';

export interface SmlChunk {
  type: string;
  content: string;
  title: string;
  permissions?: string[];
}

export interface SmlData {
  chunks: SmlChunk[];
}

export interface SmlContext {
  esClient: ElasticsearchClient;
  savedObjectsClient: SavedObjectsClientContract;
  logger: Logger;
}

export interface SmlToAttachmentContext {
  request: KibanaRequest;
  savedObjectsClient: SavedObjectsClientContract;
  spaceId: string;
}

export interface SmlListItem {
  id: string;
  updatedAt: string;
  spaces: string[];
}

export interface SmlDocument {
  id: string;
  type: string;
  title: string;
  origin_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  spaces: string[];
  permissions: string[];
}

export type SmlSearchResult = Omit<SmlDocument, 'content'> & {
  content?: string;
  score: number;
};

/**
 * Server-side type definition for SML (Semantic Metadata Layer).
 * Registered via `agentBuilder.sml.registerType()` during plugin setup.
 */
export interface SmlTypeDefinition {
  id: string;
  list: (context: SmlContext) => AsyncIterable<SmlListItem[]>;
  getSmlData: (originId: string, context: SmlContext) => Promise<SmlData | undefined>;
  toAttachment: (
    item: SmlDocument,
    context: SmlToAttachmentContext
  ) => Promise<AttachmentInput<string, unknown> | undefined>;
  fetchFrequency?: () => string;
}

export type SmlIndexAction = 'create' | 'update' | 'delete';

export interface SmlIndexAttachmentParams {
  request: KibanaRequest;
  originId: string;
  attachmentType: string;
  action: SmlIndexAction;
  spaceId?: string;
}
