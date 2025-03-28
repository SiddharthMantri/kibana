/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { StoryFn } from '@storybook/react';

import { EuiFlexGroup } from '@elastic/eui';
import { KibanaReactStorybookDecorator } from '../../../../utils/kibana_react.storybook_decorator';
import { buildForecastedSlo } from '../../../../data/slo/slo';
import { SloBadges as Component, SloBadgesProps } from './slo_badges';

export default {
  component: Component,
  title: 'app/SLO/Badges/SloBadges',
  decorators: [KibanaReactStorybookDecorator],
};

const Template: StoryFn<typeof Component> = (props: SloBadgesProps) => (
  <EuiFlexGroup>
    <Component {...props} />
  </EuiFlexGroup>
);

const defaultProps = {
  slo: buildForecastedSlo(),
  rules: [],
};

export const SloBadges = {
  render: Template,
  args: defaultProps,
};
