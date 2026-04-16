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
import { createWidget } from './core/create-widget.js';
import { createUseCase } from './core/create-usecase.js';
import { createEndpoint, type EndpointOptions } from './core/create-endpoint.js';
import { detectDesignSystem } from './core/design-system-analyzer.js';
import {
  type Tier,
  VALID_TIERS,
  normalizeTier,
  tierPlural,
  tierLabel,
  getValidPatterns,
  getDefaultPattern,
  patternLabel,
} from './core/tier.js';

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

type CreateType = 'bloc' | 'widget' | 'usecase' | 'endpoint';

export async function resolveProject(): Promise<ProjectInfo | null> {
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

// ============================================================
// BLoC Flow (existing)
// ============================================================

async function blocFlow(project: ProjectInfo): Promise<void> {
  const name = await clack.text({
    message: 'BLoC name (snake_case)',
    placeholder: 'e.g. user_login',
    validate: (value) => {
      if (!value.trim()) return 'Name is required';
      if (!SNAKE_CASE_REGEX.test(value))
        return 'Must be snake_case (lowercase, digits, underscores)';
    },
  });

  if (clack.isCancel(name)) {
    clack.cancel('Cancelled');
    return;
  }

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
    targetDir = path.join(project.projectRoot, 'lib', 'bloc');
    clack.log.info(`Target: ${chalk.cyan('lib/bloc/')}`);
  } else {
    clack.note(
      'No lib/features/ directory found. Provide a target path manually.',
      'Info',
    );
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

  const defaultRun = project.hasBuildRunner;
  const runBuildRunner = await clack.confirm({
    message: 'Run build_runner after generation?',
    initialValue: defaultRun,
  });

  if (clack.isCancel(runBuildRunner)) {
    clack.cancel('Cancelled');
    return;
  }

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

// ============================================================
// Widget Flow
// ============================================================

async function widgetFlow(): Promise<void> {
  const projectRoot = process.cwd();

  // Detect design system directly from cwd
  const ds = detectDesignSystem(projectRoot);
  if (!ds) {
    clack.outro(
      chalk.red(
        'No design system detected. Run this command from a project with wl_design_system/ directory.',
      ),
    );
    return;
  }
  clack.log.info(
    `Design system: ${chalk.cyan(path.relative(projectRoot, ds.componentsDir))}`,
  );

  // Name
  const name = await clack.text({
    message: 'Widget name (snake_case, without wl_ prefix)',
    placeholder: 'e.g. toggle, badge, snackbar',
    validate: (value) => {
      if (!value.trim()) return 'Name is required';
      const clean = value.startsWith('wl_') ? value.slice(3) : value;
      if (!SNAKE_CASE_REGEX.test(clean))
        return 'Must be snake_case (lowercase, digits, underscores)';
    },
  });

  if (clack.isCancel(name)) {
    clack.cancel('Cancelled');
    return;
  }

  // Tier
  const allTiers = VALID_TIERS.map((t) => ({
    value: t,
    label: tierLabel(t),
  }));

  const selectedTier = await clack.select({
    message: 'Select tier',
    options: allTiers,
  });

  if (clack.isCancel(selectedTier)) {
    clack.cancel('Cancelled');
    return;
  }

  const tier = selectedTier as Tier;

  // Pattern
  const patterns = getValidPatterns(tier);
  let selectedPattern: string = getDefaultPattern(tier);

  if (patterns.length > 1) {
    const patternChoice = await clack.select({
      message: 'Select pattern',
      options: patterns.map((p) => ({
        value: p,
        label: patternLabel(p),
      })),
    });

    if (clack.isCancel(patternChoice)) {
      clack.cancel('Cancelled');
      return;
    }

    selectedPattern = patternChoice as string;
  }

  // Generate widget
  const genSpinner = clack.spinner();
  genSpinner.start('Generating widget files...');

  try {
    await createWidget(name as string, tier, {
      projectRoot,
      pattern: selectedPattern,
    });
    genSpinner.stop('Widget generated');

    // Auto-create use-case if widgetbook is available
    if (ds.widgetbookDir) {
      genSpinner.start('Creating widgetbook use-case...');
      try {
        await createUseCase(name as string, tier, {
          projectRoot,
          buildRunner: false,
        });
        genSpinner.stop('Use-case created');
      } catch (e) {
        genSpinner.stop(`Use-case skipped: ${e}`);
      }
    }

    clack.outro(chalk.green('Done!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

// ============================================================
// Use-Case Flow
// ============================================================

async function useCaseFlow(project: ProjectInfo): Promise<void> {
  // Detect design system
  const ds = detectDesignSystem(project.projectRoot);
  if (!ds) {
    clack.outro(
      chalk.red(
        'No design system detected. Ensure wl_design_system/ directory exists.',
      ),
    );
    return;
  }

  if (!ds.widgetbookDir) {
    clack.outro(
      chalk.red(
        'No widgetbook package detected. Ensure apps/widgetbook/ exists.',
      ),
    );
    return;
  }

  // Name
  const name = await clack.text({
    message: 'Widget name for use-case (snake_case, without wl_ prefix)',
    placeholder: 'e.g. toggle, badge',
    validate: (value) => {
      if (!value.trim()) return 'Name is required';
      const clean = value.startsWith('wl_') ? value.slice(3) : value;
      if (!SNAKE_CASE_REGEX.test(clean))
        return 'Must be snake_case (lowercase, digits, underscores)';
    },
  });

  if (clack.isCancel(name)) {
    clack.cancel('Cancelled');
    return;
  }

  // Tier
  const allTiers = VALID_TIERS.map((t) => ({
    value: t,
    label: tierLabel(t),
  }));

  const selectedTier = await clack.select({
    message: 'Select widget tier',
    options: allTiers,
  });

  if (clack.isCancel(selectedTier)) {
    clack.cancel('Cancelled');
    return;
  }

  const tier = selectedTier as Tier;

  // Build runner
  const runBuildRunner = await clack.confirm({
    message: 'Run build_runner after generation?',
    initialValue: true,
  });

  if (clack.isCancel(runBuildRunner)) {
    clack.cancel('Cancelled');
    return;
  }

  // Generate
  const genSpinner = clack.spinner();
  genSpinner.start('Generating use-case file...');

  try {
    await createUseCase(name as string, tier, {
      projectRoot: project.projectRoot,
      buildRunner: runBuildRunner as boolean,
    });
    genSpinner.stop('Use-case generated');
    clack.outro(chalk.green('Done!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

// ============================================================
// Endpoint Flow
// ============================================================

export async function endpointFlow(project: ProjectInfo): Promise<void> {
  const lib = path.join(project.projectRoot, 'lib');

  // 1. HTTP Method
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

  // 2. Endpoint path
  const endpointPath = await clack.text({
    message: 'Endpoint path (e.g. /products/{id})',
    placeholder: '/api/users/{id}',
    validate: (v) => { if (!v.trim()) return 'Path is required'; },
  });
  if (clack.isCancel(endpointPath)) { clack.cancel('Cancelled'); return; }

  // 3. BFF API file (auto-detected)
  const bffDir = path.join(lib, 'data', 'api', 'bff');
  let bffApiFile = '';

  if (fs.existsSync(bffDir)) {
    const dartFiles = fs.readdirSync(bffDir)
      .filter((f) => f.endsWith('.dart'))
      .sort();

    if (dartFiles.length > 0) {
      const selected = await clack.select({
        message: 'Select BFF API file',
        options: dartFiles.map((f) => ({
          value: path.join(bffDir, f),
          label: f,
        })),
      });
      if (clack.isCancel(selected)) { clack.cancel('Cancelled'); return; }
      bffApiFile = selected as string;
    } else {
      const customPath = await clack.text({
        message: 'BFF API file path (no .dart files found in bff/)',
        placeholder: 'lib/data/api/bff/my_api.dart',
        validate: (v) => { if (!v.trim()) return 'Path is required'; },
      });
      if (clack.isCancel(customPath)) { clack.cancel('Cancelled'); return; }
      bffApiFile = path.resolve(customPath as string);
    }
  } else {
    const customPath = await clack.text({
      message: 'BFF API file path (bff/ dir not found)',
      placeholder: 'lib/data/api/bff/my_api.dart',
      validate: (v) => { if (!v.trim()) return 'Path is required'; },
    });
    if (clack.isCancel(customPath)) { clack.cancel('Cancelled'); return; }
    bffApiFile = path.resolve(customPath as string);
  }

  // 4. UseCase name (auto-inferred from endpoint path, editable)
  const methodLower = (httpMethod as string).toLowerCase();
  const pathSegments = (endpointPath as string)
    .replace(/^\//, '')
    .split('/')
    .filter((s) => !s.startsWith('{'));
  const inferredName = pathSegments.length > 0
    ? `${methodLower}_${pathSegments.join('_')}`
    : `${methodLower}_data`;

  const useCaseName = await clack.text({
    message: 'UseCase name (snake_case)',
    placeholder: inferredName,
    initialValue: inferredName,
    validate: (v) => {
      if (!v.trim()) return 'Name is required';
      if (!SNAKE_CASE_REGEX.test(v)) return 'Must be snake_case';
    },
  });
  if (clack.isCancel(useCaseName)) { clack.cancel('Cancelled'); return; }

  // Generate
  const genSpinner = clack.spinner();
  genSpinner.start('Generating endpoint stack...');

  try {
    await createEndpoint({
      projectRoot: project.projectRoot,
      httpMethod: httpMethod as EndpointOptions['httpMethod'],
      endpointPath: endpointPath as string,
      bffApiFile,
      useCaseName: useCaseName as string,
    });
    genSpinner.stop('Endpoint generated');
    clack.outro(chalk.green('Done!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

// ============================================================
// Main Interactive Mode
// ============================================================

export async function interactiveMode(): Promise<void> {
  clack.intro(chalk.bgCyan(chalk.black(' wlmaker ')));

  // What do you want to create?
  const createType = await clack.select({
    message: 'What do you want to create?',
    options: [
      { value: 'bloc', label: 'BLoC', hint: 'State management' },
      { value: 'widget', label: 'Widget', hint: 'Design system component' },
      {
        value: 'usecase',
        label: 'Widgetbook Use-Case',
        hint: 'Component showcase',
      },
      {
        value: 'endpoint',
        label: 'Endpoint',
        hint: 'BFF Clean Architecture stack',
      },
    ],
  });

  if (clack.isCancel(createType)) {
    clack.cancel('Cancelled');
    return;
  }

  const type = createType as CreateType;

  switch (type) {
    case 'bloc': {
      const project = await resolveProject();
      if (!project) return;
      await blocFlow(project);
      break;
    }
    case 'widget':
      await widgetFlow();
      break;
    case 'usecase': {
      const project = await resolveProject();
      if (!project) return;
      await useCaseFlow(project);
      break;
    }
    case 'endpoint': {
      const project = await resolveProject();
      if (!project) return;
      await endpointFlow(project);
      break;
    }
  }
}
