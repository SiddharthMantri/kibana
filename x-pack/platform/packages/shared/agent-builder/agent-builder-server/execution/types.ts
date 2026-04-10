/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import type {
  AgentCapabilities,
  ChatEvent,
  ConverseInput,
  AgentConfigurationOverrides,
  BrowserApiToolMetadata,
  ConversationAction,
  AgentBuilderErrorCode,
} from '@kbn/agent-builder-common';
import type { KibanaRequest } from '@kbn/core-http-server';

export enum ExecutionStatus {
  scheduled = 'scheduled',
  running = 'running',
  completed = 'completed',
  failed = 'failed',
  aborted = 'aborted',
}

export interface AgentExecutionParams {
  agentId?: string;
  connectorId?: string;
  conversationId?: string;
  capabilities?: AgentCapabilities;
  structuredOutput?: boolean;
  outputSchema?: Record<string, unknown>;
  storeConversation?: boolean;
  autoCreateConversationWithId?: boolean;
  nextInput: ConverseInput;
  browserApiTools?: BrowserApiToolMetadata[];
  configurationOverrides?: AgentConfigurationOverrides;
  action?: ConversationAction;
}

export interface SerializedExecutionError {
  code: AgentBuilderErrorCode;
  message: string;
  meta?: Record<string, any>;
}

export interface AgentExecution {
  executionId: string;
  '@timestamp': string;
  status: ExecutionStatus;
  agentId: string;
  spaceId: string;
  agentParams: AgentExecutionParams;
  error?: SerializedExecutionError;
  eventCount: number;
  events: ChatEvent[];
  metadata?: Record<string, string>;
}

export interface ExecuteAgentParams {
  request: KibanaRequest;
  params: AgentExecutionParams;
  executionId?: string;
  abortSignal?: AbortSignal;
  useTaskManager?: boolean;
  metadata?: Record<string, string>;
}

export interface ExecuteAgentResult {
  executionId: string;
  events$: Observable<ChatEvent>;
}

export interface FindExecutionsFilter {
  metadata?: Record<string, string>;
  status?: ExecutionStatus[];
}

export interface FindExecutionsOptions {
  spaceId?: string;
  filter?: FindExecutionsFilter;
  size?: number;
  sort?: { field: '@timestamp' | 'status'; order: 'asc' | 'desc' };
}

export interface AgentExecutionService {
  executeAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult>;
  getExecution(executionId: string): Promise<AgentExecution | undefined>;
  abortExecution(executionId: string): Promise<void>;
  followExecution(executionId: string, options?: { since?: number }): Observable<ChatEvent>;
  findExecutions(
    request: KibanaRequest,
    options?: FindExecutionsOptions
  ): Promise<AgentExecution[]>;
}
