/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import { pluginServices, registry } from './services/plugin_services';
import {
  PresentationUtilPluginSetupDeps,
  PresentationUtilPluginStartDeps,
  PresentationUtilPluginSetup,
  PresentationUtilPluginStart,
} from './types';

import { registerExpressionsLanguage } from '.';

export class PresentationUtilPlugin
  implements
    Plugin<
      PresentationUtilPluginSetup,
      PresentationUtilPluginStart,
      PresentationUtilPluginSetupDeps,
      PresentationUtilPluginStartDeps
    >
{
  public setup(
    _coreSetup: CoreSetup<PresentationUtilPluginStartDeps, PresentationUtilPluginStart>,
    _setupPlugins: PresentationUtilPluginSetupDeps
  ): PresentationUtilPluginSetup {
    return {};
  }

  public start(
    coreStart: CoreStart,
    startPlugins: PresentationUtilPluginStartDeps
  ): PresentationUtilPluginStart {
    pluginServices.setRegistry(registry.start({ coreStart, startPlugins }));

    return {
      ContextProvider: pluginServices.getContextProvider(),
      labsService: pluginServices.getServices().labs,
      registerExpressionsLanguage,
    };
  }

  public stop() {}
}
