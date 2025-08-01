/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  IContextProvider,
  KibanaRequest,
  Logger,
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
} from '@kbn/core/server';

import type { SecurityPluginSetup } from '@kbn/security-plugin/server';
import type { LensServerPluginSetup } from '@kbn/lens-plugin/server';

import { DEFAULT_SPACE_ID } from '@kbn/spaces-plugin/common';
import { APP_ID } from '../common/constants';

import type { CasesClient } from './client';
import type {
  CasesRequestHandlerContext,
  CasesServerSetup,
  CasesServerSetupDependencies,
  CasesServerStart,
  CasesServerStartDependencies,
} from './types';
import { CasesClientFactory } from './client/factory';
import { getCasesKibanaFeatures } from './features';
import { registerRoutes } from './routes/api/register_routes';
import { getExternalRoutes } from './routes/api/get_external_routes';
import { createCasesTelemetry, scheduleCasesTelemetryTask } from './telemetry';
import { getInternalRoutes } from './routes/api/get_internal_routes';
import { PersistableStateAttachmentTypeRegistry } from './attachment_framework/persistable_state_registry';
import { ExternalReferenceAttachmentTypeRegistry } from './attachment_framework/external_reference_registry';
import { UserProfileService } from './services';
import {
  LICENSING_CASE_ASSIGNMENT_FEATURE,
  LICENSING_CASE_OBSERVABLES_FEATURE,
} from './common/constants';
import { registerInternalAttachments } from './internal_attachments';
import { registerCaseFileKinds } from './files';
import type { ConfigType } from './config';
import { registerConnectorTypes } from './connectors';
import { registerSavedObjects } from './saved_object_types';
import type { ServerlessProjectType } from '../common/constants/types';
import { IncrementalIdTaskManager } from './tasks/incremental_id/incremental_id_task_manager';
import {
  createCasesAnalyticsIndexes,
  registerCasesAnalyticsIndexesTasks,
  scheduleCasesAnalyticsSyncTasks,
} from './cases_analytics';
import { registerUiSettings } from './ui_settings';

