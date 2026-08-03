/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentVersionRef } from '../attachments';
import type { PromptRequest } from '../agents/prompts';
import type { RuntimeAgentConfigurationOverrides } from '../agents/definition';
import type {
  ConversationRoundStep,
  RoundModelUsageStats,
  ConversationRoundStatus,
} from './conversation';
import type { RoundState } from './round_state';

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

export enum TimelineEventActorType {
  user = 'user',
  agent = 'agent',
  system = 'system',
  externalSystem = 'external_system',
}

/**
 * Records who produced the event. Replaces the round-level `author`/`origin` fields.
 */
export interface TimelineEventActor {
  type: TimelineEventActorType;
  /** Stable identifier (user id, agent id, or external system id). */
  id?: string;
  /** Human-readable name or handle. */
  name?: string;
}

// ---------------------------------------------------------------------------
// Event type enum
// ---------------------------------------------------------------------------

export enum TimelineEventType {
  // Content events
  userMessage = 'user_message',
  promptResponse = 'prompt_response',
  agentResponse = 'agent_response',
  // Execution lifecycle events
  executionStarted = 'execution_started',
  promptRequested = 'prompt_requested',
  executionFailed = 'execution_failed',
  executionAborted = 'execution_aborted',
  // Audit events
  conversationCreated = 'conversation_created',
  titleUpdated = 'title_updated',
  agentChanged = 'agent_changed',
  accessControlChanged = 'access_control_changed',
  participantAdded = 'participant_added',
  participantChanged = 'participant_changed',
  // Trigger events
  scheduleTriggered = 'schedule_triggered',
}

// ---------------------------------------------------------------------------
// Base event shape
// ---------------------------------------------------------------------------

export interface BaseTimelineEvent<TType extends TimelineEventType, TData> {
  /** Stable unique event identifier. */
  id: string;
  /** Discriminant tag for the event family/type. */
  type: TType;
  /** ISO-8601 timestamp when this event was created. */
  created_at: string;
  /** Who produced this event. */
  actor: TimelineEventActor;
  /**
   * Links this event to the agent run that produced it.
   * Only present on events emitted by an execution (execution_started, agent_response, etc.).
   */
  execution_id?: string;
  /**
   * Links an execution to the event that triggered it.
   * Set on `execution_started` and `agent_response` to reference the `user_message` (or other
   * trigger event) that started the run. Used to group regenerations under the same trigger.
   */
  trigger_event_id?: string;
  /** Type-specific payload. */
  data: TData;
}

// ---------------------------------------------------------------------------
// Content events
// ---------------------------------------------------------------------------

export interface UserMessageData {
  /** The text message from the user. */
  message: string;
  /** References to versioned conversation-level attachments. */
  attachment_refs?: AttachmentVersionRef[];
  /** Pre-rendered, immutable prompt context for attachments. */
  attachment_context?: string;
}

/**
 * Recorded the moment a user message arrives, independent of any agent run.
 */
export type UserMessageTimelineEvent = BaseTimelineEvent<
  TimelineEventType.userMessage,
  UserMessageData
>;

export const isUserMessageTimelineEvent = (
  event: TimelineEvent
): event is UserMessageTimelineEvent => event.type === TimelineEventType.userMessage;

export interface PromptResponseData {
  /** The id of the `prompt_requested` event this answers. */
  answers_event_id: string;
  /** The prompt id within the prompt request. */
  prompt_id: string;
  /** The raw prompt response payload. */
  response: Record<string, unknown>;
}

/**
 * A human answer to a `prompt_requested` event (HITL). Names the prompt it answers.
 * It resumes a run; it does not start a new run.
 */
export type PromptResponseTimelineEvent = BaseTimelineEvent<
  TimelineEventType.promptResponse,
  PromptResponseData
>;

export const isPromptResponseTimelineEvent = (
  event: TimelineEvent
): event is PromptResponseTimelineEvent => event.type === TimelineEventType.promptResponse;

