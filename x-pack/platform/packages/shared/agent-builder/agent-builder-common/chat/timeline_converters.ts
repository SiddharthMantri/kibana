/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ConversationRound,
  ConversationRoundAuthor,
  ConversationRoundOrigin,
} from './conversation';
import { ConversationRoundStatus, ConversationRoundStepType } from './conversation';
import {
  TimelineEventType,
  TimelineEventActorType,
  type TimelineEvent,
  type TimelineEventActor,
  type UserMessageTimelineEvent,
  type AgentResponseTimelineEvent,
} from './timeline_event';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derives a `TimelineEventActor` from the round author and origin.
 * External origins map to `externalSystem`; otherwise the actor is `user`.
 */
const actorFromRound = (
  author?: ConversationRoundAuthor,
  origin?: ConversationRoundOrigin
): TimelineEventActor => {
  if (origin) {
    return {
      type: TimelineEventActorType.externalSystem,
      ...(author?.id ? { id: author.id } : {}),
      ...(author?.username ? { name: author.username } : {}),
    };
  }
  if (author) {
    return {
      type: TimelineEventActorType.user,
      id: author.id,
      ...(author.full_name ? { name: author.full_name } : author.username ? { name: author.username } : {}),
    };
  }
  return { type: TimelineEventActorType.user };
};

// ---------------------------------------------------------------------------
// roundsToEvents
// ---------------------------------------------------------------------------

/**
 * Options for `roundsToEvents`.
 */
export interface RoundsToEventsOptions {
  /**
   * The agent id used to stamp the actor on `agent_response` events.
   * When omitted the actor has no id.
   */
  agentId?: string;
  /**
   * ISO-8601 timestamp to use for the `conversation_created` event.
   * When omitted no `conversation_created` event is produced.
   */
  conversationCreatedAt?: string;
  /**
   * The agent id for the `conversation_created` event.
   * When omitted uses `agentId`.
   */
  conversationAgentId?: string;
  /**
   * The title for the `conversation_created` event.
   */
  conversationTitle?: string;
}

/**
 * Converts an ordered array of `ConversationRound` objects into an append-only timeline.
 * Each round is mapped to a `user_message` event + an `agent_response` event.
 * The `agent_response` references the `user_message` via `trigger_event_id`.
 * The round id is preserved in `execution_id` on the `agent_response`, so `eventsToRounds`
 * can reconstruct the same round id.
 */
export const roundsToEvents = (
  rounds: ConversationRound[],
  options: RoundsToEventsOptions = {}
): TimelineEvent[] => {
  const { agentId, conversationCreatedAt, conversationTitle, conversationAgentId } = options;

  const events: TimelineEvent[] = [];
  const agentActor: TimelineEventActor = {
    type: TimelineEventActorType.agent,
    ...(agentId ? { id: agentId } : {}),
  };
  const systemActor: TimelineEventActor = { type: TimelineEventActorType.system };

  if (conversationCreatedAt) {
    events.push({
      id: uuidv4(),
      type: TimelineEventType.conversationCreated,
      created_at: conversationCreatedAt,
      actor: systemActor,
      data: {
        agent_id: conversationAgentId ?? agentId ?? '',
        title: conversationTitle ?? '',
      },
    });
  }

  for (const round of rounds) {
    const userMsgId = `${round.id}_user`;
    const agentRespId = `${round.id}_agent`;

    const userMsgEvent: UserMessageTimelineEvent = {
      id: userMsgId,
      type: TimelineEventType.userMessage,
      created_at: round.started_at,
      actor: actorFromRound(round.author, round.origin),
      data: {
        message: round.input.message,
        ...(round.input.attachment_refs?.length
          ? { attachment_refs: round.input.attachment_refs }
          : {}),
        ...(round.input.attachment_context
          ? { attachment_context: round.input.attachment_context }
          : {}),
      },
    };
    events.push(userMsgEvent);

    const agentRespEvent: AgentResponseTimelineEvent = {
      id: agentRespId,
      type: TimelineEventType.agentResponse,
      created_at: round.started_at,
      actor: agentActor,
      execution_id: round.id,
      trigger_event_id: userMsgId,
      data: {
        response: round.response.message,
        ...(round.response.structured_output
          ? { structured_output: round.response.structured_output }
          : {}),
        steps: round.steps,
        model_usage: round.model_usage,
        time_to_first_token: round.time_to_first_token,
        time_to_last_token: round.time_to_last_token,
        status: round.status,
        ...(round.trace_id !== undefined ? { trace_id: round.trace_id } : {}),
        ...(round.pending_prompts?.length ? { pending_prompts: round.pending_prompts } : {}),
        ...(round.state ? { state: round.state } : {}),
        ...(round.configuration_overrides
          ? { configuration_overrides: round.configuration_overrides }
          : {}),
      },
    };
    events.push(agentRespEvent);
  }

  return events;
};

