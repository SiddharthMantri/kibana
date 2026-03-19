/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
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
  EuiLoadingSpinner,
  EuiMarkdownEditor,
  EuiSpacer,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import { Controller, FormProvider } from 'react-hook-form';
import { labels } from '../../../utils/i18n';
import { useEditSkill } from '../../../hooks/skills/use_edit_skill';
import { useSkillForm } from '../../../hooks/skills/use_skill_form';
import { useTools } from '../../../hooks/tools/use_tools';
import { useNavigation } from '../../../hooks/use_navigation';
import { appPaths } from '../../../utils/app_paths';

interface SkillEditFlyoutProps {
  skillId: string;
  onClose: () => void;
}

export const SkillEditFlyout: React.FC<SkillEditFlyoutProps> = ({ skillId, onClose }) => {
  const { createAgentBuilderUrl } = useNavigation();
  const skillLibraryUrl = createAgentBuilderUrl(appPaths.manage.skills);
  const { tools } = useTools();

  const form = useSkillForm();
  const {
    control,
    reset,
    handleSubmit,
    formState: { errors, isDirty },
  } = form;

  const { skill, isLoading, isSubmitting, editSkill } = useEditSkill({
    skillId,
    onSuccess: onClose,
  });

  useEffect(() => {
    if (skill) {
      reset({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        tool_ids: skill.tool_ids ?? [],
      });
    }
  }, [skill, reset]);

  const toolOptions = useMemo(
    () => tools.map((tool) => ({ label: tool.id, value: tool.id })),
    [tools]
  );

  const onSubmit = useCallback(
    async (data: { name: string; description: string; content: string; tool_ids: string[] }) => {
      await editSkill({
        name: data.name,
        description: data.description,
        content: data.content,
        tool_ids: data.tool_ids,
      });
    },
    [editSkill]
  );

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <EuiFlyout onClose={onClose} size="960px" aria-labelledby="skillEditFlyoutTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="s">
              <h2 id="skillEditFlyoutTitle">{labels.agentSkills.editSkillFlyoutTitle}</h2>
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
        {isLoading ? (
          <EuiFlexGroup justifyContent="center" alignItems="center">
            <EuiLoadingSpinner size="l" />
          </EuiFlexGroup>
        ) : (
          <FormProvider {...form}>
            {skill && skill.readonly && (
              <>
                <EuiCallOut
                  announceOnMount
                  color="warning"
                  iconType="warning"
                  title={labels.agentSkills.sharedSkillWarning}
                />
                <EuiSpacer size="m" />
              </>
            )}

            <EuiForm component="form" onSubmit={handleSubmit(onSubmit)}>
              {/* Keep ID and name aligned with create flyout's two-column header row. */}
              <EuiFlexGroup gutterSize="m" responsive={false}>
                <EuiFlexItem>
                  <EuiFormRow label={labels.skills.skillIdLabel} fullWidth>
                    <EuiFieldText value={skillId} disabled fullWidth />
                  </EuiFormRow>
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
              <EuiSpacer size="m" />
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
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <EuiFormRow
                    label={labels.agentSkills.skillDetailInstructionsLabel}
                    isInvalid={!!error}
                    error={error?.message}
                    fullWidth
                  >
                    <EuiMarkdownEditor
                      onChange={onChange}
                      value={value ?? ''}
                      aria-label={labels.agentSkills.skillDetailInstructionsLabel}
                    />
                  </EuiFormRow>
                )}
              />

              <EuiSpacer size="m" />

              <EuiAccordion
                id="skillEditAdvancedOptions"
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
                        onChange={(selected) =>
                          onChange(selected.map((opt) => opt.value as string))
                        }
                      />
                    </EuiFormRow>
                  )}
                />
              </EuiAccordion>
            </EuiForm>
          </FormProvider>
        )}
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
              disabled={hasErrors || isSubmitting || !isDirty}
            >
              {labels.skills.saveButtonLabel}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
