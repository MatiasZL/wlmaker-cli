import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { pascalCase } from 'change-case';
import { normalizeTier, tierPlural, type Tier } from './tier.js';
import {
  detectDesignSystem,
  widgetExists,
} from './design-system-analyzer.js';
import { hasBuildRunner, runBuildRunner } from './build-runner.js';
import { useCaseTemplate } from './widget-templates.js';

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

interface CreateUseCaseOptions {
  projectRoot: string;
  buildRunner: boolean;
}

export async function createUseCase(
  name: string,
  tierInput: string,
  options: CreateUseCaseOptions,
): Promise<void> {
  // Normalize name: strip wl_ prefix if provided
  let cleanName = name;
  if (cleanName.startsWith('wl_')) {
    cleanName = cleanName.slice(3);
  }

  if (!cleanName || !SNAKE_CASE_REGEX.test(cleanName)) {
    throw new Error(
      'Name must be snake_case (lowercase letters, digits, underscores).',
    );
  }

  const tier: Tier = normalizeTier(tierInput);
  const plural = tierPlural(tier);
  const pascal = pascalCase(cleanName);
  const fileName = `wl_${cleanName}`;

  // Detect design system
  const ds = detectDesignSystem(options.projectRoot);
  if (!ds) {
    throw new Error(
      'Could not detect design system. Ensure wl_design_system/ directory exists.',
    );
  }

  // Verify widgetbook package exists
  if (!ds.widgetbookDir) {
    throw new Error(
      'Could not detect widgetbook package. Ensure apps/widgetbook/ exists.',
    );
  }

  // Verify widget exists in the tier
  if (!widgetExists(ds.componentsDir, plural, fileName)) {
    throw new Error(
      `Widget "${fileName}" not found in ${plural}/. Create the widget first.`,
    );
  }

  // Create use-case file
  const useCasesDir = path.join(
    ds.widgetbookDir,
    'lib',
    'usecases',
    'wl_design_system',
  );
  if (!fs.existsSync(useCasesDir)) {
    fs.mkdirSync(useCasesDir, { recursive: true });
  }

  const useCasePath = path.join(useCasesDir, `${fileName}.dart`);
  if (fs.existsSync(useCasePath)) {
    throw new Error(`Use-case "${fileName}.dart" already exists.`);
  }

  fs.writeFileSync(
    useCasePath,
    useCaseTemplate(cleanName, pascal, plural, tier),
  );

  console.log(
    chalk.green(
      `Use-case for "Wl${pascal}" created in widgetbook/lib/usecases/wl_design_system/`,
    ),
  );

  // Run build_runner if requested
  if (options.buildRunner) {
    if (hasBuildRunner(ds.widgetbookDir)) {
      console.log(chalk.blue('Running build_runner...'));
      await runBuildRunner(ds.widgetbookDir);
      console.log(chalk.green('build_runner completed.'));
    } else {
      console.log(
        chalk.yellow(
          'Skipping build_runner (no build_runner dependency found in widgetbook).',
        ),
      );
    }
  }
}