export interface AgentResponseData {
  /** The final response message from the agent. */
  response: string;
  /** Optional structured output when the agent was run in structured-output mode. */
  structured_output?: object;
  /**
   * Intermediate steps produced during the run (tool calls, reasoning, etc.).
   * This is the full turn minus its input (which is the trigger event).
   */
  steps: ConversationRoundStep[];
  /** Token usage stats for this turn. */
  model_usage: RoundModelUsageStats;
  /** Time from run start to first response token, in ms. */
  time_to_first_token: number;
  /** Time from run start to last response token, in ms. */
  time_to_last_token: number;
  /** Tracing ID(s) from the inference call, when tracing is enabled. */
  trace_id?: string | string[];
  /**
   * If the run ended in a HITL pause, the pending prompt requests.
   * Present when status is `awaiting_prompt`.
   */
  pending_prompts?: PromptRequest[];
  /**
   * Derived status of this response.
   * `awaiting_prompt` means the run paused; `completed` means it finished.
   */
  status: ConversationRoundStatus;
  /**
   * Persisted graph state for resuming an interrupted run (HITL).
   * Present only when status is `awaiting_prompt`.
   */
  state?: RoundState;
  /** Runtime configuration overrides applied to this run. */
  configuration_overrides?: RuntimeAgentConfigurationOverrides;
}

/**
 * One coarse event holding the full agent turn: steps, final response, and model usage.
 * Corresponds to a completed (or paused) round minus its input.
 * The input is the event referenced by `trigger_event_id`.
 * For regenerations: multiple `agent_response` events may share the same `trigger_event_id`;
 * consumers should display only the latest one.
 */
export type AgentResponseTimelineEvent = BaseTimelineEvent<
  TimelineEventType.agentResponse,
  AgentResponseData
>;

export const isAgentResponseTimelineEvent = (
  event: TimelineEvent
): event is AgentResponseTimelineEvent => event.type === TimelineEventType.agentResponse;

// ---------------------------------------------------------------------------
// Execution lifecycle events
// ---------------------------------------------------------------------------

export interface ExecutionStartedData {
  /** The agent id that was run. */
  agent_id: string;
}

/**
 * Emitted when an agent run begins.
 */
export type ExecutionStartedTimelineEvent = BaseTimelineEvent<
  TimelineEventType.executionStarted,
  ExecutionStartedData
>;

export const isExecutionStartedTimelineEvent = (
  event: TimelineEvent
): event is ExecutionStartedTimelineEvent => event.type === TimelineEventType.executionStarted;

export interface PromptRequestedData {
  /** The prompt id. Matches the corresponding `prompt_response.prompt_id`. */
  prompt_id: string;
  /** The prompt request payload sent to the user. */
  prompt: PromptRequest;
}

/**
 * Emitted when an agent run pauses to request human input (HITL).
 * "Awaiting input" is a derived state: the last lifecycle event for an execution is a
 * `prompt_requested` with no subsequent completion event.
 */
export type PromptRequestedTimelineEvent = BaseTimelineEvent<
  TimelineEventType.promptRequested,
  PromptRequestedData
>;

export const isPromptRequestedTimelineEvent = (
  event: TimelineEvent
): event is PromptRequestedTimelineEvent => event.type === TimelineEventType.promptRequested;

export interface ExecutionFailedData {
  /** Error message describing the failure. */
  message: string;
  /** Optional error code. */
  code?: string;
}

/**
 * Emitted when an agent run ends with an error.
 */
export type ExecutionFailedTimelineEvent = BaseTimelineEvent<
  TimelineEventType.executionFailed,
  ExecutionFailedData
>;

export const isExecutionFailedTimelineEvent = (
  event: TimelineEvent
): event is ExecutionFailedTimelineEvent => event.type === TimelineEventType.executionFailed;

export interface ExecutionAbortedData {
  /** Reason for the abort, if available. */
  reason?: string;
}

