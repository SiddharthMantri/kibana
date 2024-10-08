/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFieldNumber, EuiFormRow, EuiSelect, transparentize } from '@elastic/eui';
import React, { useCallback } from 'react';
import styled from 'styled-components';

import type { FieldHook } from '../../../../shared_imports';
import { getFieldValidityAndErrorMessage } from '../../../../shared_imports';
import * as I18n from './translations';

interface DurationInputProps {
  durationValueField: FieldHook<number | undefined>;
  durationUnitField: FieldHook<string>;
  minimumValue?: number;
  isDisabled: boolean;
  durationUnitOptions?: Array<{ value: 's' | 'm' | 'h' | 'd'; text: string }>;
}

const getNumberFromUserInput = (input: string, minimumValue = 0): number | undefined => {
  const number = parseInt(input, 10);
  if (Number.isNaN(number)) {
    return minimumValue;
  } else {
    return Math.max(minimumValue, Math.min(number, Number.MAX_SAFE_INTEGER));
  }
};

const StyledEuiFormRow = styled(EuiFormRow)`
  max-width: 235px;

  .euiFormControlLayout__append {
    padding-inline: 0 !important;
  }

  .euiFormControlLayoutIcons {
    color: ${({ theme }) => theme.eui.euiColorPrimary};
  }
`;

const MyEuiSelect = styled(EuiSelect)`
  min-width: 106px; // Preserve layout when disabled & dropdown arrow is not rendered
  box-shadow: none;
  background: ${({ theme }) =>
    transparentize(theme.eui.euiColorPrimary, 0.1)} !important; // Override focus states etc.
  color: ${({ theme }) => theme.eui.euiColorPrimary};
`;

// This component is similar to the ScheduleItem component, but instead of combining the value
// and unit into a single string it keeps them separate. This makes the component simpler and
// allows for easier validation of values and units in APIs as well.
const DurationInputComponent: React.FC<DurationInputProps> = ({
  durationValueField,
  durationUnitField,
  minimumValue = 0,
  isDisabled,
  durationUnitOptions = [
    { value: 's', text: I18n.SECONDS },
    { value: 'm', text: I18n.MINUTES },
    { value: 'h', text: I18n.HOURS },
  ],
  ...props
}: DurationInputProps) => {
  const { isInvalid, errorMessage } = getFieldValidityAndErrorMessage(durationValueField);
  const { value: durationValue, setValue: setDurationValue } = durationValueField;
  const { value: durationUnit, setValue: setDurationUnit } = durationUnitField;

  const onChangeTimeType: React.ChangeEventHandler<HTMLSelectElement> = useCallback(
    (e) => {
      setDurationUnit(e.target.value);
    },
    [setDurationUnit]
  );

  const onChangeTimeVal: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      const sanitizedValue = getNumberFromUserInput(e.target.value, minimumValue);
      setDurationValue(sanitizedValue);
    },
    [minimumValue, setDurationValue]
  );

  // EUI missing some props
  const rest = { disabled: isDisabled, ...props };

  return (
    <StyledEuiFormRow error={errorMessage} isInvalid={isInvalid}>
      <EuiFieldNumber
        append={
          <MyEuiSelect
            options={durationUnitOptions}
            onChange={onChangeTimeType}
            value={durationUnit}
            data-test-subj="timeType"
            {...rest}
          />
        }
        min={minimumValue}
        max={Number.MAX_SAFE_INTEGER}
        onChange={onChangeTimeVal}
        value={durationValue}
        data-test-subj="interval"
        {...rest}
      />
    </StyledEuiFormRow>
  );
};

export const DurationInput = React.memo(DurationInputComponent);
