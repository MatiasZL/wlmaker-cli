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
import { detectBookDir, serveBook } from './core/docs-serve.js';
import { discoverCommands, displayCommands } from './core/docs-commands.js';
import { discoverArchitecture, displayArchitecture } from './core/docs-architecture.js';
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

type CreateType = 'bloc' | 'widget' | 'usecase' | 'endpoint' | 'docs';

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

async function useCaseFlow(): Promise<void> {
  // Detect design system from cwd — no need to select a package
  const ds = detectDesignSystem(process.cwd());
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
      projectRoot: process.cwd(),
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

/** Find the BFF source files recursively, excluding .g.dart */
function findBffFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findBffFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.dart') && !entry.name.includes('.g.')) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

/** Try to infer which BFF API file matches the given endpoint path */
function inferBffFile(bffFiles: string[], endpointPath: string): string | null {
  const firstSegment = endpointPath.replace(/^\//, '').split('/')[0].toLowerCase();
  if (!firstSegment) return null;

  // Only consider files matching bff_{domain}_api.dart pattern
  type FileWithDomain = { file: string; domain: string };
  const withDomains: FileWithDomain[] = bffFiles
    .filter((f) => /^bff_.+_api\.dart$/.test(path.basename(f)))
    .map((f) => {
      const base = path.basename(f, '.dart');
      const domain = base.replace(/^bff_/, '').replace(/_api$/, '');
      return { file: f, domain };
    });

  // 1. Exact match: domain == segment
  const exact = withDomains.filter((x) => x.domain === firstSegment);
  if (exact.length === 1) return exact[0].file;

  // 2. Singular match: strip trailing 's'
  const singular = firstSegment.replace(/s$/, '');
  const singularMatch = withDomains.filter((x) => x.domain === singular);
  if (singularMatch.length === 1) return singularMatch[0].file;

  // 3. Domain ends with segment (e.g. "core_auth" ends with "auth")
  const endsWith = withDomains.filter(
    (x) => x.domain.endsWith(firstSegment) || x.domain.endsWith(singular),
  );
  if (endsWith.length === 1) return endsWith[0].file;

  // 4. Segment contains domain or domain contains segment
  const contains = withDomains.filter(
    (x) => firstSegment.includes(x.domain) || singular.includes(x.domain),
  );
  if (contains.length === 1) return contains[0].file;

  return null; // Ambiguous or no match
}

/** Auto-find the package with lib/data/api/bff/ */
async function resolveEndpointProject(): Promise<ProjectInfo | null> {
  const s = clack.spinner();
  s.start('Finding BFF package...');

  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (monorepoRoot) {
    s.message(`Monorepo found at ${monorepoRoot}`);
    const packageBases = ['packages', 'packages/features'];
    for (const base of packageBases) {
      const baseDir = path.join(monorepoRoot, base);
      if (!fs.existsSync(baseDir)) continue;
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(baseDir, entry.name);
        if (!fs.existsSync(path.join(candidate, 'pubspec.yaml'))) continue;
        const bffPath = path.join(candidate, 'lib', 'data', 'api', 'bff');
        s.message(`Checking ${candidate} → bff exists: ${fs.existsSync(bffPath)}`);
        if (fs.existsSync(bffPath)) {
          const project = analyzeProject(candidate);
          if (project) {
            s.stop(`Using ${chalk.green(project.projectName)}`);
            return project;
          }
        }
      }
    }
  } else {
    s.message('No monorepo root found');
  }

  // Try current directory
  const cwdProject = analyzeProject(process.cwd());
  if (cwdProject && fs.existsSync(path.join(cwdProject.projectRoot, 'lib', 'data', 'api', 'bff'))) {
    s.stop(`Using ${chalk.green(cwdProject.projectName)}`);
    return cwdProject;
  }

  s.stop('No BFF package found');

  // Fallback: let user manually specify the path
  const manualPath = await clack.text({
    message: 'Enter the path to the package (must contain lib/data/api/bff/):',
    placeholder: 'e.g. /path/to/my-package or ./packages/core',
    validate: (v) => {
      if (!v.trim()) return 'Path is required';
      const resolved = path.resolve(v.trim());
      if (!fs.existsSync(resolved)) return 'Path does not exist';
      if (!fs.existsSync(path.join(resolved, 'pubspec.yaml'))) return 'No pubspec.yaml found at this path';
      if (!fs.existsSync(path.join(resolved, 'lib', 'data', 'api', 'bff'))) return 'No lib/data/api/bff/ found at this path';
    },
  });
  if (clack.isCancel(manualPath)) { clack.cancel('Cancelled'); return null; }

  const resolved = path.resolve(manualPath as string);
  const project = analyzeProject(resolved);
  if (!project) {
    clack.outro(chalk.red(`Could not analyze project at ${resolved}`));
    return null;
  }

  clack.log.info(`Using ${chalk.green(project.projectName)}`);
  return project;
}

export async function endpointFlow(): Promise<void> {
  const project = await resolveEndpointProject();
  if (!project) return;

  const lib = path.join(project.projectRoot, 'lib');
  const bffDir = path.join(lib, 'data', 'api', 'bff');
  const bffFiles = findBffFiles(bffDir);

  if (bffFiles.length === 0) {
    clack.outro(chalk.red('No BFF API files found. Ensure lib/data/api/bff/ exists with .dart files.'));
    return;
  }

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

  // 3. BFF API file — try to infer from path, only ask if ambiguous
  let bffApiFile = inferBffFile(bffFiles, endpointPath as string);

  if (bffApiFile) {
    clack.log.info(`Auto-detected BFF file: ${chalk.cyan(path.basename(bffApiFile))}`);
  } else {
    // Couldn't infer — ask user
    const selected = await clack.select({
      message: 'Could not auto-detect BFF file. Select one:',
      options: bffFiles.map((f) => ({
        value: f,
        label: path.relative(bffDir, f),
      })),
    });
    if (clack.isCancel(selected)) { clack.cancel('Cancelled'); return; }
    bffApiFile = selected as string;
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

  // 5. DI target selection
  const diTarget = await clack.select({
    message: 'Where to register DI modules?',
    options: [
      { value: 'app_base', label: 'app_base' },
      { value: 'app_base_loyalty', label: 'app_base_loyalty' },
      { value: 'none', label: 'Skip (no DI registration)' },
    ],
    initialValue: 'app_base',
  });
  if (clack.isCancel(diTarget)) { clack.cancel('Cancelled'); return; }

  // 6. LazySingleton? (only when registering in app_base)
  let diLazySingleton = true;
  if (diTarget !== 'none') {
    const lazyAnswer = await clack.confirm({
      message: 'Use @lazySingleton annotation?',
      initialValue: true,
    });
    if (clack.isCancel(lazyAnswer)) { clack.cancel('Cancelled'); return; }
    diLazySingleton = lazyAnswer as boolean;
  }

  // Generate
  const genSpinner = clack.spinner();
  genSpinner.start('Generating endpoint stack...');

  try {
    await createEndpoint({
      projectRoot: project.projectRoot,
      projectName: project.projectName,
      httpMethod: httpMethod as EndpointOptions['httpMethod'],
      endpointPath: endpointPath as string,
      bffApiFile,
      useCaseName: useCaseName as string,
      diTarget: diTarget as string,
      diLazySingleton,
    });
    genSpinner.stop('Endpoint generated');
    clack.outro(chalk.green('Done!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

// ============================================================
// Docs Flow
// ============================================================

export async function docsInteractiveMode(): Promise<void> {
  clack.intro(chalk.bgCyan(chalk.black(' wlmaker docs ')));

  const action = await clack.select({
    message: 'What do you want to do?',
    options: [
      { value: 'serve', label: 'Serve', hint: 'Start Docusaurus dev server' },
      { value: 'commands', label: 'Commands', hint: 'Show Makefile & melos commands' },
      { value: 'architecture', label: 'Architecture', hint: 'Display monorepo tree' },
    ],
  });

  if (clack.isCancel(action)) {
    clack.cancel('Cancelled');
    return;
  }

  switch (action) {
    case 'serve': {
      const bookDir = detectBookDir(process.cwd());
      if (!bookDir) {
        clack.outro(
          chalk.red('No Docusaurus book/ directory found. Run from a monorepo root.'),
        );
        return;
      }
      clack.log.info(`Serving docs from ${chalk.cyan(bookDir)}`);
      await serveBook(bookDir);
      break;
    }
    case 'commands': {
      const commands = discoverCommands(process.cwd());
      if (commands.length === 0) {
        clack.outro(chalk.yellow('No commands found. Run from a monorepo root.'));
        return;
      }
      clack.log.info(`Found ${chalk.green(commands.length.toString())} command(s)`);
      displayCommands(commands);
      clack.outro(chalk.green('Done!'));
      break;
    }
    case 'architecture': {
      const info = discoverArchitecture(process.cwd());
      if (!info) {
        clack.outro(
          chalk.yellow('No monorepo detected. Run from within a Melos monorepo.'),
        );
        return;
      }
      displayArchitecture(info);
      clack.outro(chalk.green('Done!'));
      break;
    }
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
      {
        value: 'docs',
        label: 'Docs',
        hint: 'Project documentation tools',
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
    case 'usecase':
      await useCaseFlow();
      break;
    case 'endpoint':
      await endpointFlow();
      break;
    case 'docs':
      await docsInteractiveMode();
      break;
  }
}
