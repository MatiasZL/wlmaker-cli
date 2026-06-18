import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { SNAKE_CASE_REGEX } from '../shared/naming.js';
import { findMonorepoRoot, discoverCollaborativeFeatures } from '../analyzer/project.js';
import { createCollaborativeFeature } from '../generators/collaborative/feature/generator.js';
import { createCollaborativePage } from '../generators/collaborative/page/generator.js';
import { createCollaborativeBloc } from '../generators/collaborative/bloc/generator.js';
import { createCollaborativeEndpoint } from '../generators/collaborative/endpoint/generator.js';

export async function collaborativeFlow(): Promise<void> {
  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (!monorepoRoot) {
    clack.outro(chalk.red('Not inside a monorepo. Run from within a Melos monorepo.'));
    return;
  }

  clack.log.info(`Monorepo: ${chalk.cyan(path.relative(os.homedir(), monorepoRoot))}`);

  const action = await clack.select({
    message: 'What do you want to create in collaborative?',
    options: [
      { value: 'feature', label: 'Collaborative Feature', hint: 'Full clean architecture feature' },
      { value: 'page', label: 'Page', hint: 'Add Page + View' },
      { value: 'bloc', label: 'BLoC', hint: 'Add BLoC with Freezed' },
      { value: 'endpoint', label: 'Endpoint', hint: 'Add endpoint stack' },
    ],
  });
  if (clack.isCancel(action)) { clack.cancel('Cancelled'); return; }

  switch (action) {
    case 'feature':
      await collaborativeFeatureFlow(monorepoRoot);
      break;
    case 'page':
      await collaborativePageFlow(monorepoRoot);
      break;
    case 'bloc':
      await collaborativeBlocFlow(monorepoRoot);
      break;
    case 'endpoint':
      await collaborativeEndpointFlow(monorepoRoot);
      break;
  }
}

