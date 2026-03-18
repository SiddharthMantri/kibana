/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { useKibana } from './use_kibana';
import { internalApiPath } from '../../../common/constants';
import { queryKeys } from '../query_keys';

export interface TraceSpanResponse {
  span_id: string;
  parent_span_id?: string;
  name: string;
  kind: string;
  '@timestamp': string;
  duration_ms: number;
  status: string;
  gen_ai?: {
    operation_name?: string;
    system?: string;
    request_model?: string;
    response_model?: string;
    usage_input_tokens?: number;
    usage_output_tokens?: number;
  };
  tool?: {
    name?: string;
  };
  error?: {
    message?: string;
    type?: string;
  };
  attributes?: Record<string, unknown>;
}

export interface GetTraceResponse {
  _id: string;
  trace_id: string;
  agent_id?: string;
  conversation_id?: string;
  space_id?: string;
  '@timestamp': string;
  duration_ms: number;
  status: string;
  span_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  spans: TraceSpanResponse[];
}

export const useAgentTrace = (traceId: string | null) => {
  const { services } = useKibana();

  return useQuery({
    queryKey: queryKeys.traces.detail(traceId ?? ''),
    enabled: traceId != null && traceId.length > 0,
    queryFn: (): Promise<GetTraceResponse> =>
      services.http.get<GetTraceResponse>(`${internalApiPath}/traces/${traceId}`, {
        version: '1',
      }),
  });
};
