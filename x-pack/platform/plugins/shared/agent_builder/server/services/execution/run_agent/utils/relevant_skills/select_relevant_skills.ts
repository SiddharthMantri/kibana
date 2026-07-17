/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { Logger } from '@kbn/logging';
import type { BaseMessageLike } from '@langchain/core/messages';
import { ElasticGenAIAttributes, withActiveInferenceSpan } from '@kbn/inference-tracing';
import { createUserMessage } from '@kbn/agent-builder-genai-utils/langchain';
import { EffortLevels, type RelevantSkill } from '@kbn/agent-builder-common';
import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import type { ModelProvider } from '@kbn/agent-builder-server/runner';
import { getSkillAbsolutePath } from '../../../runner/store/volumes/skills/utils';

/**
 * At or below this many skills, all of them fit cheaply in context, so we skip the model call and
 * treat every skill as relevant.
 */
export const SMALL_SKILL_THRESHOLD = 3;

/** Time budget for the fast-model selection call before we fall back to no notification. */
export const RELEVANT_SKILLS_TIMEOUT_MS = 10_000;

/** Upper bound on the recent-context slice handed to the selector, to keep the fast call cheap. */
const MAX_RECENT_CONTEXT_CHARS = 4_000;
const MAX_RECENT_CONTEXT_ROUNDS = 3;

export interface RelevantSkillSelection {
  skills: RelevantSkill[];
}

export interface SelectRelevantSkillsParams {
  skills: InternalSkillDefinition[];
  context: { userMessage: string; recentContext?: string };
  modelProvider: ModelProvider;
  logger: Logger;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

const selectionSchema = z
  .object({
    skills: z
      .array(
        z.object({
          id: z.string().describe('The id of a relevant skill, copied exactly from the catalog'),
          relevance_note: z
            .string()
            .optional()
            .describe('One short sentence on why this skill is relevant to the request'),
        })
      )
      .describe(
        'Skills relevant to the request, most relevant first. Empty when none clearly apply.'
      ),
  })
  .describe('Tool used to report which of the listed skills are relevant to the user request');

const toRelevantSkill = (
  skill: InternalSkillDefinition,
  relevanceNote?: string
): RelevantSkill => ({
  id: skill.id,
  name: skill.name,
  path: getSkillAbsolutePath({ skill }),
  description: skill.description,
  ...(relevanceNote ? { relevance_note: relevanceNote } : {}),
});

/**
 * Builds a bounded, plain-text slice of recent conversation history to give the selector context
 * beyond the current message. Structurally typed so it accepts both raw and processed rounds.
 */
export const buildRecentContext = (
  rounds: Array<{ input?: { message?: string }; response?: { message?: string } }>,
  { maxChars = MAX_RECENT_CONTEXT_CHARS, maxRounds = MAX_RECENT_CONTEXT_ROUNDS } = {}
): string => {
  const text = rounds
    .slice(-maxRounds)
    .map(
      (round) => `User: ${round.input?.message ?? ''}\nAssistant: ${round.response?.message ?? ''}`
    )
    .join('\n\n');
  return text.length > maxChars ? text.slice(text.length - maxChars) : text;
};

/**
 * Selects the skills relevant to the current request using a single fast-model call.
 */
export const selectRelevantSkills = async ({
  skills,
  context,
  modelProvider,
  logger,
  abortSignal,
  timeoutMs = RELEVANT_SKILLS_TIMEOUT_MS,
}: SelectRelevantSkillsParams): Promise<RelevantSkillSelection> => {
  if (skills.length === 0) {
    return { skills: [] };
  }
  if (skills.length <= SMALL_SKILL_THRESHOLD) {
    return { skills: skills.map((skill) => toRelevantSkill(skill)) };
  }

  try {
    return await withActiveInferenceSpan(
      'select_relevant_skills',
      { attributes: { [ElasticGenAIAttributes.InferenceSpanKind]: 'CHAIN' } },
      async () => {
        const { chatModel } = await modelProvider.selectModel({ effortLevel: EffortLevels.low });
        const structuredModel = chatModel.withStructuredOutput(selectionSchema, {
          name: 'select_relevant_skills',
        });

        const catalog = skills
          .map((skill) => `- ${skill.id}: ${skill.name} — ${skill.description}`)
          .join('\n');

        const userContent = context.recentContext
          ? `Recent conversation (for context):\n${context.recentContext}\n\nCurrent request:\n${context.userMessage}`
          : context.userMessage;

        const prompt: BaseMessageLike[] = [
          [
            'system',
            `You are a skill-selection utility for an AI agent. Given a catalog of available skills and the user's current request, pick ONLY the skills clearly relevant to that request.

Rules:
- Return skill ids EXACTLY as they appear in the catalog. Never invent ids.
- Prefer precision: if nothing clearly applies, return an empty list.
- Order the results by relevance, most relevant first.
- For each selected skill, add a one-sentence note on why it is relevant to this request.

You MUST call the 'select_relevant_skills' tool to report your answer.

## Available skills
${catalog}`,
          ],
          createUserMessage(userContent || '[no message]'),
        ];

        const result = await withTimeoutAndAbort(
          (signal) => structuredModel.invoke(prompt, { signal }),
          { timeoutMs, abortSignal }
        );

        // Map ids back to full skill objects, dropping any hallucinated ids.
        const byId = new Map(skills.map((skill) => [skill.id, skill]));
        const selected: RelevantSkill[] = [];
        for (const item of result.skills ?? []) {
          const skill = byId.get(item.id);
          if (skill) {
            selected.push(toRelevantSkill(skill, item.relevance_note));
          }
        }
        return { skills: selected };
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `selectRelevantSkills failed; falling back to no relevant-skills notification: ${message}`
    );
    return { skills: [] };
  }
};

const withTimeoutAndAbort = async <T>(
  fn: (signal: AbortSignal) => Promise<T>,
  { timeoutMs, abortSignal }: { timeoutMs: number; abortSignal?: AbortSignal }
): Promise<T> => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (abortSignal) {
    if (abortSignal.aborted) {
      controller.abort();
    } else {
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const aborted = new Promise<never>((_resolve, reject) => {
    if (controller.signal.aborted) {
      reject(new Error('selectRelevantSkills aborted'));
    } else {
      controller.signal.addEventListener(
        'abort',
        () => reject(new Error('selectRelevantSkills aborted')),
        { once: true }
      );
    }
  });

  try {
    const operation = fn(controller.signal);
    // Prevent an unhandled rejection if the operation settles after the race is already decided.
    operation.catch(() => {});
    return await Promise.race([operation, aborted]);
  } finally {
    clearTimeout(timer);
    abortSignal?.removeEventListener('abort', onAbort);
  }
};
