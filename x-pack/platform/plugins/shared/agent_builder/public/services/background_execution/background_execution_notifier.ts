/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { timer, type Observable, takeUntil, filter, mergeMap, catchError, of } from 'rxjs';
import type { HttpSetup } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import { i18n } from '@kbn/i18n';
import { internalApiPath } from '../../../common/constants';
import { pendingExecutions } from './pending_executions';

/**
 * Duration (ms) to keep completion toasts visible. Set very high so the user
 * sees the notification when returning to a tab they left hours ago.
 */
const TOAST_LIFETIME_MS = 24 * 60 * 60 * 1000;

interface ExecutionStatusResult {
  executionId: string;
  status: string;
  error?: { message: string };
}

interface FindExecutionsResponse {
  executions: ExecutionStatusResult[];
}

/**
 * Polls the server for terminal execution status of background (continue-on-
 * disconnect) runs whose IDs are stored in localStorage. When a terminal state
 * is detected, shows an in-app toast and removes the ID from storage.
 *
 * Mirrors the Reporting plugin's `ReportingNotifierStreamHandler` pattern.
 */
export class BackgroundExecutionNotifier {
  constructor(
    private readonly http: HttpSetup,
    private readonly notifications: NotificationsStart
  ) {}

  /**
   * Begin polling. The interval fires immediately on start and then every
   * `intervalMs` until `stop$` emits.
   */
  startPolling(intervalMs: number, stop$: Observable<void>): void {
    timer(0, intervalMs)
      .pipe(
        takeUntil(stop$),
        mergeMap(() => {
          const ids = pendingExecutions.getAll();
          if (ids.length === 0) return of(undefined);
          return this.checkAndNotify(ids);
        }),
        catchError((err) => {
          // eslint-disable-next-line no-console
          console.error('[BackgroundExecutionNotifier] polling error', err);
          return of(undefined);
        })
      )
      .subscribe();
  }

  private async checkAndNotify(executionIds: string[]): Promise<void> {
    const { executions } = await this.http.post<FindExecutionsResponse>(
      `${internalApiPath}/executions/_find`,
      { body: JSON.stringify({ execution_ids: executionIds }) }
    );

    for (const exec of executions) {
      if (exec.status === 'completed') {
        pendingExecutions.remove(exec.executionId);
        this.notifications.toasts.addSuccess(
          {
            title: i18n.translate('xpack.agentBuilder.backgroundExecution.completed.title', {
              defaultMessage: 'Agent run completed',
            }),
            text: i18n.translate('xpack.agentBuilder.backgroundExecution.completed.text', {
              defaultMessage:
                'A background agent execution finished successfully while you were away.',
            }),
          },
          { toastLifeTimeMs: TOAST_LIFETIME_MS }
        );
      } else if (exec.status === 'failed') {
        pendingExecutions.remove(exec.executionId);
        this.notifications.toasts.addDanger({
          title: i18n.translate('xpack.agentBuilder.backgroundExecution.failed.title', {
            defaultMessage: 'Agent run failed',
          }),
          text:
            exec.error?.message ??
            i18n.translate('xpack.agentBuilder.backgroundExecution.failed.text', {
              defaultMessage:
                'A background agent execution failed while you were away.',
            }),
        });
      } else if (exec.status === 'aborted') {
        pendingExecutions.remove(exec.executionId);
      }
      // 'scheduled' | 'running' → keep polling
    }
  }
}
