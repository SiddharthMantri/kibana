/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import { defer, tap, finalize } from 'rxjs';
import type { HttpSetup } from '@kbn/core-http-browser';
import { httpResponseIntoObservable } from '@kbn/sse-utils-client';
import type { ChatEvent, AgentCapabilities } from '@kbn/agent-builder-common';
import {
  getKibanaDefaultAgentCapabilities,
  type PromptResponse,
} from '@kbn/agent-builder-common/agents';
import type { AttachmentInput } from '@kbn/agent-builder-common/attachments';
import type { BrowserApiToolMetadata } from '@kbn/agent-builder-common';
import { publicApiPath } from '../../../common/constants';
import type { ChatRequestBodyPayload } from '../../../common/http_api/chat';
import { unwrapAgentBuilderErrors } from '../utils/errors';
import type { EventsService } from '../events';
import { propagateEvents } from './propagate_events';
import { pendingExecutions } from '../background_execution';

interface BaseConverseParams {
  signal?: AbortSignal;
  agentId?: string;
  connectorId?: string;
  conversationId?: string;
  browserApiTools?: BrowserApiToolMetadata[];
  capabilities?: AgentCapabilities;
  /**
   * When true, the server keeps the execution running even if this client
   * disconnects (tab close, logout, network drop).
   */
  continueOnDisconnect?: boolean;
}

export type ChatParams = BaseConverseParams & {
  input: string;
  attachments?: AttachmentInput[];
};

export type ResumeRoundParams = BaseConverseParams & {
  conversationId: string;
  prompts: Record<string, PromptResponse>;
};

export type RegenerateParams = BaseConverseParams & {
  conversationId: string;
};

export class ChatService {
  private readonly http: HttpSetup;
  private readonly events: EventsService;

  constructor({ http, events }: { http: HttpSetup; events: EventsService }) {
    this.http = http;
    this.events = events;
  }

  chat(params: ChatParams): Observable<ChatEvent> {
    return this.converse(params.signal, {
      input: params.input,
      agent_id: params.agentId,
      conversation_id: params.conversationId,
      connector_id: params.connectorId,
      capabilities: params.capabilities ?? getKibanaDefaultAgentCapabilities(),
      attachments: params.attachments,
      browser_api_tools: params.browserApiTools ?? [],
      continue_on_disconnect: params.continueOnDisconnect,
    });
  }

  /**
   * Resume a round that is awaiting a prompt response (e.g., confirmation).
   */
  resume(params: ResumeRoundParams): Observable<ChatEvent> {
    return this.converse(params.signal, {
      agent_id: params.agentId,
      conversation_id: params.conversationId,
      connector_id: params.connectorId,
      capabilities: params.capabilities ?? getKibanaDefaultAgentCapabilities(),
      prompts: params.prompts,
      browser_api_tools: params.browserApiTools ?? [],
      continue_on_disconnect: params.continueOnDisconnect,
    });
  }

  regenerate(params: RegenerateParams): Observable<ChatEvent> {
    return this.converse(params.signal, {
      agent_id: params.agentId,
      conversation_id: params.conversationId,
      connector_id: params.connectorId,
      capabilities: params.capabilities ?? getKibanaDefaultAgentCapabilities(),
      browser_api_tools: params.browserApiTools ?? [],
      action: 'regenerate',
      continue_on_disconnect: params.continueOnDisconnect,
    });
  }

  private converse(signal: AbortSignal | undefined, payload: ChatRequestBodyPayload) {
    const isBgRun = Boolean(payload.continue_on_disconnect);
    let capturedExecId: string | undefined;

    return defer(() => {
      return this.http.post(`${publicApiPath}/converse/async`, {
        signal,
        asResponse: true,
        rawResponse: true,
        body: JSON.stringify(payload),
      });
    }).pipe(
      // When running in background mode, capture the execution ID from the
      // response header and store it in localStorage so the return-notifier
      // can poll for completion even if this tab closes.
      tap((httpResponse: any) => {
        if (isBgRun) {
          const execId =
            httpResponse?.response?.headers?.get?.('x-execution-id') ??
            httpResponse?.response?.headers?.['x-execution-id'];
          if (execId) {
            capturedExecId = execId;
            pendingExecutions.add(execId);
          }
        }
      }),
      // @ts-expect-error SseEvent mixin issue
      httpResponseIntoObservable<ChatEvent>(),
      unwrapAgentBuilderErrors(),
      propagateEvents({ eventsService: this.events }),
      // If the stream completes normally while the tab is still open, remove
      // from pending storage so the return-notifier does not double-toast.
      finalize(() => {
        if (capturedExecId) {
          pendingExecutions.remove(capturedExecId);
        }
      })
    );
  }
}
