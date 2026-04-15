import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import {
  analyzeProject,
  findMonorepoRoot,
  discoverPackages,
  discoverProjects,
  type ProjectInfo,
} from './core/project-analyzer.js';
import { createBloc } from './core/create-bloc.js';

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

async function resolveProject(): Promise<ProjectInfo | null> {
  const s = clack.spinner();

  // 1. Try current directory
  s.start('Analyzing current directory...');
  const cwdProject = analyzeProject(process.cwd());
  if (cwdProject && (cwdProject.hasFreezed || cwdProject.hasBloc)) {
    s.stop(`Found ${chalk.green(cwdProject.projectName)}`);
    return cwdProject;
  }

  // 2. Try monorepo
  s.message('Looking for Melos monorepo...');
  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (monorepoRoot) {
    const packages = discoverPackages(monorepoRoot);
    if (packages.length > 0) {
      s.stop(`Found monorepo with ${packages.length} feature package(s)`);
      return selectPackage(packages);
    }
  }

  // 3. Scan ~/Development
  s.message('Scanning for Flutter projects...');
  const homeDev = path.join(os.homedir(), 'Development');
  if (fs.existsSync(homeDev)) {
    const projects = discoverProjects(homeDev, 2);
    if (projects.length > 0) {
      s.stop(`Found ${projects.length} Flutter project(s)`);
      return selectPackage(projects);
    }
  }

  s.stop('No Flutter projects found');
  clack.outro(chalk.red('Could not find any Flutter project with freezed or flutter_bloc.'));
  return null;
}

async function selectPackage(projects: ProjectInfo[]): Promise<ProjectInfo | null> {
  if (projects.length === 1) {
    clack.log.info(`Using ${chalk.green(projects[0].projectName)}`);
    return projects[0];
  }

  const selected = await clack.select({
    message: 'Select a package',
    options: projects.map((p) => ({
      value: p,
      label: p.projectName,
      hint: path.relative(os.homedir(), p.projectRoot),
    })),
  });

  if (clack.isCancel(selected)) {
    clack.cancel('Cancelled');
    return null;
  }

  return selected as ProjectInfo;
}

export async function interactiveMode(): Promise<void> {
  clack.intro(chalk.bgCyan(chalk.black(' wlmaker ')));

  const project = await resolveProject();
  if (!project) return;

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
  } else if (fs.existsSync(path.join(project.projectRoot, 'lib', 'bloc'))) {
    // Monorepo package: directo a lib/bloc/
    targetDir = path.join(project.projectRoot, 'lib', 'bloc');
    clack.log.info(`Target: ${chalk.cyan('lib/bloc/')}`);
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
