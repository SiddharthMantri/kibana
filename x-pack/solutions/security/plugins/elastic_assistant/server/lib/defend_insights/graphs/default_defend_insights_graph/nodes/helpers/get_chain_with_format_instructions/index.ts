/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionsClientLlm } from '@kbn/langchain/server';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Runnable } from '@langchain/core/runnables';
import type { DefendInsightType } from '@kbn/elastic-assistant-common';

import { DefendInsightsGenerationPrompts } from '../prompts/incompatible_antivirus';
import { getOutputParser } from '../get_output_parser';

interface GetChainWithFormatInstructions {
  chain: Runnable;
  formatInstructions: string;
  llmType: string;
}

export const getChainWithFormatInstructions = ({
  insightType,
  llm,
  prompts,
}: {
  insightType: DefendInsightType;
  llm: ActionsClientLlm;
  prompts: DefendInsightsGenerationPrompts;
}): GetChainWithFormatInstructions => {
  const outputParser = getOutputParser({ type: insightType, prompts });
  const formatInstructions = outputParser.getFormatInstructions();

  const prompt = ChatPromptTemplate.fromTemplate(
    `Answer the user's question as best you can:\n{format_instructions}\n{query}`
  );

  const chain = prompt.pipe(llm);
  const llmType = llm._llmType();

  return { chain, formatInstructions, llmType };
};
