/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { PrettyDuration } from '@elastic/eui';
import {
  Action,
  ActionExecutionMeta,
  FrequentCompatibilityChangeAction,
  IncompatibleActionError,
} from '@kbn/ui-actions-plugin/public';
import React from 'react';

import { UI_SETTINGS } from '@kbn/data-plugin/common';
import { apiPublishesTimeRange, EmbeddableApiContext } from '@kbn/presentation-publishing';
import { map } from 'rxjs';
import { ACTION_CUSTOMIZE_PANEL, CUSTOM_TIME_RANGE_BADGE } from './constants';
import { core, uiActions } from '../../kibana_services';

export class CustomTimeRangeBadge
  implements Action<EmbeddableApiContext>, FrequentCompatibilityChangeAction<EmbeddableApiContext>
{
  public readonly type = CUSTOM_TIME_RANGE_BADGE;
  public readonly id = CUSTOM_TIME_RANGE_BADGE;
  public order = 7;

  public getDisplayName({ embeddable }: EmbeddableApiContext) {
    if (!apiPublishesTimeRange(embeddable)) throw new IncompatibleActionError();
    /**
     * WARNING!! We would not normally return an empty string here - but in order for i18n to be
     * handled properly by the `PrettyDuration` component, we need it to handle the aria label.
     */
    return '';
  }

  public readonly MenuItem = ({ context }: { context: EmbeddableApiContext }) => {
    const { embeddable } = context;
    if (!apiPublishesTimeRange(embeddable)) throw new IncompatibleActionError();

    const timeRange = embeddable.timeRange$.getValue();
    if (!timeRange) {
      throw new IncompatibleActionError();
    }
    return (
      <PrettyDuration
        timeTo={timeRange.to}
        timeFrom={timeRange.from}
        dateFormat={core.uiSettings.get<string>(UI_SETTINGS.DATE_FORMAT) ?? 'Browser'}
      />
    );
  };

  public couldBecomeCompatible({ embeddable }: EmbeddableApiContext) {
    return apiPublishesTimeRange(embeddable);
  }

  public getCompatibilityChangesSubject({ embeddable }: EmbeddableApiContext) {
    return apiPublishesTimeRange(embeddable)
      ? embeddable.timeRange$.pipe(map(() => undefined))
      : undefined;
  }

  public async execute(context: ActionExecutionMeta & EmbeddableApiContext) {
    const action = await uiActions.getAction(ACTION_CUSTOMIZE_PANEL);
    action.execute(context);
  }

  public getIconType() {
    return 'calendar';
  }

  public async isCompatible({ embeddable }: EmbeddableApiContext) {
    if (apiPublishesTimeRange(embeddable)) {
      const timeRange = embeddable.timeRange$.value;
      return Boolean(timeRange);
    }
    return false;
  }
}
