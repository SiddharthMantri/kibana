/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationRound } from './conversation';
import {
  ConversationRoundStatus,
  ConversationRoundStepType,
} from './conversation';
import { TimelineEventType, TimelineEventActorType } from './timeline_event';
import type { TimelineEvent } from './timeline_event';
import { roundsToEvents, eventsToRounds, eventsToDisplayRounds } from './timeline_converters';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseModelUsage = {
  connector_id: 'test-connector',
  llm_calls: 1,
  input_tokens: 100,
  output_tokens: 50,
};

const makeRound = (overrides: Partial<ConversationRound> = {}): ConversationRound => ({
  id: 'round-1',
  status: ConversationRoundStatus.completed,
  input: {
    message: 'Hello, agent',
    attachments: [],
  },
  steps: [],
  response: { message: 'Hello, user' },
  started_at: '2024-01-01T00:00:00.000Z',
  time_to_first_token: 100,
  time_to_last_token: 500,
  model_usage: baseModelUsage,
  ...overrides,
});

// ---------------------------------------------------------------------------
// roundsToEvents
// ---------------------------------------------------------------------------

describe('roundsToEvents', () => {
  it('produces a user_message and agent_response for each round', () => {
    const rounds = [makeRound()];
    const events = roundsToEvents(rounds);

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe(TimelineEventType.userMessage);
    expect(events[1].type).toBe(TimelineEventType.agentResponse);
  });

  it('agent_response references the user_message via trigger_event_id', () => {
    const events = roundsToEvents([makeRound()]);
    const userMsg = events.find((e) => e.type === TimelineEventType.userMessage)!;
    const agentResp = events.find((e) => e.type === TimelineEventType.agentResponse)!;

    expect(agentResp.trigger_event_id).toBe(userMsg.id);
  });

  it('preserves the round id in execution_id on the agent_response', () => {
    const round = makeRound({ id: 'my-round-id' });
    const events = roundsToEvents([round]);
    const agentResp = events.find((e) => e.type === TimelineEventType.agentResponse)!;

    expect(agentResp.execution_id).toBe('my-round-id');
  });

  it('stamps agent actor with agentId when provided', () => {
    const events = roundsToEvents([makeRound()], { agentId: 'my-agent' });
    const agentResp = events.find((e) => e.type === TimelineEventType.agentResponse)!;

    expect(agentResp.actor.type).toBe(TimelineEventActorType.agent);
    expect(agentResp.actor.id).toBe('my-agent');
  });

  it('stamps user actor for rounds with no author', () => {
    const events = roundsToEvents([makeRound()]);
    const userMsg = events.find((e) => e.type === TimelineEventType.userMessage)!;

    expect(userMsg.actor.type).toBe(TimelineEventActorType.user);
  });

  it('stamps user actor with author data when present', () => {
    const round = makeRound({
      author: { id: 'user-1', username: 'alice', full_name: 'Alice Smith' },
    });
    const events = roundsToEvents([round]);
    const userMsg = events.find((e) => e.type === TimelineEventType.userMessage)!;

    expect(userMsg.actor.type).toBe(TimelineEventActorType.user);
    expect(userMsg.actor.id).toBe('user-1');
    expect(userMsg.actor.name).toBe('Alice Smith');
  });

  it('stamps externalSystem actor when round has an origin', () => {
    const round = makeRound({
      origin: { type: 'slack' as any },
      author: { id: 'slack-user-1', username: 'bob' },
    });
    const events = roundsToEvents([round]);
    const userMsg = events.find((e) => e.type === TimelineEventType.userMessage)!;

    expect(userMsg.actor.type).toBe(TimelineEventActorType.externalSystem);
    expect(userMsg.actor.id).toBe('slack-user-1');
  });

  it('produces a conversation_created event when conversationCreatedAt is provided', () => {
    const events = roundsToEvents([makeRound()], {
      conversationCreatedAt: '2024-01-01T00:00:00.000Z',
      conversationTitle: 'My Chat',
      agentId: 'agent-1',
    });

    expect(events[0].type).toBe(TimelineEventType.conversationCreated);
    expect(events).toHaveLength(3);
  });

  it('carries over tool call steps to agent_response data', () => {
    const round = makeRound({
      steps: [
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'tc-1',
          tool_id: 'search',
          params: { query: 'hello' },
          results: [],
          progression: [],
        },
      ],
    });
    const events = roundsToEvents([round]);
    const agentResp = events.find((e) => e.type === TimelineEventType.agentResponse)!;

    expect((agentResp.data as any).steps).toHaveLength(1);
    expect((agentResp.data as any).steps[0].type).toBe(ConversationRoundStepType.toolCall);
  });

  it('handles multiple rounds in order', () => {
    const rounds = [
      makeRound({ id: 'r1', input: { message: 'first', attachments: [] } }),
      makeRound({ id: 'r2', input: { message: 'second', attachments: [] } }),
    ];
    const events = roundsToEvents(rounds);

    expect(events).toHaveLength(4);
    expect(events[0].type).toBe(TimelineEventType.userMessage);
    expect((events[0].data as any).message).toBe('first');
    expect(events[2].type).toBe(TimelineEventType.userMessage);
    expect((events[2].data as any).message).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// eventsToRounds
// ---------------------------------------------------------------------------

describe('eventsToRounds', () => {
  it('reconstructs a round from a user_message + agent_response pair', () => {
    const rounds = [makeRound({ id: 'round-42' })];
    const events = roundsToEvents(rounds, { agentId: 'agent-x' });
    const reconstructed = eventsToRounds(events);

    expect(reconstructed).toHaveLength(1);
    expect(reconstructed[0].id).toBe('round-42');
    expect(reconstructed[0].input.message).toBe('Hello, agent');
    expect(reconstructed[0].response.message).toBe('Hello, user');
  });

  it('skips user_message events with no matching agent_response (in-progress)', () => {
    const userMsgOnly: TimelineEvent = {
      id: 'msg-1',
      type: TimelineEventType.userMessage,
      created_at: '2024-01-01T00:00:00.000Z',
      actor: { type: TimelineEventActorType.user },
      data: { message: 'hi' },
    };
    const rounds = eventsToRounds([userMsgOnly]);

    expect(rounds).toHaveLength(0);
  });

  it('uses only the latest agent_response per trigger_event_id (regenerate)', () => {
    // Simulate a regeneration: two agent_response events for the same user_message
    const userMsgId = 'msg-1';
    const userMsgEvent: TimelineEvent = {
      id: userMsgId,
      type: TimelineEventType.userMessage,
      created_at: '2024-01-01T00:00:00.000Z',
      actor: { type: TimelineEventActorType.user },
      data: { message: 'original' },
    };
    const firstAgentResp: TimelineEvent = {
      id: 'resp-1',
      type: TimelineEventType.agentResponse,
      created_at: '2024-01-01T00:01:00.000Z',
      actor: { type: TimelineEventActorType.agent },
      trigger_event_id: userMsgId,
      execution_id: 'round-1',
      data: {
        response: 'first answer',
        steps: [],
        model_usage: baseModelUsage,
        time_to_first_token: 100,
        time_to_last_token: 500,
        status: ConversationRoundStatus.completed,
      },
    };
    const regeneratedAgentResp: TimelineEvent = {
      id: 'resp-2',
      type: TimelineEventType.agentResponse,
      created_at: '2024-01-01T00:02:00.000Z',
      actor: { type: TimelineEventActorType.agent },
      trigger_event_id: userMsgId,
      execution_id: 'round-2',
      data: {
        response: 'regenerated answer',
        steps: [],
        model_usage: baseModelUsage,
        time_to_first_token: 80,
        time_to_last_token: 400,
        status: ConversationRoundStatus.completed,
      },
    };

    const rounds = eventsToRounds([userMsgEvent, firstAgentResp, regeneratedAgentResp]);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].response.message).toBe('regenerated answer');
    expect(rounds[0].id).toBe('round-2');
  });

  it('preserves the status from the agent_response data', () => {
    const rounds = [
      makeRound({
        status: ConversationRoundStatus.awaitingPrompt,
        pending_prompts: [
          {
            type: 'confirmation' as any,
            id: 'p1',
            title: 'Confirm?',
            tool_call_id: 'tc-1',
          },
        ],
      }),
    ];
    const events = roundsToEvents(rounds);
    const reconstructed = eventsToRounds(events);

    expect(reconstructed[0].status).toBe(ConversationRoundStatus.awaitingPrompt);
    expect(reconstructed[0].pending_prompts).toHaveLength(1);
  });

  it('reconstructs author from the user actor on user_message', () => {
    const round = makeRound({
      author: { id: 'user-7', username: 'carol' },
    });
    const events = roundsToEvents([round]);
    const reconstructed = eventsToRounds(events);

    expect(reconstructed[0].author?.id).toBe('user-7');
    expect(reconstructed[0].author?.username).toBe('carol');
  });

  it('ignores non-round events (audit, lifecycle) without error', () => {
    const lifecycleEvent: TimelineEvent = {
      id: 'ev-created',
      type: TimelineEventType.conversationCreated,
      created_at: '2024-01-01T00:00:00.000Z',
      actor: { type: TimelineEventActorType.system },
      data: { agent_id: 'agent-1', title: 'Test' },
    };
    const rounds = [makeRound()];
    const events = [lifecycleEvent, ...roundsToEvents(rounds)];
    const reconstructed = eventsToRounds(events);

    expect(reconstructed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// roundtrip: roundsToEvents → eventsToRounds
// ---------------------------------------------------------------------------

describe('roundtrip', () => {
  it('roundsToEvents → eventsToRounds produces structurally equivalent rounds', () => {
    const original = [
      makeRound({ id: 'r1', input: { message: 'ping', attachments: [] } }),
      makeRound({ id: 'r2', input: { message: 'pong', attachments: [] } }),
    ];
    const events = roundsToEvents(original, { agentId: 'agent-1' });
    const reconstructed = eventsToRounds(events);

    expect(reconstructed).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(reconstructed[i].id).toBe(original[i].id);
      expect(reconstructed[i].input.message).toBe(original[i].input.message);
      expect(reconstructed[i].response.message).toBe(original[i].response.message);
      expect(reconstructed[i].status).toBe(original[i].status);
      expect(reconstructed[i].model_usage).toEqual(original[i].model_usage);
    }
  });
});

// ---------------------------------------------------------------------------
// eventsToDisplayRounds (P3 UI adapter)
// ---------------------------------------------------------------------------

describe('eventsToDisplayRounds', () => {
  it('filters out non-content events and delegates to eventsToRounds', () => {
    const rounds = [makeRound()];
    const events: TimelineEvent[] = [
      {
        id: 'audit-1',
        type: TimelineEventType.conversationCreated,
        created_at: '2024-01-01T00:00:00.000Z',
        actor: { type: TimelineEventActorType.system },
        data: { agent_id: 'agent-1', title: 'Chat' },
      },
      ...roundsToEvents(rounds),
    ];

    const displayRounds = eventsToDisplayRounds(events);
    expect(displayRounds).toHaveLength(1);
    expect(displayRounds[0].input.message).toBe('Hello, agent');
  });

  it('returns empty array for an empty event log', () => {
    expect(eventsToDisplayRounds([])).toEqual([]);
  });
});
