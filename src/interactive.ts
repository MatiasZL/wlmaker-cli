import * as path from 'path';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { analyzeProject, type ProjectInfo } from './core/project-analyzer.js';
import { createBloc } from './core/create-bloc.js';

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

export async function interactiveMode(): Promise<void> {
  clack.intro(chalk.bgCyan(chalk.black(' wlmaker ')));

  const s = clack.spinner();
  s.start('Analyzing Flutter project...');

  const project = analyzeProject(process.cwd());

  if (!project) {
    s.stop('No Flutter project found');
    clack.outro(chalk.red('Could not find a pubspec.yaml in the current directory or any parent.'));
    return;
  }

  s.stop(`Found ${chalk.green(project.projectName)} — ${project.features.length} feature(s) detected`);

  // BLoC name
  const name = await clack.text({
    message: 'BLoC name (snake_case)',
    placeholder: 'e.g. user_login',
    validate: (value) => {
      if (!value.trim()) return 'Name is required';
      if (!SNAKE_CASE_REGEX.test(value)) return 'Must be snake_case (lowercase, digits, underscores)';
    },
  });

  if (clack.isCancel(name)) {
    clack.cancel('Cancelled');
    return;
  }

  // Select target directory
  let targetDir: string;

  if (project.features.length > 0) {
    const feature = await clack.select({
      message: 'Select feature',
      options: [
        ...project.features.map((f) => ({ value: f, label: f })),
        { value: '__custom__', label: 'Custom path...' },
      ],
    });

    if (clack.isCancel(feature)) {
      clack.cancel('Cancelled');
      return;
    }

    if (feature === '__custom__') {
      const customPath = await clack.text({
        message: 'Target directory path',
        placeholder: 'lib/features/auth',
        validate: (v) => {
          if (!v.trim()) return 'Path is required';
        },
      });

      if (clack.isCancel(customPath)) {
        clack.cancel('Cancelled');
        return;
      }

      targetDir = path.resolve(customPath);
    } else {
      targetDir = path.join(project.projectRoot, 'lib', 'features', feature);
    }
  } else {
    clack.note('No lib/features/ directory found. Provide a target path manually.', 'Info');
    const customPath = await clack.text({
      message: 'Target directory path',
      placeholder: 'lib/features/auth',
      validate: (v) => {
        if (!v.trim()) return 'Path is required';
      },
    });

    if (clack.isCancel(customPath)) {
      clack.cancel('Cancelled');
      return;
    }

    targetDir = path.resolve(customPath);
  }

  // Build runner
  const defaultRun = project.hasBuildRunner;
  const runBuildRunner = await clack.confirm({
    message: 'Run build_runner after generation?',
    initialValue: defaultRun,
  });

  if (clack.isCancel(runBuildRunner)) {
    clack.cancel('Cancelled');
    return;
  }

  // Generate
  const genSpinner = clack.spinner();
  genSpinner.start('Generating BLoC files...');

  try {
    await createBloc(name as string, {
      dir: targetDir,
      buildRunner: runBuildRunner as boolean,
    });
    genSpinner.stop('BLoC generated');
    clack.outro(chalk.green('Done!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}