async function collaborativeFeatureFlow(monorepoRoot: string): Promise<void> {
  const name = await clack.text({
    message: 'Feature name (snake_case)',
    placeholder: 'e.g. feature_orders',
    validate: (value) => {
      if (!value || !value.trim()) return 'Name is required';
      if (!SNAKE_CASE_REGEX.test(value)) return 'Must be snake_case';
      const pkgDir = path.join(monorepoRoot, 'packages', 'collaborative', value);
      if (fs.existsSync(pkgDir)) return `packages/collaborative/${value} already exists`;
    },
  });

  if (clack.isCancel(name)) { clack.cancel('Cancelled'); return; }

  const genSpinner = clack.spinner();
  genSpinner.start('Creating collaborative feature...');

  try {
    await createCollaborativeFeature({ monorepoRoot, featureName: name as string });
    genSpinner.stop('Feature created');
    clack.outro(chalk.green('Done!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

async function collaborativePageFlow(monorepoRoot: string): Promise<void> {
  const features = discoverCollaborativeFeatures(monorepoRoot);
  if (features.length === 0) {
    clack.outro(chalk.red('No collaborative features found. Create one first.'));
    return;
  }

  const selectedFeature = await clack.select({
    message: 'Select feature',
    options: features.map((f) => ({
      value: f.projectRoot,
      label: f.projectName,
      hint: path.relative(monorepoRoot, f.projectRoot),
    })),
  });

  if (clack.isCancel(selectedFeature)) {
    clack.cancel('Cancelled');
    return;
  }

  const pageName = await clack.text({
    message: 'Page name (snake_case)',
    placeholder: 'e.g. profile, order_detail',
    validate: (value) => {
      if (!value || !value.trim()) return 'Name is required';
      if (!SNAKE_CASE_REGEX.test(value)) return 'Must be snake_case';
    },
  });

  if (clack.isCancel(pageName)) {
    clack.cancel('Cancelled');
    return;
  }

  const genSpinner = clack.spinner();
  genSpinner.start('Creating page...');

  try {
    await createCollaborativePage({
      featurePath: selectedFeature as string,
      pageName: pageName as string,
    });
    genSpinner.stop('Page created');
    clack.outro(chalk.green('Done!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

async function collaborativeBlocFlow(monorepoRoot: string): Promise<void> {
  const features = discoverCollaborativeFeatures(monorepoRoot);
  if (features.length === 0) {
    clack.outro(chalk.red('No collaborative features found. Create one first.'));
    return;
  }

  const selectedFeature = await clack.select({
    message: 'Select feature',
    options: features.map((f) => ({
      value: f.projectRoot,
      label: f.projectName,
      hint: path.relative(monorepoRoot, f.projectRoot),
    })),
  });

  if (clack.isCancel(selectedFeature)) {
    clack.cancel('Cancelled');
    return;
  }

  const blocName = await clack.text({
    message: 'BLoC name (snake_case)',
    placeholder: 'e.g. user_login',
    validate: (value) => {
      if (!value || !value.trim()) return 'Name is required';
      if (!SNAKE_CASE_REGEX.test(value)) return 'Must be snake_case';
    },
  });

  if (clack.isCancel(blocName)) {
    clack.cancel('Cancelled');
    return;
  }

  const genSpinner = clack.spinner();
  genSpinner.start('Creating BLoC...');

  try {
    await createCollaborativeBloc({
      featurePath: selectedFeature as string,
      blocName: blocName as string,
    });
    genSpinner.stop('BLoC created');
    clack.outro(chalk.green('Done!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

async function collaborativeEndpointFlow(monorepoRoot: string): Promise<void> {
  const features = discoverCollaborativeFeatures(monorepoRoot);
  if (features.length === 0) {
    clack.outro(chalk.red('No collaborative features found. Create one first.'));
    return;
  }

  const selectedFeature = await clack.select({
    message: 'Select feature',
    options: features.map((f) => ({
      value: f.projectRoot,
      label: f.projectName,
      hint: path.relative(monorepoRoot, f.projectRoot),
    })),
  });

  if (clack.isCancel(selectedFeature)) {
    clack.cancel('Cancelled');
    return;
  }

  const featurePath = selectedFeature as string;
  const featureName = path.basename(featurePath);

  const httpMethod = await clack.select({
    message: 'HTTP Method',
    options: [
      { value: 'GET', label: 'GET' },
      { value: 'POST', label: 'POST' },
      { value: 'PUT', label: 'PUT' },
      { value: 'PATCH', label: 'PATCH' },
      { value: 'DELETE', label: 'DELETE' },
    ],
  });
  if (clack.isCancel(httpMethod)) { clack.cancel('Cancelled'); return; }

  const endpointPath = await clack.text({
    message: 'Endpoint path (e.g. /items/{id})',
    placeholder: '/api/items/{id}',
    validate: (v) => { if (!(v ?? '').trim()) return 'Path is required'; },
  });
  if (clack.isCancel(endpointPath)) { clack.cancel('Cancelled'); return; }

  const methodLower = (httpMethod as string).toLowerCase();
  const pathSegments = (endpointPath as string)
    .replace(/^\//, '')
    .split('/')
    .filter((s: string) => !s.startsWith('{'));
  const inferredName = pathSegments.length > 0
    ? `${methodLower}_${pathSegments.join('_')}`
    : `${methodLower}_data`;

  const useCaseName = await clack.text({
    message: 'UseCase name (snake_case)',
    placeholder: inferredName,
    initialValue: inferredName,
    validate: (v = '') => {
      if (!v.trim()) return 'Name is required';
      if (!SNAKE_CASE_REGEX.test(v)) return 'Must be snake_case';
    },
  });
  if (clack.isCancel(useCaseName)) { clack.cancel('Cancelled'); return; }

  const genSpinner = clack.spinner();
  genSpinner.start('Generating endpoint stack...');

  try {
    await createCollaborativeEndpoint({
      featurePath,
      featureName,
      httpMethod: httpMethod as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      endpointPath: endpointPath as string,
      useCaseName: useCaseName as string,
    });
    genSpinner.stop('Endpoint generated');
    clack.outro(chalk.green('Done!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}
