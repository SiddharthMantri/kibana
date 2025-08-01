/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * NOTICE: Do not edit this file manually.
 * This file is automatically generated by the OpenAPI Generator, @kbn/openapi-generator.
 *
 * info:
 *   title: Create Conversation API endpoint
 *   version: 2023-10-31
 */

import { z } from '@kbn/zod';

import {
  ConversationCreateProps,
  ConversationResponse,
  ConversationUpdateProps,
} from './common_attributes.gen';
import { NonEmptyString } from '../common_attributes.gen';

export type CreateConversationRequestBody = z.infer<typeof CreateConversationRequestBody>;
export const CreateConversationRequestBody = ConversationCreateProps;
export type CreateConversationRequestBodyInput = z.input<typeof CreateConversationRequestBody>;

export type CreateConversationResponse = z.infer<typeof CreateConversationResponse>;
export const CreateConversationResponse = ConversationResponse;

export type DeleteAllConversationsRequestBody = z.infer<typeof DeleteAllConversationsRequestBody>;
export const DeleteAllConversationsRequestBody = z.object({
  /**
   * Optional list of conversation IDs to delete.
   */
  excludedIds: z.array(z.string()).optional(),
});
export type DeleteAllConversationsRequestBodyInput = z.input<
  typeof DeleteAllConversationsRequestBody
>;

export type DeleteAllConversationsResponse = z.infer<typeof DeleteAllConversationsResponse>;
export const DeleteAllConversationsResponse = z.object({
  success: z.boolean().optional(),
  totalDeleted: z.number().optional(),
  failures: z.array(z.string()).optional(),
});

export type DeleteConversationRequestParams = z.infer<typeof DeleteConversationRequestParams>;
export const DeleteConversationRequestParams = z.object({
  /**
   * The conversation's `id` value.
   */
  id: NonEmptyString,
});
export type DeleteConversationRequestParamsInput = z.input<typeof DeleteConversationRequestParams>;

export type DeleteConversationResponse = z.infer<typeof DeleteConversationResponse>;
export const DeleteConversationResponse = ConversationResponse;

export type ReadConversationRequestParams = z.infer<typeof ReadConversationRequestParams>;
export const ReadConversationRequestParams = z.object({
  /**
   * The conversation's `id` value, a unique identifier for the conversation.
   */
  id: NonEmptyString,
});
export type ReadConversationRequestParamsInput = z.input<typeof ReadConversationRequestParams>;

export type ReadConversationResponse = z.infer<typeof ReadConversationResponse>;
export const ReadConversationResponse = ConversationResponse;

export type UpdateConversationRequestParams = z.infer<typeof UpdateConversationRequestParams>;
export const UpdateConversationRequestParams = z.object({
  /**
   * The conversation's `id` value.
   */
  id: NonEmptyString,
});
export type UpdateConversationRequestParamsInput = z.input<typeof UpdateConversationRequestParams>;

export type UpdateConversationRequestBody = z.infer<typeof UpdateConversationRequestBody>;
export const UpdateConversationRequestBody = ConversationUpdateProps;
export type UpdateConversationRequestBodyInput = z.input<typeof UpdateConversationRequestBody>;

export type UpdateConversationResponse = z.infer<typeof UpdateConversationResponse>;
export const UpdateConversationResponse = ConversationResponse;