export class CasePlugin
  implements
    Plugin<
      CasesServerSetup,
      CasesServerStart,
      CasesServerSetupDependencies,
      CasesServerStartDependencies
    >
{
  private readonly caseConfig: ConfigType;
  private readonly logger: Logger;
  private readonly kibanaVersion: PluginInitializerContext['env']['packageInfo']['version'];
  private clientFactory: CasesClientFactory;
  private securityPluginSetup?: SecurityPluginSetup;
  private lensEmbeddableFactory?: LensServerPluginSetup['lensEmbeddableFactory'];
  private persistableStateAttachmentTypeRegistry: PersistableStateAttachmentTypeRegistry;
  private externalReferenceAttachmentTypeRegistry: ExternalReferenceAttachmentTypeRegistry;
  private userProfileService: UserProfileService;
  private incrementalIdTaskManager?: IncrementalIdTaskManager;
  private readonly isServerless: boolean;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.caseConfig = initializerContext.config.get<ConfigType>();
    this.kibanaVersion = initializerContext.env.packageInfo.version;
    this.logger = this.initializerContext.logger.get();
    this.clientFactory = new CasesClientFactory(this.logger);
    this.persistableStateAttachmentTypeRegistry = new PersistableStateAttachmentTypeRegistry();
    this.externalReferenceAttachmentTypeRegistry = new ExternalReferenceAttachmentTypeRegistry();
    this.userProfileService = new UserProfileService(this.logger);
    this.isServerless = initializerContext.env.packageInfo.buildFlavor === 'serverless';
  }

  public setup(
    core: CoreSetup<CasesServerStartDependencies>,
    plugins: CasesServerSetupDependencies
  ): CasesServerSetup {
    this.logger.debug(
      `Setting up Case Workflow with core contract [${Object.keys(
        core
      )}] and plugins [${Object.keys(plugins)}]`
    );

    registerInternalAttachments(
      this.externalReferenceAttachmentTypeRegistry,
      this.persistableStateAttachmentTypeRegistry
    );

    registerCaseFileKinds(this.caseConfig.files, plugins.files, core.security.fips.isEnabled());
    registerCasesAnalyticsIndexesTasks({
      taskManager: plugins.taskManager,
      logger: this.logger,
      core,
    });

    this.securityPluginSetup = plugins.security;
    this.lensEmbeddableFactory = plugins.lens.lensEmbeddableFactory;

    if (this.caseConfig.stack.enabled) {
      // V1 is deprecated, but has to be maintained for the time being
      // https://github.com/elastic/kibana/pull/186800#issue-2369812818
      const casesFeatures = getCasesKibanaFeatures();
      plugins.features.registerKibanaFeature(casesFeatures.v1);
      plugins.features.registerKibanaFeature(casesFeatures.v2);
      plugins.features.registerKibanaFeature(casesFeatures.v3);
    }

    registerSavedObjects({
      core,
      logger: this.logger,
      persistableStateAttachmentTypeRegistry: this.persistableStateAttachmentTypeRegistry,
      lensEmbeddableFactory: this.lensEmbeddableFactory,
    });

    core.http.registerRouteHandlerContext<CasesRequestHandlerContext, 'cases'>(
      APP_ID,
      this.createRouteHandlerContext({
        core,
      })
    );

    if (this.caseConfig.incrementalId.enabled) {
      registerUiSettings(core);
    }

    if (plugins.taskManager) {
      if (plugins.usageCollection) {
        createCasesTelemetry({
          core,
          taskManager: plugins.taskManager,
          usageCollection: plugins.usageCollection,
          logger: this.logger,
          kibanaVersion: this.kibanaVersion,
        });
      }

      if (this.caseConfig.incrementalId.enabled) {
        this.incrementalIdTaskManager = new IncrementalIdTaskManager(
          plugins.taskManager,
          this.caseConfig.incrementalId,
          this.logger,
          plugins.usageCollection
        );
      }
    }

    const router = core.http.createRouter<CasesRequestHandlerContext>();
    const telemetryUsageCounter = plugins.usageCollection?.createUsageCounter(APP_ID);

    registerRoutes({
      router,
      routes: [
        ...getExternalRoutes({ isServerless: this.isServerless, docLinks: core.docLinks }),
        ...getInternalRoutes(this.userProfileService),
      ],
      logger: this.logger,
      kibanaVersion: this.kibanaVersion,
      telemetryUsageCounter,
    });

    plugins.licensing.featureUsage.register(LICENSING_CASE_ASSIGNMENT_FEATURE, 'platinum');
    plugins.licensing.featureUsage.register(LICENSING_CASE_OBSERVABLES_FEATURE, 'platinum');

    const getCasesClient = async (request: KibanaRequest): Promise<CasesClient> => {
      const [coreStart] = await core.getStartServices();
      return this.getCasesClientWithRequest(coreStart)(request);
    };

    const getSpaceId = (request?: KibanaRequest) => {
      if (!request) {
        return DEFAULT_SPACE_ID;
      }

      return plugins.spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
    };

    const serverlessProjectType = this.isServerless
      ? (plugins.cloud?.serverless.projectType as ServerlessProjectType)
      : undefined;

    registerConnectorTypes({
      actions: plugins.actions,
      alerting: plugins.alerting,
      core,
      logger: this.logger,
      getCasesClient,
      getSpaceId,
      serverlessProjectType,
    });

    return {
      attachmentFramework: {
        registerExternalReference: (externalReferenceAttachmentType) => {
          this.externalReferenceAttachmentTypeRegistry.register(externalReferenceAttachmentType);
        },
        registerPersistableState: (persistableStateAttachmentType) => {
          this.persistableStateAttachmentTypeRegistry.register(persistableStateAttachmentType);
        },
      },
    };
  }

  public start(core: CoreStart, plugins: CasesServerStartDependencies): CasesServerStart {
    this.logger.debug(`Starting Case Workflow`);

    if (plugins.taskManager) {
      scheduleCasesTelemetryTask(plugins.taskManager, this.logger);
      if (this.caseConfig.incrementalId.enabled) {
        void this.incrementalIdTaskManager?.setupIncrementIdTask(plugins.taskManager, core);
      }

      if (this.caseConfig.analytics.index?.enabled) {
        scheduleCasesAnalyticsSyncTasks({ taskManager: plugins.taskManager, logger: this.logger });
        createCasesAnalyticsIndexes({
          esClient: core.elasticsearch.client.asInternalUser,
          logger: this.logger,
          isServerless: this.isServerless,
          taskManager: plugins.taskManager,
        }).catch(() => {}); // it shouldn't reject, but just in case
      }
    }

    this.userProfileService.initialize({
      spaces: plugins.spaces,
      // securityPluginSetup will be set to a defined value in the setup() function
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      securityPluginSetup: this.securityPluginSetup!,
      securityPluginStart: plugins.security,
      licensingPluginStart: plugins.licensing,
    });

    this.clientFactory.initialize({
      // securityPluginSetup will be set to a defined value in the setup() function
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      securityPluginSetup: this.securityPluginSetup!,
      securityPluginStart: plugins.security,
      securityServiceStart: core.security,
      spacesPluginStart: plugins.spaces,
      featuresPluginStart: plugins.features,
      actionsPluginStart: plugins.actions,
      licensingPluginStart: plugins.licensing,
      /**
       * Lens will be always defined as
       * it is declared as required plugin in kibana.json
       */
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      lensEmbeddableFactory: this.lensEmbeddableFactory!,
      persistableStateAttachmentTypeRegistry: this.persistableStateAttachmentTypeRegistry,
      externalReferenceAttachmentTypeRegistry: this.externalReferenceAttachmentTypeRegistry,
      publicBaseUrl: core.http.basePath.publicBaseUrl,
      notifications: plugins.notifications,
      ruleRegistry: plugins.ruleRegistry,
      filesPluginStart: plugins.files,
    });

    return {
      getCasesClientWithRequest: this.getCasesClientWithRequest(core),
      getExternalReferenceAttachmentTypeRegistry: () =>
        this.externalReferenceAttachmentTypeRegistry,
      getPersistableStateAttachmentTypeRegistry: () => this.persistableStateAttachmentTypeRegistry,
    };
  }

  public stop() {
    this.logger.debug(`Stopping Case Workflow`);
  }

  private createRouteHandlerContext = ({
    core,
  }: {
    core: CoreSetup;
  }): IContextProvider<CasesRequestHandlerContext, 'cases'> => {
    return async (context, request, response) => {
      return {
        getCasesClient: async () => {
          const [{ savedObjects }] = await core.getStartServices();
          const coreContext = await context.core;

          return this.clientFactory.create({
            request,
            scopedClusterClient: coreContext.elasticsearch.client.asCurrentUser,
            savedObjectsService: savedObjects,
          });
        },
      };
    };
  };

  private getCasesClientWithRequest =
    (core: CoreStart) =>
    async (request: KibanaRequest): Promise<CasesClient> => {
      const client = core.elasticsearch.client;

      return this.clientFactory.create({
        request,
        scopedClusterClient: client.asScoped(request).asCurrentUser,
        savedObjectsService: core.savedObjects,
      });
    };
}
