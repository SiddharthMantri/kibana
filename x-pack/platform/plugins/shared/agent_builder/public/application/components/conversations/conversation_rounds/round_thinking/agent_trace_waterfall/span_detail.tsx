/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButtonIcon,
  EuiCallOut,
  EuiCodeBlock,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { SPAN_COLORS } from './constants';
import type { NormalizedSpan } from './types';
import { getSpanCategory } from './utils';

interface SpanDetailProps {
  span: NormalizedSpan;
  onClose: () => void;
}

/**
 * Renders detailed metadata for the currently selected span.
 */
export const SpanDetail: React.FC<SpanDetailProps> = ({ span, onClose }) => {
  const category = getSpanCategory(span);
  const inputTokens =
    (span.attributes?.['gen_ai.usage.input_tokens'] as number | undefined) ??
    span.gen_ai?.usage_input_tokens;
  const outputTokens =
    (span.attributes?.['gen_ai.usage.output_tokens'] as number | undefined) ??
    span.gen_ai?.usage_output_tokens;
  const hasTokens = inputTokens != null || outputTokens != null;
  const otherAttrs = Object.entries(span.attributes ?? {}).filter(
    ([key]) =>
      key !== 'gen_ai.usage.input_tokens' &&
      key !== 'gen_ai.usage.output_tokens' &&
      key !== 'gen_ai.usage.total_tokens' &&
      key !== '_ab_should_track'
  );

  return (
    <EuiPanel hasBorder hasShadow={false} paddingSize="s">
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <span
                style={{
                  display: 'inline-block',
                  width: 4,
                  height: 20,
                  borderRadius: 2,
                  backgroundColor: SPAN_COLORS[category],
                  flexShrink: 0,
                }}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="s">
                <h4 style={{ margin: 0 }}>{span.name}</h4>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            iconType="cross"
            aria-label={i18n.translate('xpack.agentBuilder.traceWaterfall.closeDetailAria', {
              defaultMessage: 'Close span detail',
            })}
            onClick={onClose}
            size="s"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>
              {i18n.translate('xpack.agentBuilder.traceWaterfall.durationLabel', {
                defaultMessage: 'Duration:',
              })}
            </strong>{' '}
            {(span.duration_ms ?? 0).toFixed(1)}ms
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>
              {i18n.translate('xpack.agentBuilder.traceWaterfall.kindLabel', {
                defaultMessage: 'Kind:',
              })}
            </strong>{' '}
            {span.kind ?? '-'}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>
              {i18n.translate('xpack.agentBuilder.traceWaterfall.statusLabel', {
                defaultMessage: 'Status:',
              })}
            </strong>{' '}
            {span.status ?? '-'}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      {hasTokens && (
        <>
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="m" responsive={false}>
            {inputTokens != null && (
              <EuiFlexItem>
                <EuiStat
                  title={String(inputTokens)}
                  description={i18n.translate('xpack.agentBuilder.traceWaterfall.inputTokensDesc', {
                    defaultMessage: 'Input tokens',
                  })}
                  titleSize="xxs"
                  isLoading={false}
                />
              </EuiFlexItem>
            )}
            {outputTokens != null && (
              <EuiFlexItem>
                <EuiStat
                  title={String(outputTokens)}
                  description={i18n.translate('xpack.agentBuilder.traceWaterfall.outputTokensDesc', {
                    defaultMessage: 'Output tokens',
                  })}
                  titleSize="xxs"
                  isLoading={false}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </>
      )}

      {span.error && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            color="danger"
            iconType="error"
            title={
              span.error.type ??
              i18n.translate('xpack.agentBuilder.traceWaterfall.errorTitle', {
                defaultMessage: 'Error',
              })
            }
            size="s"
            announceOnMount={false}
          >
            {span.error.message && <p>{span.error.message}</p>}
          </EuiCallOut>
        </>
      )}

      {otherAttrs.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiAccordion
            id={`attrs-${span.span_id}`}
            buttonContent={i18n.translate('xpack.agentBuilder.traceWaterfall.attributesHeading', {
              defaultMessage: 'Attributes ({count})',
              values: { count: otherAttrs.length },
            })}
            paddingSize="xs"
          >
            <table style={{ fontSize: '12px', width: '100%' }}>
              <tbody>
                {otherAttrs.map(([key, value]) => {
                  const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                  return (
                    <tr key={key}>
                      <td
                        style={{
                          fontWeight: 'bold',
                          padding: '2px 8px 2px 0',
                          whiteSpace: 'nowrap',
                          verticalAlign: 'top',
                        }}
                      >
                        {key}
                      </td>
                      <td style={{ padding: '2px 0', wordBreak: 'break-all' }}>
                        <EuiFlexGroup gutterSize="xs" alignItems="flexStart" responsive={false}>
                          <EuiFlexItem>{strValue}</EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiCopy textToCopy={strValue}>
                              {(copy) => (
                                <EuiButtonIcon
                                  iconType="copy"
                                  aria-label={i18n.translate(
                                    'xpack.agentBuilder.traceWaterfall.copyAttrAria',
                                    {
                                      defaultMessage: 'Copy {key}',
                                      values: { key },
                                    }
                                  )}
                                  onClick={copy}
                                  size="xs"
                                  color="text"
                                  style={{ opacity: 0.4 }}
                                />
                              )}
                            </EuiCopy>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </EuiAccordion>
        </>
      )}

      {span.gen_ai?.request_model && (
        <>
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="subdued">
            {i18n.translate('xpack.agentBuilder.traceWaterfall.modelLabel', {
              defaultMessage: 'Model: {model}',
              values: { model: span.gen_ai.response_model ?? span.gen_ai.request_model },
            })}
          </EuiText>
        </>
      )}

      {span.tool?.name && (
        <>
          <EuiSpacer size="xs" />
          <EuiBadge color="hollow">{span.tool.name}</EuiBadge>
        </>
      )}

      {span.gen_ai?.system && (
        <>
          <EuiSpacer size="xs" />
          <EuiCodeBlock language="text" fontSize="s" paddingSize="s">
            {`system: ${span.gen_ai.system}\noperation: ${span.gen_ai.operation_name ?? '-'}`}
          </EuiCodeBlock>
        </>
      )}
    </EuiPanel>
  );
};