// ---------------------------------------------------------------------------
// eventsToRounds
// ---------------------------------------------------------------------------

/**
 * Reconstructs an ordered array of `ConversationRound` objects from a timeline event log.
 *
 * - Each `user_message` event represents one round's input.
 * - The corresponding `agent_response` event (latest one per `trigger_event_id`) provides the
 *   output. If multiple `agent_response` events share the same `trigger_event_id` (regenerate),
 *   only the latest one is used.
 * - `user_message` events with no matching `agent_response` are skipped (in-progress round).
 */
export const eventsToRounds = (events: TimelineEvent[]): ConversationRound[] => {
  const rounds: ConversationRound[] = [];

  // Build a map of trigger_event_id → latest agent_response
  const latestAgentResponseByTrigger = new Map<string, AgentResponseTimelineEvent>();
  for (const event of events) {
    if (
      event.type === TimelineEventType.agentResponse &&
      event.trigger_event_id !== undefined
    ) {
      latestAgentResponseByTrigger.set(event.trigger_event_id, event);
    }
  }

  // Iterate user_message events in order
  for (const event of events) {
    if (event.type !== TimelineEventType.userMessage) {
      continue;
    }

    const agentResp = latestAgentResponseByTrigger.get(event.id);
    if (!agentResp) {
      // In-progress round: no agent_response yet
      continue;
    }

    const roundId = agentResp.execution_id ?? agentResp.id;
    const { data } = agentResp;

    const round: ConversationRound = {
      id: roundId,
      status: data.status ?? ConversationRoundStatus.completed,
      input: {
        message: event.data.message,
        attachments: [],
        ...(event.data.attachment_refs ? { attachment_refs: event.data.attachment_refs } : {}),
        ...(event.data.attachment_context
          ? { attachment_context: event.data.attachment_context }
          : {}),
      },
      steps: data.steps,
      response: {
        message: data.response,
        ...(data.structured_output ? { structured_output: data.structured_output } : {}),
      },
      started_at: agentResp.created_at,
      time_to_first_token: data.time_to_first_token,
      time_to_last_token: data.time_to_last_token,
      model_usage: data.model_usage,
      ...(data.trace_id !== undefined ? { trace_id: data.trace_id } : {}),
      ...(data.pending_prompts?.length ? { pending_prompts: data.pending_prompts } : {}),
      ...(data.state ? { state: data.state } : {}),
      ...(data.configuration_overrides
        ? { configuration_overrides: data.configuration_overrides }
        : {}),
    };

    // Reconstruct author from actor on the user_message event
    const actor = event.actor;
    if (actor.type === TimelineEventActorType.user || actor.type === TimelineEventActorType.externalSystem) {
      if (actor.id) {
        round.author = {
          id: actor.id,
          ...(actor.name ? { username: actor.name } : {}),
        };
      }
    }

    rounds.push(round);
  }

  return rounds;
};

// ---------------------------------------------------------------------------
// eventsToDisplayRounds (P3 UI adapter)
// ---------------------------------------------------------------------------

/**
 * Adapts a timeline event log to the `ConversationRound[]` shape consumed by the UI.
 * This is a thin wrapper around `eventsToRounds` for now; additional display-layer
 * transformations (e.g. filtering transient events) can be added here without touching the core
 * converter.
 */
export const eventsToDisplayRounds = (events: TimelineEvent[]): ConversationRound[] => {
  // Filter out non-content events; only user_message and agent_response contribute to rounds.
  const contentEvents = events.filter(
    (e) =>
      e.type === TimelineEventType.userMessage ||
      e.type === TimelineEventType.agentResponse
  );
  return eventsToRounds(contentEvents);
};

// ---------------------------------------------------------------------------
// Guard helpers for content-producing step types (used in tests / elsewhere)
// ---------------------------------------------------------------------------

/**
 * Returns true when a step type carries substantive content that should be shown in the UI.
 */
export const isContentStep = (stepType: ConversationRoundStepType): boolean => {
  return (
    stepType === ConversationRoundStepType.toolCall ||
    stepType === ConversationRoundStepType.reasoning ||
    stepType === ConversationRoundStepType.updateTodos ||
    stepType === ConversationRoundStepType.askUserQuestion
  );
};
