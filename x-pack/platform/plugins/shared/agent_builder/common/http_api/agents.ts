/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AgentAccessControl,
  AgentAccessControlEntry,
  AgentConfiguration,
  AgentDefinition,
} from '@kbn/agent-builder-common';

export interface AgentPermissions {
  update_agent: boolean;
  update_access_control: boolean;
}

export type AgentDefinitionWithPermissions = AgentDefinition & {
  permissions: AgentPermissions;
};

/**
 * Agent shape returned by the public agent APIs:
 * - `configuration` is the agent's own raw config
 * - `effective_configuration` is the result of merging the agent type's base configuration under it
 */
export type PublicAgentDefinition = AgentDefinitionWithPermissions & {
  effective_configuration: AgentConfiguration;
};

export type GetAgentResponse = PublicAgentDefinition;

export interface ListAgentResponse {
  results: PublicAgentDefinition[];
}

export type UpdateAgentResponse = PublicAgentDefinition;

export type CreateAgentResponse = PublicAgentDefinition;

export interface DeleteAgentResponse {
  success: boolean;
}

/**
 * Response shape for `GET /api/agent_builder/agents/{id}/access_control`.
 *
 * `permissions.update_access_control` indicates whether the requesting user can edit access
 * control via PUT.
 * `access_control` is always present and reflects the current persisted scope and entries.
 */
export interface GetAgentAccessControlResponse {
  access_control: AgentAccessControl;
  permissions: Pick<AgentPermissions, 'update_access_control'>;
}

/** Body for `PUT /api/agent_builder/agents/{id}/access_control`. */
export interface UpdateAgentAccessControlRequestBody {
  entries: AgentAccessControlEntry[];
}

export type UpdateAgentAccessControlResponse = AgentAccessControl;
