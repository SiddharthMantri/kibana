/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { RendererTypeDefinition } from '@kbn/agent-builder-server/renderers';
import { renderElement } from '@kbn/agent-builder-common/tools/custom_rendering';
import { MOUNT_POINTS } from '../../../filesystem/mount_points';

const describePayloadSchema = (renderer: RendererTypeDefinition): string => {
  try {
    const { $schema, ...jsonSchema } = z.toJSONSchema(renderer.payloadSchema, {
      unrepresentable: 'any',
      io: 'input',
    }) as Record<string, unknown>;
    return JSON.stringify(jsonSchema);
  } catch {
    return '{}';
  }
};

export interface RenderRenderersPromptOptions {
  /** Whether the bash tool is enabled for this run — render files can only exist via bash. */
  bashEnabled: boolean;
  /**
   * Whether the agent receiving this prompt can call bash to author render files.
   * False for the toolless answer agent, which may only reference files already
   * written during the round.
   */
  canAuthor: boolean;
}

/**
 * Exposes the registered renderers to the agent: the `<render>` directive, the
 * workspace file convention, the self-describing `{ type, data }` envelope, and
 * each type's `data` JSON schema. Returns an empty string when bash is disabled
 * or no renderers are registered, so callers can interpolate unconditionally.
 */
export const renderRenderersPrompt = (
  renderers: RendererTypeDefinition[],
  { bashEnabled, canAuthor }: RenderRenderersPromptOptions
): string => {
  if (!bashEnabled || renderers.length === 0) {
    return '';
  }

  const { tagName, attributes } = renderElement;
  const rendersDir = `${MOUNT_POINTS.workspace}/renders`;

  const typeSections = renderers
    .map((renderer) => {
      const description = renderer.getAgentDescription?.();
      return [
        `#### type: "${renderer.type}"`,
        ...(description ? [description] : []),
        `\`data\` JSON schema: ${describePayloadSchema(renderer)}`,
      ].join('\n');
    })
    .join('\n\n');

  if (!canAuthor) {
    return `### RENDERING OBJECTS
You can render a rich object inline in your reply by emitting a <${tagName}> directive that points at a render file already written to the workspace during this round.

**How to render**
1. Only reference a file that was actually written — an earlier bash tool call in this round wrote a JSON file under \`${rendersDir}/\`. You cannot write or modify files yourself.
2. Copy the path from that bash call verbatim and emit the directive on its own line (never inside a code block), always including the \`${attributes.type}\`:
   \`<${tagName} ${attributes.path}="${rendersDir}/{type}/{id}.json" ${attributes.type}="<render type>" />\`

**Rules**
* NEVER invent, guess, or alter a path. If no render file was written during this round, do not emit a \`<${tagName}>\` directive.
* Only use a \`${attributes.type}\` from the list below.

**Available render types**
${typeSections}`;
  }

  const exampleType = renderers[0].type;

  return `### RENDERING OBJECTS
You can render a rich object inline in your reply by writing its data to a workspace file and emitting a <${tagName}> directive that points at the file.

**How to render**
1. Pick a render type from the list below.
2. Use the bash tool to write a JSON file to \`${rendersDir}/{type}/{id}.json\` — choose a short descriptive {id}, and use a NEW filename whenever you create or change a render (never overwrite an existing file, so earlier replies keep their original render).
3. The file MUST be a self-describing envelope:
   \`{ "type": "<render type>", "data": <object matching that type's data schema> }\`
4. Emit the directive on its own line (never inside a code block), always including the \`${attributes.type}\`:
   \`<${tagName} ${attributes.path}="${rendersDir}/{type}/{id}.json" ${attributes.type}="<render type>" />\`

**Rules**
* Only use a \`${attributes.type}\` from the list below; \`data\` must match that type's schema exactly.
* Always write the file with bash BEFORE emitting the directive, and copy the path verbatim.

**Example**
Write \`${rendersDir}/${exampleType}/example.json\`, then reply with:
\`<${tagName} ${attributes.path}="${rendersDir}/${exampleType}/example.json" ${attributes.type}="${exampleType}" />\`

**Available render types**
${typeSections}`;
};
