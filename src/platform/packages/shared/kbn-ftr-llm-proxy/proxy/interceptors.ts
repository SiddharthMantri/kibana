/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ChatCompletionStreamParams } from 'openai/lib/ChatCompletionStream';
import { last } from 'lodash';
import type { LlmProxy } from './proxy';
import type { ToolMessage, LLmError } from './types';

type LLMMessage = string[] | ToolMessage | string | undefined;
type LLMResponseFnOrString =
  | LLMMessage
  | LLmError
  | ((body: ChatCompletionStreamParams) => LLMMessage);

export function createInterceptors(proxy: LlmProxy) {
  return {
    toolChoice: ({
      name,
      response,
      delayMs,
    }: {
      name: string;
      response: LLMResponseFnOrString;
      delayMs?: number;
    }) =>
      proxy
        .intercept({
          name: `toolChoice: "${name}"`,
          // @ts-expect-error
          when: (body) => body.tool_choice?.function?.name === name,
          responseMock: response,
          delayMs,
        })
        .completeAfterIntercept(),

    userMessage: ({
      name,
      response,
      when,
      delayMs,
    }: {
      name?: string;
      response: LLMResponseFnOrString;
      delayMs?: number;
      when?: (body: ChatCompletionStreamParams) => boolean;
    }) => {
      return proxy
        .intercept({
          name: name ?? `userMessage`,
          when: (body) => {
            const isUserMessage = last(body.messages)?.role === 'user';
            if (when) {
              return isUserMessage && when(body);
            }
            return isUserMessage;
          },
          responseMock: response,
          delayMs,
        })
        .completeAfterIntercept();
    },
    toolMessage: ({
      name,
      response,
      when,
      delayMs,
    }: {
      name?: string;
      response: LLMResponseFnOrString;
      when?: (body: ChatCompletionStreamParams) => boolean;
      delayMs?: number;
    }) => {
      proxy
        .intercept({
          name: name ?? `toolMessage`,
          when: (body) => {
            const isToolMessage = last(body.messages)?.role === 'tool';
            if (when) {
              return isToolMessage && when(body);
            }
            return isToolMessage;
          },
          responseMock: response,
          delayMs,
        })
        .completeAfterIntercept();
    },
  };
}
