/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { EuiStepProps, EuiStepStatus } from '@elastic/eui';
import type { RuleMigrationTaskStats } from '../../../../../../../../../common/siem_migrations/model/rule_migration.gen';
import type { OnMigrationCreated } from '../../../../types';
import { RulesFileUpload } from './rules_file_upload';
import {
  useCreateMigration,
  type OnSuccess,
} from '../../../../../../service/hooks/use_create_migration';
import * as i18n from './translations';

export interface RulesFileUploadStepProps {
  status: EuiStepStatus;
  migrationStats: RuleMigrationTaskStats | undefined;
  migrationName: string | undefined;
  onMigrationCreated: OnMigrationCreated;
  onRulesFileChanged: (files: FileList | null) => void;
}
export const useRulesFileUploadStep = ({
  status,
  migrationStats,
  migrationName,
  onMigrationCreated,
  onRulesFileChanged,
}: RulesFileUploadStepProps): EuiStepProps => {
  const [isCreated, setIsCreated] = useState<boolean>(!!migrationStats);
  const onSuccess = useCallback<OnSuccess>(
    (stats) => {
      setIsCreated(true);
      onMigrationCreated(stats);
    },
    [onMigrationCreated]
  );
  const { createMigration, isLoading, error } = useCreateMigration(onSuccess);

  const uploadStepStatus = useMemo(() => {
    if (isLoading) {
      return 'loading';
    }
    if (error) {
      return 'danger';
    }
    return status;
  }, [isLoading, error, status]);

  return {
    title: i18n.RULES_DATA_INPUT_FILE_UPLOAD_TITLE,
    status: uploadStepStatus,
    children: (
      <RulesFileUpload
        createMigration={createMigration}
        migrationName={migrationName}
        isLoading={isLoading}
        isCreated={isCreated}
        apiError={error?.message}
        onRulesFileChanged={onRulesFileChanged}
      />
    ),
  };
};
