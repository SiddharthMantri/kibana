/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Environment, FileSystemLoader } from 'nunjucks';

import { join as joinPath } from 'path';
import { DataStream } from '../../common';
import { createSync, ensureDirSync } from '../util';

export function createReadme(
  packageDir: string,
  integrationName: string,
  datastreams: DataStream[],
  fields: object[]
) {
  createPackageReadme(packageDir, integrationName, datastreams, fields);
  createBuildReadme(packageDir, integrationName, datastreams, fields);
}

function createPackageReadme(
  packageDir: string,
  integrationName: string,
  datastreams: DataStream[],
  fields: object[]
) {
  const dirPath = joinPath(packageDir, 'docs/');
  // The readme nunjucks template files should be named in the format `somename_readme.md.njk` and not just `readme.md.njk`
  // since any file with `readme.*` pattern is skipped in build process in buildkite.
  createReadmeFile(dirPath, 'package_readme.md.njk', integrationName, datastreams, fields);
}

function createBuildReadme(
  packageDir: string,
  integrationName: string,
  datastreams: DataStream[],
  fields: object[]
) {
  const dirPath = joinPath(packageDir, '_dev/build/docs/');
  createReadmeFile(dirPath, 'build_readme.md.njk', integrationName, datastreams, fields);
}

function createReadmeFile(
  targetDir: string,
  templateName: string,
  integrationName: string,
  datastreams: DataStream[],
  fields: object[]
) {
  ensureDirSync(targetDir);

  const templatesPath = joinPath(__dirname, '../templates');
  const env = new Environment(new FileSystemLoader(templatesPath), {
    autoescape: false,
  });

  const template = env.getTemplate(templateName);

  const renderedTemplate = template.render({
    package_name: integrationName,
    datastreams,
    fields,
  });

  createSync(joinPath(targetDir, 'README.md'), renderedTemplate);
}
