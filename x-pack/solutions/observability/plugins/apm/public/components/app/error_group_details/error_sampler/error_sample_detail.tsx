/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPagination,
  EuiPanel,
  EuiSkeletonText,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import styled from '@emotion/styled';
import { ObservabilityTriggerId } from '@kbn/observability-shared-plugin/common';
import { getContextMenuItemsFromActions } from '@kbn/observability-shared-plugin/public';
import { first } from 'lodash';
import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import useAsync from 'react-use/lib/useAsync';
import { ExceptionStacktrace, PlaintextStacktrace, Stacktrace } from '@kbn/event-stacktrace';
import { Timestamp } from '@kbn/apm-ui-shared';
import type { AT_TIMESTAMP } from '../../../../../common/es_fields/apm';
import type { APMError } from '../../../../../typings/es_schemas/ui/apm_error';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useLegacyUrlParams } from '../../../../context/url_params_context/use_url_params';
import { useAnyOfApmParams } from '../../../../hooks/use_apm_params';
import { useApmRouter } from '../../../../hooks/use_apm_router';
import type { FETCH_STATUS } from '../../../../hooks/use_fetcher';
import { isPending, isSuccess } from '../../../../hooks/use_fetcher';
import type { APIReturnType } from '../../../../services/rest/create_call_apm_api';
import { TransactionDetailLink } from '../../../shared/links/apm/transaction_detail_link';
import { DiscoverErrorLink } from '../../../shared/links/discover_links/discover_error_link';
import { fromQuery, toQuery } from '../../../shared/links/url_helpers';
import { ErrorMetadata } from '../../../shared/metadata_table/error_metadata';
import { Summary } from '../../../shared/summary';
import { HttpInfoSummaryItem } from '../../../shared/summary/http_info_summary_item';
import { UserAgentSummaryItem } from '../../../shared/summary/user_agent_summary_item';
import type { ErrorTab } from './error_tabs';
import { ErrorTabKey, getTabs } from './error_tabs';
import { ErrorUiActionsContextMenu } from './error_ui_actions_context_menu';
import { SampleSummary } from './sample_summary';
import { ErrorSampleContextualInsight } from './error_sample_contextual_insight';
import { getComparisonEnabled } from '../../../shared/time_comparison/get_comparison_enabled';
import { buildUrl } from '../../../../utils/build_url';

const TransactionLinkName = styled.div`
  margin-left: ${({ theme }) => theme.euiTheme.size.s};
  display: inline-block;
  vertical-align: middle;
`;

interface Props {
  onSampleClick: (sample: string) => void;
  errorSampleIds: string[];
  errorSamplesFetchStatus: FETCH_STATUS;
  errorData: APIReturnType<'GET /internal/apm/services/{serviceName}/errors/{groupId}/error/{errorId}'>;
  errorFetchStatus: FETCH_STATUS;
  occurrencesCount: number;
}

function getCurrentTab(tabs: ErrorTab[] = [], currentTabKey: string | undefined): ErrorTab | {} {
  const selectedTab = tabs.find(({ key }) => key === currentTabKey);
  return selectedTab ?? (first(tabs) || {});
}

