import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { SCREAMING_SNAKE_REGEX } from '../shared/naming.js';
import { findMonorepoRoot } from '../analyzer/project.js';
import { createEnvVar, discoverAppsWithEnv, discoverVendorsModules, type EnvVarType } from '../generators/env-var/generator.js';

export async function envVarFlow(): Promise<void> {
  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (!monorepoRoot) {
    clack.outro(chalk.red('Not inside a monorepo. Run from within a Melos monorepo.'));
    return;
  }

  const apps = discoverAppsWithEnv(monorepoRoot);
  if (apps.length === 0) {
    clack.outro(chalk.red('No apps with env/ directory found in the monorepo.'));
    return;
  }

  const variableName = await clack.text({
    message: 'Variable name (SCREAMING_SNAKE_CASE)',
    placeholder: 'MY_FEATURE_FLAG',
    validate: (v) => {
      if (v === undefined || !v.trim()) return 'Name is required';
      if (!SCREAMING_SNAKE_REGEX.test(v)) return 'Must be SCREAMING_SNAKE_CASE (uppercase, numbers, underscores)';
    },
  });
  if (clack.isCancel(variableName)) { clack.cancel('Cancelled'); return; }

  const dartType = await clack.select({
    message: 'Variable type',
    options: [
      { value: 'String', label: 'String' },
      { value: 'int', label: 'int' },
      { value: 'bool', label: 'bool' },
      { value: 'List<String>', label: 'List<String>' },
    ],
  });
  if (clack.isCancel(dartType)) { clack.cancel('Cancelled'); return; }

  const selectedType = dartType as EnvVarType;

  const defaultValue = await clack.text({
    message: 'Default value (leave empty to skip)',
    placeholder: selectedType === 'bool' ? 'false' : selectedType === 'int' ? '0' : '',
    validate: (v) => {
      if (!v || !v.trim()) return undefined;
      if (selectedType === 'int' && !/^-?\d+$/.test(v)) return 'Must be an integer';
      if (selectedType === 'bool' && !['true', 'false'].includes(v)) return 'Must be true or false';
    },
  });
  if (clack.isCancel(defaultValue)) { clack.cancel('Cancelled'); return; }

  const selectedApps = await clack.multiselect({
    message: 'Select apps to add the variable to',
    options: [
      { value: '__all__', label: 'All apps' },
      ...apps.map((app) => ({ value: app, label: app })),
    ],
    required: true,
  });
  if (clack.isCancel(selectedApps)) { clack.cancel('Cancelled'); return; }

  const appsList = (selectedApps as string[]).includes('__all__')
    ? apps
    : (selectedApps as string[]);

  const includeInRemoteConfig = await clack.confirm({
    message: 'Add to VendorsModule RemoteConfig defaultValues?',
    initialValue: true,
  });
  if (clack.isCancel(includeInRemoteConfig)) { clack.cancel('Cancelled'); return; }

  let vendorsTargets: string[] = [];
  if (includeInRemoteConfig) {
    const vendorsModules = discoverVendorsModules(monorepoRoot);
    if (vendorsModules.length > 0) {
      const vendorsSelection = await clack.multiselect({
        message: 'Which VendorsModule(s) to update?',
        options: [
          { value: '__all__', label: 'All vendors' },
          ...vendorsModules.map((v) => ({ value: v, label: v })),
        ],
        required: true,
      });
      if (clack.isCancel(vendorsSelection)) { clack.cancel('Cancelled'); return; }
      vendorsTargets = (vendorsSelection as string[]).includes('__all__')
        ? vendorsModules
        : (vendorsSelection as string[]);
    }
  }

  const includeInAppConfig = await clack.confirm({
    message: 'Add to AppConfig entity and AppConfigModel?',
    initialValue: true,
  });
  if (clack.isCancel(includeInAppConfig)) { clack.cancel('Cancelled'); return; }

  const genSpinner = clack.spinner();
  genSpinner.start('Adding environment variable...');

  try {
    await createEnvVar({
      monorepoRoot,
      variableName: variableName as string,
      dartType: selectedType,
      defaultValue: (defaultValue as string) || undefined,
      selectedApps: appsList,
      vendorsTargets,
      includeInRemoteConfig: includeInRemoteConfig as boolean,
      includeInAppConfig: includeInAppConfig as boolean,
    });
    genSpinner.stop('Done');
    clack.outro(chalk.green('Environment variable added!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}
