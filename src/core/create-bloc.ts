import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { pascalCase } from 'change-case';
import { blocTemplate, blocEventTemplate, blocStateTemplate } from './templates.js';
import { updateBarrelFile } from './barrel.js';
import { findPubspecDir, hasBuildRunner, runBuildRunner } from './build-runner.js';

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

export async function createBloc(name: string, options: { dir: string; buildRunner: boolean }): Promise<void> {
  const targetDir = path.resolve(options.dir);

  // Validate name
  if (!name || name.trim().length === 0) {
    console.error(chalk.red('Error: Name cannot be empty.'));
    process.exit(1);
  }
  if (!SNAKE_CASE_REGEX.test(name)) {
    console.error(chalk.red('Error: Name must be snake_case (lowercase letters, digits, underscores).'));
    process.exit(1);
  }
  if (fs.existsSync(path.join(targetDir, name))) {
    console.error(chalk.red(`Error: Directory "${name}" already exists.`));
    process.exit(1);
  }

  const pascal = pascalCase(name);
  const blocDir = path.join(targetDir, name);

  try {
    fs.mkdirSync(blocDir, { recursive: true });

    fs.writeFileSync(path.join(blocDir, `${name}_bloc.dart`), blocTemplate(name, pascal));
    fs.writeFileSync(path.join(blocDir, `${name}_event.dart`), blocEventTemplate(name, pascal));
    fs.writeFileSync(path.join(blocDir, `${name}_state.dart`), blocStateTemplate(name, pascal));

    updateBarrelFile(targetDir, name);

    console.log(chalk.green(`✓ BLoC "${pascal}Bloc" created successfully.`));

    if (options.buildRunner) {
      const projectRoot = findPubspecDir(targetDir);
      if (projectRoot && hasBuildRunner(projectRoot)) {
        console.log(chalk.blue('Running build_runner...'));
        await runBuildRunner(projectRoot);
        console.log(chalk.green('✓ build_runner completed.'));
      } else {
        console.log(chalk.yellow('Skipping build_runner (no pubspec.yaml or build_runner dependency found).'));
      }
    }
  } catch (error) {
    console.error(chalk.red(`Failed to create BLoC: ${error}`));
    process.exit(1);
  }
}
