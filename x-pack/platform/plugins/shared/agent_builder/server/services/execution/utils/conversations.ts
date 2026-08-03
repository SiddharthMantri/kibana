/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Observable } from 'rxjs';
import { of, forkJoin, switchMap } from 'rxjs';
import type { Logger } from '@kbn/logging';
import type {
  Conversation,
  ConversationAccessControl,
  ConversationOrigin,
  RoundCompleteEvent,
  ConversationAction,
} from '@kbn/agent-builder-common';
import { getDefaultConversationAccessControl } from '@kbn/agent-builder-common';
import {
  roundsToEvents,
  TimelineEventType,
  TimelineEventActorType,
} from '@kbn/agent-builder-common/chat';
import type { TimelineEvent } from '@kbn/agent-builder-common/chat';
import type { ConversationClient } from '../../conversation';
import { createConversationUpdatedEvent, createConversationCreatedEvent } from './events';

/**
 * Fire-and-forget: append timeline events to the conversation document.
 * Errors are logged but do not affect the main event stream.
 */
const appendEventsFireAndForget = (
  conversationClient: ConversationClient,
  conversationId: string,
  events: TimelineEvent[],
  logger: Logger
): void => {
  if (events.length === 0) return;
  conversationClient.appendConversationEvents(conversationId, events).catch((err: unknown) => {
    logger.warn(
      `Failed to append timeline events to conversation ${conversationId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  });
};

/**
 * Persist a new conversation and emit the corresponding event
 */
export const createConversation$ = ({
  conversation,
  conversationClient,
  title$,
  roundCompletedEvents$,
  logger,
}: {
  conversation: Pick<Conversation, 'id' | 'agent_id' | 'access_control' | 'origin'>;
  conversationClient: ConversationClient;
  title$: Observable<string>;
  roundCompletedEvents$: Observable<RoundCompleteEvent>;
  logger?: Logger;
}) => {
  return forkJoin({
    title: title$,
    roundCompletedEvent: roundCompletedEvents$,
  }).pipe(
    switchMap(({ title, roundCompletedEvent }) => {
      return conversationClient.create({
        id: conversation.id,
        title,
        agent_id: conversation.agent_id,
        access_control: conversation.access_control,
        origin: conversation.origin,
        state: roundCompletedEvent.data.conversation_state,
        status: roundCompletedEvent.data.round.status,
        read: false,
        rounds: [roundCompletedEvent.data.round],
        ...(roundCompletedEvent.data.attachments
          ? { attachments: roundCompletedEvent.data.attachments }
          : {}),
        ...(roundCompletedEvent.data.workspace_id
          ? { workspace_id: roundCompletedEvent.data.workspace_id }
          : {}),
      });
    }),
    switchMap((createdConversation) => {
      // P1+P2: Dual-write timeline events alongside the persisted rounds.
      if (logger) {
        const { round } = createdConversation.rounds[createdConversation.rounds.length - 1]
          ? { round: createdConversation.rounds[createdConversation.rounds.length - 1] }
          : { round: undefined };

        const eventsToAppend: TimelineEvent[] = [
          // Audit event: record conversation creation
          {
            id: uuidv4(),
            type: TimelineEventType.conversationCreated,
            created_at: createdConversation.created_at,
            actor: { type: TimelineEventActorType.system },
            data: {
              agent_id: createdConversation.agent_id,
              title: createdConversation.title,
            },
          },
          // Content events derived from the first round
          ...(round
            ? roundsToEvents([round], { agentId: createdConversation.agent_id })
            : []),
        ];

        appendEventsFireAndForget(
          conversationClient,
          createdConversation.id,
          eventsToAppend,
          logger
        );
      }

      return of(createConversationCreatedEvent(createdConversation));
    })
  );
};

/**
 * Update an existing conversation and emit the corresponding event
 */
export const updateConversation$ = ({
  conversationClient,
  conversation,
  title$,
  roundCompletedEvents$,
  action,
  logger,
}: {
  conversation: Conversation;
  title$: Observable<string>;
  roundCompletedEvents$: Observable<RoundCompleteEvent>;
  conversationClient: ConversationClient;
  action?: ConversationAction;
  logger?: Logger;
}) => {
  return forkJoin({
    title: title$,
    roundCompletedEvent: roundCompletedEvents$,
  }).pipe(
    switchMap(({ title, roundCompletedEvent }) => {
      const { round, resumed = false, conversation_state } = roundCompletedEvent.data;
      // Replace last round when resumed (HITL flow), regenerate action is requested
      const shouldReplaceLastRound = resumed || action === 'regenerate';
      const updatedRound = shouldReplaceLastRound
        ? [...conversation.rounds.slice(0, -1), round]
        : [...conversation.rounds, round];

      // Only set workspace_id if it's new (once set it should not change).
      const newWorkspaceId =
        roundCompletedEvent.data.workspace_id && !conversation.workspace_id
          ? roundCompletedEvent.data.workspace_id
          : undefined;

      return conversationClient.update(
        {
          id: conversation.id,
          title,
          rounds: updatedRound,
          state: conversation_state,
          status: round.status,
          read: false,
          ...(roundCompletedEvent.data.attachments !== undefined
            ? { attachments: roundCompletedEvent.data.attachments }
            : {}),
          ...(newWorkspaceId ? { workspace_id: newWorkspaceId } : {}),
        },
        { access: 'converse' }
      );
    }),
    switchMap((updatedConversation) => {
      // P1+P2: Dual-write timeline events for the new round.
      if (logger) {
        const lastRound =
          updatedConversation.rounds[updatedConversation.rounds.length - 1];
        if (lastRound) {
          const eventsToAppend = roundsToEvents([lastRound], {
            agentId: updatedConversation.agent_id,
          });
          appendEventsFireAndForget(
            conversationClient,
            updatedConversation.id,
            eventsToAppend,
            logger
          );
        }
      }

      return of(createConversationUpdatedEvent(updatedConversation));
    })
  );
};

export type ConversationOperation = 'CREATE' | 'UPDATE';

export type ConversationWithOperation = Conversation & { operation: ConversationOperation };

/**
 * Resolves the conversation to update, or returns a placeholder for one to create.
 * conversationId takes precedence over origin. When no conversationId is provided,
 * origin is used to find an existing conversation before creating a new placeholder.
 * autoCreateConversationWithId only applies when conversationId is provided: missing
 * conversations are created with that ID when enabled, and rejected by get() otherwise.
 * Note: Validation and manipulation for regenerate is handled in runDefaultAgentMode.
 */
export const getConversation = async ({
  agentId,
  conversationId,
  autoCreateConversationWithId = false,
  conversationClient,
  accessControl,
  origin,
}: {
  agentId: string;
  conversationId: string | undefined;
  autoCreateConversationWithId?: boolean;
  conversationClient: ConversationClient;
  accessControl?: ConversationAccessControl;
  origin?: ConversationOrigin;
}): Promise<ConversationWithOperation> => {
  // Case 1: No conversation ID - create new with placeholder
  if (!conversationId) {
    const conversation = origin ? await conversationClient.getByOrigin(origin) : undefined;

    if (conversation) {
      return {
        ...conversation,
        operation: 'UPDATE',
      };
    }

    return {
      ...placeholderConversation({ agentId, accessControl, origin }),
      operation: 'CREATE',
    };
  }

  // Case 2: Conversation ID specified and autoCreate is false - update existing
  if (!autoCreateConversationWithId) {
    return {
      ...(await conversationClient.get(conversationId)),
      operation: 'UPDATE',
    };
  }

  // Case 3: Conversation ID specified and autoCreate is true - check if exists
  const exists = await conversationClient.exists(conversationId);

  if (exists) {
    return {
      ...(await conversationClient.get(conversationId)),
      operation: 'UPDATE',
    };
  } else {
    return {
      ...placeholderConversation({ conversationId, agentId, accessControl, origin }),
      operation: 'CREATE',
    };
  }
};

export const placeholderConversation = ({
  agentId,
  conversationId,
  accessControl,
  origin,
}: {
  agentId: string;
  conversationId?: string;
  accessControl?: ConversationAccessControl;
  origin?: ConversationOrigin;
}): Conversation => {
  return {
    id: conversationId ?? uuidv4(),
    title: 'New conversation',
    agent_id: agentId,
    access_control: accessControl ?? getDefaultConversationAccessControl(),
    rounds: [],
    ...(origin ? { origin } : {}),
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    user: {
      id: 'unknown',
      username: 'unknown',
    },
  };
};
