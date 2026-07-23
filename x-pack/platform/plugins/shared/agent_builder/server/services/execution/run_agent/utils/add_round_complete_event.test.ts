/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { firstValueFrom, of, toArray } from 'rxjs';
import {
  ChatEventType,
  ConversationRoundStatus,
  ConversationOriginType,
  isRoundCompleteEvent,
  isRelevantSkillsStep,
  type ChatEvent,
} from '@kbn/agent-builder-common';
import type { ConversationStateManager, ModelProvider } from '@kbn/agent-builder-server/runner';
import type { AttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import { createRound } from '../../../../test_utils/conversations';
import type { ConvertedEvents } from '../convert_graph_events';
import { createFinalStateEvent } from '../events';
import { addRoundCompleteEvent } from './add_round_complete_event';

describe('addRoundCompleteEvent', () => {
  const createDeps = () => ({
    getConversationState: jest.fn(() => ({})),
    modelProvider: {
      getUsageStats: jest.fn(() => ({ calls: [] })),
    } as unknown as ModelProvider,
    stateManager: {} as unknown as ConversationStateManager,
    attachmentStateManager: {
      getAccessedRefs: jest.fn(() => []),
      getAll: jest.fn(() => []),
    } as unknown as AttachmentStateManager,
  });

  it('stamps origin type and author on the round for new rounds', async () => {
    const origin = {
      type: ConversationOriginType.Slack,
      external_conversation_id: 'team:T123/channel:C123/thread:1712345678.000100',
      author: { id: 'U123', full_name: 'Jane Doe', username: 'jane' },
    };
    const messageCompleteEvent: ChatEvent = {
      type: ChatEventType.messageComplete,
      data: {
        message_id: 'message-1',
        message_content: 'Done',
      },
    };

    const events = await firstValueFrom(
      of(
        createFinalStateEvent({ currentCycle: 0, errorCount: 0 } as never) as ConvertedEvents,
        messageCompleteEvent as ConvertedEvents
      ).pipe(
        addRoundCompleteEvent({
          ...createDeps(),
          pendingRound: undefined,
          userInput: { message: '@agent summarize this' },
          origin,
          author: origin.author,
          startTime: new Date('2026-01-01T00:00:00.000Z'),
        }),
        toArray()
      )
    );

    const roundCompleteEvent = events.find(isRoundCompleteEvent);

    expect(roundCompleteEvent?.data.round.origin).toEqual({
      type: ConversationOriginType.Slack,
    });
    expect(roundCompleteEvent?.data.round.author).toEqual({
      id: 'U123',
      full_name: 'Jane Doe',
      username: 'jane',
    });
  });

  it('preserves the original round origin and author when resuming a pending round', async () => {
    const pendingRound = createRound({
      status: ConversationRoundStatus.awaitingPrompt,
      origin: { type: ConversationOriginType.Slack },
      author: { id: 'U123', full_name: 'Jane Doe', username: 'jane' },
      input: {
        message: '@agent summarize this',
      },
    });
    const messageCompleteEvent: ChatEvent = {
      type: ChatEventType.messageComplete,
      data: {
        message_id: 'message-1',
        message_content: 'Done',
      },
    };

    const events = await firstValueFrom(
      of(
        createFinalStateEvent({ currentCycle: 0, errorCount: 0 } as never) as ConvertedEvents,
        messageCompleteEvent as ConvertedEvents
      ).pipe(
        addRoundCompleteEvent({
          ...createDeps(),
          pendingRound,
          userInput: { message: 'continue' },
          origin: {
            type: ConversationOriginType.Slack,
            external_conversation_id: 'team:T123/channel:C123/thread:1712345678.000100',
            author: { id: 'U999', full_name: 'John Roe', username: 'john' },
          },
          startTime: new Date('2026-01-01T00:00:00.000Z'),
        }),
        toArray()
      )
    );

    const roundCompleteEvent = events.find(isRoundCompleteEvent);

    expect(roundCompleteEvent?.data.round.origin).toEqual({
      type: ConversationOriginType.Slack,
    });
    expect(roundCompleteEvent?.data.round.author).toEqual({
      id: 'U123',
      full_name: 'Jane Doe',
      username: 'jane',
    });
  });

  // Shared fixture used by the author test below and the runFreshRound helper.
  const messageCompleteEvent: ChatEvent = {
    type: ChatEventType.messageComplete,
    data: { message_id: 'message-1', message_content: 'Done' },
  };

  it('stamps the resolved author on the round when there is no origin', async () => {
    const events = await firstValueFrom(
      of(
        createFinalStateEvent({ currentCycle: 0, errorCount: 0 } as never) as ConvertedEvents,
        messageCompleteEvent as ConvertedEvents
      ).pipe(
        addRoundCompleteEvent({
          ...createDeps(),
          pendingRound: undefined,
          userInput: { message: 'Hello' },
          author: { id: 'profile-1', username: 'jane' },
          startTime: new Date('2026-01-01T00:00:00.000Z'),
        }),
        toArray()
      )
    );

    const roundCompleteEvent = events.find(isRoundCompleteEvent);

    expect(roundCompleteEvent?.data.round.author).toEqual({ id: 'profile-1', username: 'jane' });
    expect(roundCompleteEvent?.data.round.origin).toBeUndefined();
  });

  // Runs a fresh (non-pending) round with an optional relevant-skills selection.
  const runFreshRound = (
    relevantSkillsSelection?: Parameters<typeof addRoundCompleteEvent>[0]['relevantSkillsSelection']
  ) =>
    firstValueFrom(
      of(
        createFinalStateEvent({ currentCycle: 0, errorCount: 0 } as never) as ConvertedEvents,
        messageCompleteEvent as ConvertedEvents
      ).pipe(
        addRoundCompleteEvent({
          ...createDeps(),
          pendingRound: undefined,
          userInput: { message: 'do a thing' },
          startTime: new Date('2026-01-01T00:00:00.000Z'),
          relevantSkillsSelection,
        }),
        toArray()
      )
    );

  it('adds a relevant_skills step for a fresh round when a non-empty selection is provided', async () => {
    const skills = [
      {
        id: 'a.alpha',
        name: 'alpha',
        path: '/p/SKILL.md',
        description: 'Alpha',
        relevance_note: 'fits',
      },
    ];
    const events = await runFreshRound({ skills });

    const round = events.find(isRoundCompleteEvent)?.data.round;
    const step = round?.steps.find(isRelevantSkillsStep);
    expect(step).toBeDefined();
    expect(step?.source).toBe('implicit');
    expect(step?.skills).toEqual(skills);
  });

  it('adds no relevant_skills step when the selection is empty', async () => {
    const events = await runFreshRound({ skills: [] });
    const round = events.find(isRoundCompleteEvent)?.data.round;
    expect(round?.steps.some(isRelevantSkillsStep)).toBe(false);
  });

  it('adds no relevant_skills step when no selection is provided', async () => {
    const events = await runFreshRound(undefined);
    const round = events.find(isRoundCompleteEvent)?.data.round;
    expect(round?.steps.some(isRelevantSkillsStep)).toBe(false);
  });
});
