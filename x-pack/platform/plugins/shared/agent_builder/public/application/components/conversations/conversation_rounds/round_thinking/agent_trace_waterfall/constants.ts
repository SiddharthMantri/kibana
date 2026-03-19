/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const LABEL_WIDTH = 360;
export const INDENT_PX = 16;
export const ROW_HEIGHT = 26;
export const BAR_HEIGHT = 18;
export const BAR_MIN_WIDTH = 2;

export type SpanCategory = 'llm' | 'tool' | 'search' | 'http' | 'other';

export const SPAN_COLORS: Record<SpanCategory, string> = {
  llm: '#6DCCB1',
  tool: '#79AAD9',
  search: '#EE789D',
  http: '#B9A888',
  other: '#D6BF57',
};
