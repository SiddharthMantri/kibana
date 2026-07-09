/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import type {
  AgentBuilderPlatformPluginSetup,
  AgentBuilderPlatformPluginStart,
  PluginSetupDependencies,
  PluginStartDependencies,
} from './types';
import { registerAttachmentUiDefinitions } from './attachment_types';
import { createTableRendererUiDefinition } from './renderers/table_renderer';

export class AgentBuilderPlatformPlugin
  implements
    Plugin<
      AgentBuilderPlatformPluginSetup,
      AgentBuilderPlatformPluginStart,
      PluginSetupDependencies,
      PluginStartDependencies
    >
{
  setup(
    coreSetup: CoreSetup<PluginStartDependencies, AgentBuilderPlatformPluginStart>,
    setupDeps: PluginSetupDependencies
  ): AgentBuilderPlatformPluginSetup {
    return {};
  }

  start(coreStart: CoreStart, startDeps: PluginStartDependencies): AgentBuilderPlatformPluginStart {
    const { agentBuilder, share, triggersActionsUi } = startDeps;

    registerAttachmentUiDefinitions({
      attachments: agentBuilder.attachments,
      agents: agentBuilder.agents,
      locators: share.url.locators,
      core: coreStart,
      triggersActionsUi,
    });
    // Register the browser half of the table renderer so `<render type="table" />` can mount.
    agentBuilder.renderers.register(createTableRendererUiDefinition());

    return {};
  }

  stop() {}
}