/**
 * Emitted when an agent run is aborted (e.g. user cancels while waiting for HITL input).
 * On abort while waiting: `execution_started`, `prompt_requested`, `execution_aborted`,
 * and no `agent_response` is written.
 */
export type ExecutionAbortedTimelineEvent = BaseTimelineEvent<
  TimelineEventType.executionAborted,
  ExecutionAbortedData
>;

export const isExecutionAbortedTimelineEvent = (
  event: TimelineEvent
): event is ExecutionAbortedTimelineEvent => event.type === TimelineEventType.executionAborted;

// ---------------------------------------------------------------------------
// Audit events
// ---------------------------------------------------------------------------

export interface ConversationCreatedData {
  /** The agent the conversation was created for. */
  agent_id: string;
  /** The initial title assigned to the conversation. */
  title: string;
}

export type ConversationCreatedTimelineEvent = BaseTimelineEvent<
  TimelineEventType.conversationCreated,
  ConversationCreatedData
>;

export const isConversationCreatedTimelineEvent = (
  event: TimelineEvent
): event is ConversationCreatedTimelineEvent =>
  event.type === TimelineEventType.conversationCreated;

export interface TitleUpdatedData {
  /** New conversation title. */
  title: string;
}

export type TitleUpdatedTimelineEvent = BaseTimelineEvent<
  TimelineEventType.titleUpdated,
  TitleUpdatedData
>;

export const isTitleUpdatedTimelineEvent = (
  event: TimelineEvent
): event is TitleUpdatedTimelineEvent => event.type === TimelineEventType.titleUpdated;

export interface AgentChangedData {
  /** New agent id. */
  agent_id: string;
}

export type AgentChangedTimelineEvent = BaseTimelineEvent<
  TimelineEventType.agentChanged,
  AgentChangedData
>;

export const isAgentChangedTimelineEvent = (
  event: TimelineEvent
): event is AgentChangedTimelineEvent => event.type === TimelineEventType.agentChanged;

export interface AccessControlChangedData {
  access_mode: string;
}

export type AccessControlChangedTimelineEvent = BaseTimelineEvent<
  TimelineEventType.accessControlChanged,
  AccessControlChangedData
>;

export const isAccessControlChangedTimelineEvent = (
  event: TimelineEvent
): event is AccessControlChangedTimelineEvent =>
  event.type === TimelineEventType.accessControlChanged;

export interface ParticipantAddedData {
  participant_id: string;
  participant_name?: string;
}

export type ParticipantAddedTimelineEvent = BaseTimelineEvent<
  TimelineEventType.participantAdded,
  ParticipantAddedData
>;

export interface ParticipantChangedData {
  participant_id: string;
  participant_name?: string;
}

export type ParticipantChangedTimelineEvent = BaseTimelineEvent<
  TimelineEventType.participantChanged,
  ParticipantChangedData
>;

// ---------------------------------------------------------------------------
// Trigger events
// ---------------------------------------------------------------------------

export interface ScheduleTriggeredData {
  schedule_id: string;
}

export type ScheduleTriggeredTimelineEvent = BaseTimelineEvent<
  TimelineEventType.scheduleTriggered,
  ScheduleTriggeredData
>;

// ---------------------------------------------------------------------------
// Timeline event union
// ---------------------------------------------------------------------------

export type TimelineEvent =
  | UserMessageTimelineEvent
  | PromptResponseTimelineEvent
  | AgentResponseTimelineEvent
  | ExecutionStartedTimelineEvent
  | PromptRequestedTimelineEvent
  | ExecutionFailedTimelineEvent
  | ExecutionAbortedTimelineEvent
  | ConversationCreatedTimelineEvent
  | TitleUpdatedTimelineEvent
  | AgentChangedTimelineEvent
  | AccessControlChangedTimelineEvent
  | ParticipantAddedTimelineEvent
  | ParticipantChangedTimelineEvent
  | ScheduleTriggeredTimelineEvent;
