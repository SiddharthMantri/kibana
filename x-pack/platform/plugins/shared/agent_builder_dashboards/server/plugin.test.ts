/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { AgentBuilderDashboardsPlugin } from './plugin';
import { DASHBOARD_RENDERER_TYPE } from '../common/renderers/dashboard';

const mockDashboardManagementSkill = { id: 'dashboard-management' };
const mockDashboardAttachmentType = { id: 'dashboard' };
const mockDashboardSmlType = { id: 'dashboard' };

jest.mock('./attachment_types', () => ({
  createDashboardAttachmentType: jest.fn(() => mockDashboardAttachmentType),
}));

jest.mock('./sml_types', () => ({
  createDashboardSmlType: jest.fn(() => mockDashboardSmlType),
}));

jest.mock('./skills', () => ({
  registerSkills: jest.fn((agentBuilder) => {
    agentBuilder.skills.register(mockDashboardManagementSkill);
  }),
}));

describe('AgentBuilderDashboardsPlugin', () => {
  it('registers the dashboard attachment type, renderer, skill, and SML type', () => {
    const registerAttachmentType = jest.fn();
    const registerRenderer = jest.fn();
    const registerSkill = jest.fn();
    const registerSmlType = jest.fn();

    const plugin = new AgentBuilderDashboardsPlugin(coreMock.createPluginInitializerContext());

    plugin.setup(
      {} as never,
      {
        agentBuilder: {
          attachments: { registerType: registerAttachmentType },
          renderers: { register: registerRenderer },
          skills: { register: registerSkill },
        },
        agentContextLayer: {
          registerType: registerSmlType,
        },
      } as never
    );

    expect(registerAttachmentType).toHaveBeenCalledTimes(1);
    expect(registerRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ type: DASHBOARD_RENDERER_TYPE })
    );
    expect(registerSkill).toHaveBeenCalledWith(mockDashboardManagementSkill);
    expect(registerSmlType).toHaveBeenCalledTimes(1);
    expect(registerSmlType).toHaveBeenCalledWith(mockDashboardSmlType);
  });
});
