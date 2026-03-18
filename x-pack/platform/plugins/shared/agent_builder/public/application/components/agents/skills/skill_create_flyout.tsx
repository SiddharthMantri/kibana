/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiAccordion,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiLink,
  EuiSpacer,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import { Controller, FormProvider } from 'react-hook-form';
import type { PublicSkillSummary } from '@kbn/agent-builder-common';
import { labels } from '../../../utils/i18n';
import { useCreateSkill } from '../../../hooks/skills/use_create_skill';
import { useSkillForm } from '../../../hooks/skills/use_skill_form';
import { useTools } from '../../../hooks/tools/use_tools';
import { useNavigation } from '../../../hooks/use_navigation';
import { appPaths } from '../../../utils/app_paths';

interface SkillCreateFlyoutProps {
  onClose: () => void;
  onSkillCreated?: (skill: PublicSkillSummary) => void;
}

/**
 * Flyout for creating a new skill from the agent skills context.
 * After creation, notifies the parent so the new skill can be added to the agent.
 */
export const SkillCreateFlyout: React.FC<SkillCreateFlyoutProps> = ({
  onClose,
  onSkillCreated,
}) => {
  const { createAgentBuilderUrl } = useNavigation();
  const skillLibraryUrl = createAgentBuilderUrl(appPaths.manage.skills);
  const { tools } = useTools();

  const form = useSkillForm();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = form;

  const { isSubmitting, createSkill } = useCreateSkill({
    onSuccess: (response) => {
      onSkillCreated?.(response as unknown as PublicSkillSummary);
      onClose();
    },
  });

  const toolOptions = useMemo(
    () => tools.map((tool) => ({ label: tool.id, value: tool.id })),
    [tools]
  );

  const onSubmit = useCallback(
    async (data: {
      id: string;
      name: string;
      description: string;
      content: string;
      tool_ids: string[];
    }) => {
      await createSkill({
        id: data.id,
        name: data.name,
        description: data.description,
        content: data.content,
        tool_ids: data.tool_ids,
      });
    },
    [createSkill]
  );

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <EuiFlyout onClose={onClose} size="960px" aria-labelledby="skillCreateFlyoutTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="s">
              <h2 id="skillCreateFlyoutTitle">{labels.agentSkills.createSkillFlyoutTitle}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiLink href={skillLibraryUrl} external>
              {labels.agentSkills.viewSkillLibraryLink}
            </EuiLink>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <FormProvider {...form}>
          <EuiCallOut
            color="primary"
            iconType="info"
            title={labels.agentSkills.newSkillLibraryInfo}
          />

          <EuiSpacer size="m" />

          <EuiForm component="form" onSubmit={handleSubmit(onSubmit)}>
            <EuiFlexGroup gutterSize="m" responsive={false}>
              <EuiFlexItem>
                <Controller
                  name="id"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <EuiFormRow
                      label={labels.skills.skillIdLabel}
                      isInvalid={!!error}
                      error={error?.message}
                      fullWidth
                    >
                      <EuiFieldText {...field} fullWidth isInvalid={!!error} />
                    </EuiFormRow>
                  )}
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <Controller
                  name="name"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <EuiFormRow
                      label={labels.skills.nameLabel}
                      isInvalid={!!error}
                      error={error?.message}
                      fullWidth
                    >
                      <EuiFieldText {...field} fullWidth isInvalid={!!error} />
                    </EuiFormRow>
                  )}
                />
              </EuiFlexItem>
            </EuiFlexGroup>

            <Controller
              name="description"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <EuiFormRow
                  label={labels.skills.descriptionLabel}
                  isInvalid={!!error}
                  error={error?.message}
                  fullWidth
                >
                  <EuiTextArea {...field} fullWidth isInvalid={!!error} rows={3} />
                </EuiFormRow>
              )}
            />

            <Controller
              name="content"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <EuiFormRow
                  label={labels.agentSkills.skillDetailInstructionsLabel}
                  isInvalid={!!error}
                  error={error?.message}
                  fullWidth
                >
                  <EuiTextArea {...field} fullWidth isInvalid={!!error} rows={8} />
                </EuiFormRow>
              )}
            />

            <EuiSpacer size="m" />

            <EuiAccordion
              id="skillCreateAdvancedOptions"
              buttonContent={labels.agentSkills.advancedOptionsLabel}
            >
              <EuiSpacer size="s" />
              <Controller
                name="tool_ids"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <EuiFormRow
                    label={labels.skills.toolIdsLabel}
                    isInvalid={!!error}
                    error={error?.message}
                    fullWidth
                  >
                    <EuiComboBox
                      isInvalid={!!error}
                      fullWidth
                      options={toolOptions}
                      selectedOptions={value.map((toolId) => ({ label: toolId, value: toolId }))}
                      onChange={(selected) => onChange(selected.map((opt) => opt.value as string))}
                    />
                  </EuiFormRow>
                )}
              />
            </EuiAccordion>
          </EuiForm>
        </FormProvider>
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>{labels.skills.cancelButtonLabel}</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              onClick={handleSubmit(onSubmit)}
              isLoading={isSubmitting}
              disabled={hasErrors || isSubmitting}
            >
              {labels.skills.saveButtonLabel}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
