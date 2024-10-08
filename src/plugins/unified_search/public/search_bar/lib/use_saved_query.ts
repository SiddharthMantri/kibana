/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useState, useEffect } from 'react';
import { i18n } from '@kbn/i18n';

import type { CoreStart } from '@kbn/core/public';
import type { SavedQuery } from '@kbn/data-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import { populateStateFromSavedQuery } from './populate_state_from_saved_query';
import { clearStateFromSavedQuery } from './clear_saved_query';

interface UseSavedQueriesProps {
  queryService: DataPublicPluginStart['query'];
  notifications: CoreStart['notifications'];
  savedQueryId?: string;
}

interface UseSavedQueriesReturn {
  savedQuery?: SavedQuery;
  setSavedQuery: (savedQuery: SavedQuery) => void;
  clearSavedQuery: () => void;
}

export const useSavedQuery = (props: UseSavedQueriesProps): UseSavedQueriesReturn => {
  // Handle saved queries
  const [savedQuery, setSavedQuery] = useState<SavedQuery | undefined>();

  // Effect is used to convert a saved query id into an object
  useEffect(() => {
    const fetchSavedQuery = async (savedQueryId: string) => {
      try {
        // fetch saved query
        const newSavedQuery = await props.queryService.savedQueries.getSavedQuery(savedQueryId);
        // Make sure we set the saved query to the most recent one
        if (newSavedQuery && newSavedQuery.id === savedQueryId) {
          setSavedQuery(newSavedQuery);
          populateStateFromSavedQuery(props.queryService, newSavedQuery);
        }
      } catch (error) {
        // Clear saved query
        setSavedQuery(undefined);
        clearStateFromSavedQuery(props.queryService);
        // notify of saving error
        props.notifications.toasts.addWarning({
          title: i18n.translate('unifiedSearch.search.unableToGetSavedQueryToastTitle', {
            defaultMessage: 'Unable to load query {savedQueryId}',
            values: { savedQueryId },
          }),
          text: `${error.message}`,
        });
      }
    };

    if (props.savedQueryId) fetchSavedQuery(props.savedQueryId);
    else setSavedQuery(undefined);
  }, [
    props.notifications.toasts,
    props.queryService,
    props.queryService.savedQueries,
    props.savedQueryId,
  ]);

  return {
    savedQuery,
    setSavedQuery: (q: SavedQuery) => {
      setSavedQuery(q);
      populateStateFromSavedQuery(props.queryService, q);
    },
    clearSavedQuery: () => {
      setSavedQuery(undefined);
      clearStateFromSavedQuery(props.queryService);
    },
  };
};
