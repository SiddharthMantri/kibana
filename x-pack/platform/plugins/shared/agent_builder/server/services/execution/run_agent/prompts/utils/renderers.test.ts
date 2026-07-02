/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { RendererTypeDefinition } from '@kbn/agent-builder-server/renderers';
import { renderRenderersPrompt } from './renderers';

const tableRenderer: RendererTypeDefinition = {
  type: 'table',
  payloadSchema: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.unknown())),
  }),
  getAgentDescription: () => 'Renders a dataset as an interactive table.',
};

describe('renderRenderersPrompt', () => {
  const authorOpts = { bashEnabled: true, canAuthor: true };

  it('returns an empty string when bash is disabled', () => {
    expect(renderRenderersPrompt([tableRenderer], { bashEnabled: false, canAuthor: true })).toBe(
      ''
    );
  });

  it('returns an empty string when no renderers are registered', () => {
    expect(renderRenderersPrompt([], authorOpts)).toBe('');
  });

  describe('authoring variant (canAuthor: true)', () => {
    const prompt = renderRenderersPrompt([tableRenderer], authorOpts);

    it('documents the <render> directive with path and type attributes', () => {
      expect(prompt).toContain('<render');
      expect(prompt).toContain('path=');
      expect(prompt).toContain('type=');
    });

    it('documents the workspace path convention and self-describing envelope', () => {
      expect(prompt).toContain('/workspace/renders/');
      expect(prompt).toContain('"type"');
      expect(prompt).toContain('"data"');
    });

    it('instructs the agent to write the file with bash before emitting', () => {
      expect(prompt).toContain('bash tool');
      expect(prompt).toContain('BEFORE emitting the directive');
    });

    it('advertises each registered type, its description, and its data schema', () => {
      expect(prompt).toContain('table');
      expect(prompt).toContain('Renders a dataset as an interactive table.');
      expect(prompt).toContain('columns');
      expect(prompt).toContain('rows');
    });
  });

  describe('reference-only variant (canAuthor: false)', () => {
    const prompt = renderRenderersPrompt([tableRenderer], {
      bashEnabled: true,
      canAuthor: false,
    });

    it('never instructs the agent to write files', () => {
      expect(prompt).not.toContain('Use the bash tool to write');
      expect(prompt).toContain('You cannot write or modify files yourself');
    });

    it('forbids inventing paths', () => {
      expect(prompt).toContain('NEVER invent, guess, or alter a path');
    });

    it('still documents the directive and advertises the types', () => {
      expect(prompt).toContain('<render');
      expect(prompt).toContain('/workspace/renders/');
      expect(prompt).toContain('#### type: "table"');
    });
  });
});