export function ErrorSampleDetails({
  onSampleClick,
  errorSampleIds,
  errorSamplesFetchStatus,
  errorData,
  errorFetchStatus,
  occurrencesCount,
}: Props) {
  const [sampleActivePage, setSampleActivePage] = useState(0);
  const history = useHistory();
  const {
    urlParams: { detailTab, offset, comparisonEnabled },
  } = useLegacyUrlParams();

  const { uiActions, core } = useApmPluginContext();

  const router = useApmRouter();

  const { query } = useAnyOfApmParams(
    '/services/{serviceName}/errors/{groupId}',
    '/mobile-services/{serviceName}/errors-and-crashes/errors/{groupId}',
    '/mobile-services/{serviceName}/errors-and-crashes/crashes/{groupId}'
  );

  const { kuery } = query;

  const loadingErrorSamplesData = isPending(errorSamplesFetchStatus);
  const loadingErrorData = isPending(errorFetchStatus);
  const isLoading = loadingErrorSamplesData || loadingErrorData;

  const isSucceeded = isSuccess(errorSamplesFetchStatus) && isSuccess(errorFetchStatus);

  const defaultComparisonEnabled = getComparisonEnabled({
    core,
    urlComparisonEnabled: comparisonEnabled,
  });

  useEffect(() => {
    setSampleActivePage(0);
  }, [errorSampleIds]);

  const goToSample = (index: number) => {
    const sample = errorSampleIds[index];
    setSampleActivePage(index);
    onSampleClick(sample);
  };

  const { error, transaction } = errorData;

  const externalContextMenuItems = useAsync(() => {
    return getContextMenuItemsFromActions({
      uiActions,
      triggerId: ObservabilityTriggerId.ApmErrorContextMenu,
      context: {
        error,
        transaction,
      },
    });
  }, [error, transaction, uiActions]);

  if (!error && errorSampleIds?.length === 0 && isSucceeded) {
    return (
      <EuiEmptyPrompt
        title={
          <div>
            {i18n.translate('xpack.apm.errorSampleDetails.sampleNotFound', {
              defaultMessage: 'The selected error cannot be found',
            })}
          </div>
        }
        titleSize="s"
      />
    );
  }

  const tabs = getTabs(error);
  const currentTab = getCurrentTab(tabs, detailTab) as ErrorTab;
  const urlFromError = error.error.page?.url || error.url?.full;
  const urlFromTransaction = transaction?.transaction?.page?.url || transaction?.url?.full;
  const errorOrTransactionUrl = error?.url ? error : transaction;
  const errorOrTransactionHttp = error?.http ? error : transaction;
  const errorOrTransactionUserAgent = error?.user_agent
    ? error.user_agent
    : transaction?.user_agent;

  // To get the error data needed for the summary we use the transaction fallback in case
  // the error data is not available.
  // In case of OTel the error data is not available in the error response and we need to use
  // the associated root span data (which is called "transaction" here because of the APM data model).
  const errorUrl = urlFromError || urlFromTransaction || buildUrl(errorOrTransactionUrl);
  const method = errorOrTransactionHttp?.http?.request?.method;
  const status = errorOrTransactionHttp?.http?.response?.status_code;
  const userAgent = errorOrTransactionUserAgent;
  const environment = error.service.environment;
  const serviceVersion = error.service.version;
  const isUnhandled = error.error.exception?.[0]?.handled === false;

  return (
    <EuiPanel hasBorder={true}>
      <EuiFlexGroup alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h3>
              {i18n.translate('xpack.apm.errorSampleDetails.errorOccurrenceTitle', {
                defaultMessage: 'Error sample',
              })}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow>
          {!!errorSampleIds?.length && (
            <EuiPagination
              pageCount={errorSampleIds.length}
              activePage={sampleActivePage}
              onPageClick={goToSample}
              compressed
            />
          )}
        </EuiFlexItem>
        {externalContextMenuItems.value?.length ? (
          <ErrorUiActionsContextMenu items={externalContextMenuItems.value} />
        ) : undefined}
        <EuiFlexItem grow={false}>
          <DiscoverErrorLink error={error} kuery={kuery}>
            <EuiFlexGroup alignItems="center" gutterSize="s">
              <EuiFlexItem>
                <EuiIcon type="discoverApp" />
              </EuiFlexItem>
              <EuiFlexItem css={{ whiteSpace: 'nowrap' }}>
                {i18n.translate(
                  'xpack.apm.errorSampleDetails.viewOccurrencesInDiscoverButtonLabel',
                  {
                    defaultMessage:
                      'View {occurrencesCount} {occurrencesCount, plural, one {occurrence} other {occurrences}} in Discover',
                    values: { occurrencesCount },
                  }
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
          </DiscoverErrorLink>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer />
      {isLoading ? (
        <EuiFlexItem grow={false}>
          <EuiSpacer size="s" />
          <EuiSkeletonText lines={2} data-test-sub="loading-content" />
        </EuiFlexItem>
      ) : (
        <Summary
          items={[
            <Timestamp
              timestamp={errorData ? error.timestamp.us / 1000 : 0}
              renderMode="tooltip"
            />,
            errorUrl ? (
              <HttpInfoSummaryItem url={errorUrl} method={method} status={status} />
            ) : null,
            userAgent?.name ? <UserAgentSummaryItem {...userAgent} /> : null,
            transaction && (
              <EuiToolTip
                content={i18n.translate('xpack.apm.errorSampleDetails.relatedTransactionSample', {
                  defaultMessage: 'Related transaction sample',
                })}
              >
                <TransactionDetailLink
                  transactionName={transaction.transaction.name}
                  href={router.link('/services/{serviceName}/transactions/view', {
                    path: { serviceName: transaction.service.name },
                    query: {
                      ...query,
                      traceId: transaction.trace.id,
                      transactionId: transaction.transaction.id,
                      transactionName: transaction.transaction.name,
                      transactionType: transaction.transaction.type,
                      comparisonEnabled: defaultComparisonEnabled,
                      showCriticalPath: false,
                      offset,
                      kuery,
                    },
                  })}
                >
                  <EuiIcon type="merge" />
                  <TransactionLinkName>{transaction.transaction.name}</TransactionLinkName>
                </TransactionDetailLink>
              </EuiToolTip>
            ),
            environment ? (
              <EuiToolTip
                content={i18n.translate('xpack.apm.errorSampleDetails.serviceEnvironment', {
                  defaultMessage: 'Environment',
                })}
              >
                <EuiBadge color="hollow">{environment}</EuiBadge>
              </EuiToolTip>
            ) : null,
            serviceVersion ? (
              <EuiToolTip
                content={i18n.translate('xpack.apm.errorSampleDetails.serviceVersion', {
                  defaultMessage: 'Service version',
                })}
              >
                <EuiBadge color="hollow">{serviceVersion}</EuiBadge>
              </EuiToolTip>
            ) : null,
            isUnhandled ? (
              <EuiBadge color="warning">
                {i18n.translate('xpack.apm.errorGroupDetails.unhandledLabel', {
                  defaultMessage: 'Unhandled',
                })}
              </EuiBadge>
            ) : null,
          ]}
        />
      )}

      <EuiSpacer />
      {isLoading ? (
        <EuiFlexItem grow={false}>
          <EuiSpacer size="s" />
          <EuiSkeletonText lines={3} data-test-sub="loading-content" />
        </EuiFlexItem>
      ) : (
        <SampleSummary error={error} />
      )}

      <ErrorSampleContextualInsight error={error} transaction={transaction} />

      <EuiTabs>
        {tabs.map(({ key, label }) => {
          return (
            <EuiTab
              onClick={() => {
                history.replace({
                  ...history.location,
                  search: fromQuery({
                    ...toQuery(history.location.search),
                    detailTab: key,
                  }),
                });
              }}
              isSelected={currentTab.key === key}
              key={key}
            >
              {label}
            </EuiTab>
          );
        })}
      </EuiTabs>
      <EuiSpacer />
      {isLoading || !error ? (
        <EuiSkeletonText lines={3} data-test-sub="loading-content" />
      ) : (
        <ErrorSampleDetailTabContent error={error} currentTab={currentTab} />
      )}
    </EuiPanel>
  );
}

export function ErrorSampleDetailTabContent({
  error,
  currentTab,
}: {
  error: {
    service: {
      language?: {
        name?: string;
      };
    };
    [AT_TIMESTAMP]: string;
    error: Pick<APMError['error'], 'id' | 'log' | 'stack_trace' | 'exception'>;
  };
  currentTab: ErrorTab;
}) {
  const codeLanguage = error?.service.language?.name;
  const exceptions = error?.error.exception || [];
  const logStackframes = error?.error.log?.stacktrace;
  const isPlaintextException =
    !!error.error.stack_trace && exceptions.length === 1 && !exceptions[0].stacktrace;
  switch (currentTab.key) {
    case ErrorTabKey.LogStackTrace:
      return <Stacktrace stackframes={logStackframes} codeLanguage={codeLanguage} />;
    case ErrorTabKey.ExceptionStacktrace:
      return isPlaintextException ? (
        <PlaintextStacktrace
          message={exceptions[0].message}
          type={exceptions[0]?.type}
          stacktrace={error?.error.stack_trace}
          codeLanguage={codeLanguage}
        />
      ) : (
        <ExceptionStacktrace codeLanguage={codeLanguage} exceptions={exceptions} />
      );
    default:
      return <ErrorMetadata error={error} />;
  }
}
