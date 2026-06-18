import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { SNAKE_CASE_REGEX } from '../shared/naming.js';
import { findMonorepoRoot } from '../analyzer/project.js';
import { createPackage } from '../generators/package/generator.js';

export async function packageFlow(): Promise<void> {
  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (!monorepoRoot) {
    clack.outro(chalk.red('Not inside a monorepo. Run from within a Melos monorepo.'));
    return;
  }

  clack.log.info(`Monorepo: ${chalk.cyan(path.relative(os.homedir(), monorepoRoot))}`);

  const name = await clack.text({
    message: 'Package name (snake_case)',
    placeholder: 'e.g. rewards, promotions, notifications',
    validate: (value) => {
      if (!value || !value.trim()) return 'Name is required';
      if (!SNAKE_CASE_REGEX.test(value)) return 'Must be snake_case (lowercase, digits, underscores)';
      const pkgDir = path.join(monorepoRoot, 'packages', value);
      if (fs.existsSync(pkgDir)) return `packages/${value} already exists`;
    },
  });

  if (clack.isCancel(name)) {
    clack.cancel('Cancelled');
    return;
  }

  const genSpinner = clack.spinner();
  genSpinner.start('Creating package...');

  try {
    await createPackage({
      monorepoRoot,
      packageName: name as string,
    });
    genSpinner.stop('Package created');
    clack.outro(chalk.green('Done!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}
