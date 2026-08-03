/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationRound } from '@kbn/agent-builder-common';
import type { TimelineEvent } from '@kbn/agent-builder-common/chat';
import { eventsToDisplayRounds as coreEventsToDisplayRounds } from '@kbn/agent-builder-common/chat';

/**
 * P3 UI adapter: converts a timeline event log to the `ConversationRound[]` shape consumed by the
 * UI components.
 *
 * During P0–P3 the HTTP API still returns `rounds` as the source of truth, so this adapter is
 * available as a drop-in replacement for callers that already have events available (e.g. from a
 * future API version or the locally-built event stream). Switching the primary rendering path to
 * use this adapter will happen in P4 when events become the source of truth.
 *
 * Usage:
 * ```typescript
 * const rounds = eventsToDisplayRounds(conversation.conversation_events ?? []);
 * ```
 */
export const eventsToDisplayRounds = (events: TimelineEvent[]): ConversationRound[] => {
  return coreEventsToDisplayRounds(events);
};
