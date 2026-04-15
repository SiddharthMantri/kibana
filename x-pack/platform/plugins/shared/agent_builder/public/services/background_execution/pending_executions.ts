/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const STORAGE_KEY_PREFIX = 'agentBuilder:pendingExecution:';

/**
 * Maximum age for a pending execution entry before it is considered stale and
 * cleaned up automatically (24 hours). Prevents orphaned entries from
 * accumulating in localStorage indefinitely.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingEntry {
  executionId: string;
  storedAt: number;
}

/**
 * Manages localStorage entries that track agent executions started with
 * `continueOnDisconnect`. Mirrors the Reporting plugin's
 * `jobCompletionNotifications` pattern.
 */
export const pendingExecutions = {
  getAll(): string[] {
    const ids: string[] = [];
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_KEY_PREFIX)) continue;
      try {
        const entry: PendingEntry = JSON.parse(localStorage.getItem(key)!);
        if (now - entry.storedAt > MAX_AGE_MS) {
          localStorage.removeItem(key);
        } else {
          ids.push(entry.executionId);
        }
      } catch {
        localStorage.removeItem(key!);
      }
    }
    return ids;
  },

  add(executionId: string): void {
    const entry: PendingEntry = { executionId, storedAt: Date.now() };
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${executionId}`, JSON.stringify(entry));
  },

  remove(executionId: string): void {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${executionId}`);
  },

  clear(): void {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  },
};
