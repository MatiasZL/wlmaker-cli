import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import {
  analyzeProject,
  findMonorepoRoot,
  discoverPackages,
  discoverCollaborativeFeatures,
  discoverProjects,
  type ProjectInfo,
} from './core/project-analyzer.js';
import { createBloc } from './core/create-bloc.js';
import { createWidget } from './core/create-widget.js';
import { createUseCase } from './core/create-usecase.js';
import { createEndpoint, type EndpointOptions } from './core/create-endpoint.js';
import { createPage } from './core/create-page.js';
import { createEnvVar, discoverAppsWithEnv, discoverVendorsModules, type EnvVarType } from './core/create-env-var.js';
import { createPackage } from './core/create-package.js';
import { createCollaborativeFeature } from './core/collaborative/create-collaborative-feature.js';
import { createCollaborativePage } from './core/collaborative/create-collaborative-page.js';
import { createCollaborativeBloc } from './core/collaborative/create-collaborative-bloc.js';
import { createCollaborativeEndpoint } from './core/collaborative/create-collaborative-endpoint.js';
import { createApp, type CreateAppOptions } from './core/create-app.js';
import { createAppType, editAppType, parseAppTypes, discoverExistingLocales, countryToEnumName } from './core/create-app-type.js';
import { SUPPORTED_COUNTRIES } from './core/app-type-constants.js';
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

type CreateType = 'bloc' | 'widget' | 'usecase' | 'page' | 'endpoint' | 'env-var' | 'package' | 'app' | 'docs' | 'collaborative';

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
    validate: (value = '') => {
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
        validate: (v = '') => {
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
      validate: (v = '') => {
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
    validate: (value = '') => {
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
    validate: (value = '') => {
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
// Page Flow
// ============================================================

function discoverMonorepoPackages(monorepoRoot: string): { name: string; pagesDir: string }[] {
  const results: { name: string; pagesDir: string }[] = [];
  const packageBases = ['packages', 'packages/features'];

  for (const base of packageBases) {
    const baseDir = path.join(monorepoRoot, base);
    if (!fs.existsSync(baseDir)) continue;

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgDir = path.join(baseDir, entry.name);
      if (fs.existsSync(path.join(pkgDir, 'pubspec.yaml'))) {
        results.push({ name: entry.name, pagesDir: path.join(pkgDir, 'lib', 'pages') });
      }
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function pageFlow(
  initialName?: string,
  initialPath?: string,
): Promise<void> {
  const name =
    initialName ??
    (await clack.text({
      message: 'Page name (snake_case)',
      placeholder: 'e.g. profile, order_detail',
      validate: (value = '') => {
        if (!value.trim()) return 'Name is required';
        if (!SNAKE_CASE_REGEX.test(value))
          return 'Must be snake_case (lowercase, digits, underscores)';
      },
    }));

  if (clack.isCancel(name)) {
    clack.cancel('Cancelled');
    return;
  }

  let pagesPath: string | undefined = initialPath;

  if (!pagesPath) {
    const monorepoRoot = findMonorepoRoot(process.cwd());

    if (monorepoRoot) {
      const packages = discoverMonorepoPackages(monorepoRoot);

      if (packages.length > 0) {
        const selected = await clack.select({
          message: 'Select package where the page will be created',
          options: [
            ...packages.map((p) => ({
              value: p.pagesDir,
              label: p.name,
              hint: path.relative(monorepoRoot, p.pagesDir),
            })),
            { value: '__custom__', label: 'Custom path...' },
          ],
        });

        if (clack.isCancel(selected)) {
          clack.cancel('Cancelled');
          return;
        }

        if (selected === '__custom__') {
          const customPath = await clack.text({
            message: 'Absolute path to pages directory',
            placeholder: '/path/to/packages/home/lib/pages',
            validate: (v = '') => {
              if (!v.trim()) return 'Path is required';
              const resolved = path.resolve(v.trim());
              if (!fs.existsSync(resolved)) return 'Path does not exist';
            },
          });

          if (clack.isCancel(customPath)) {
            clack.cancel('Cancelled');
            return;
          }

          pagesPath = path.resolve(customPath as string);
        } else {
          pagesPath = selected as string;
        }
      } else {
        pagesPath = await askManualPagesPath();
      }
    } else {
      pagesPath = await askManualPagesPath();
    }
  }

  if (!pagesPath) return;

  const genSpinner = clack.spinner();
  genSpinner.start('Creating page...');

  try {
    await createPage(name as string, { pagesPath });
    genSpinner.stop('Page created');
    clack.outro(chalk.green('Done!'));
  } catch (error) {
    genSpinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

async function askManualPagesPath(): Promise<string | undefined> {
  const customPath = await clack.text({
    message: 'Absolute path to pages directory',
    placeholder: '/path/to/project/lib/pages',
    validate: (v = '') => {
      if (!v.trim()) return 'Path is required';
      const resolved = path.resolve(v.trim());
      if (!fs.existsSync(resolved)) return 'Path does not exist';
    },
  });

  if (clack.isCancel(customPath)) {
    clack.cancel('Cancelled');
    return undefined;
  }

  return path.resolve(customPath as string);
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
    validate: (v = '') => {
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
    validate: (v) => { if (!(v ?? '').trim()) return 'Path is required'; },
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
    validate: (v = '') => {
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
// Package Flow
// ============================================================

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
      const serveMode = await clack.select({
        message: 'How do you want to view the docs?',
        options: [
          { value: 'local', label: 'Local', hint: 'Start Docusaurus dev server locally' },
          { value: 'remote', label: 'Remote', hint: 'Open the deployed docs in your browser' },
        ],
      });

      if (clack.isCancel(serveMode)) {
        clack.cancel('Cancelled');
        return;
      }

      if (serveMode === 'remote') {
        const challenge = await clack.text({
          message: 'Pregunta de seguridad: Qué dice mechi cuando tiene una duda en el diseño?',
          placeholder: '...',
          validate: (input = '') => {
            const normalized = input.trim().toLowerCase().replace(/[áä]/g, 'a').replace(/[éë]/g, 'e').replace(/[íï]/g, 'i').replace(/[óö]/g, 'o').replace(/[úü]/g, 'u');
            const expected = 'deja le pregunto a cesita';
            if (normalized !== expected) {
              return 'Respuesta incorrecta. Vuelve cuando sepas el lore.';
            }
          },
        });

        if (clack.isCancel(challenge)) {
          clack.cancel('Cancelled');
          return;
        }

        const remoteUrl = process.env.WL_DOCS_URL;
        if (!remoteUrl) {
          clack.outro(chalk.red('Remote docs URL not configured. Set WL_DOCS_URL in your environment.'));
          return;
        }
        clack.log.info(`Opening remote docs: ${chalk.cyan(remoteUrl)}`);
        execSync(`open "${remoteUrl}"`, { stdio: 'ignore' });
        clack.outro(chalk.green('Opened remote docs in browser'));
        return;
      }

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
// Env Var Flow
// ============================================================

const SCREAMING_SNAKE_REGEX = /^[A-Z][A-Z0-9_]*$/;

export async function envVarFlow(): Promise<void> {
  // 1. Find monorepo root
  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (!monorepoRoot) {
    clack.outro(chalk.red('Not inside a monorepo. Run from within a Melos monorepo.'));
    return;
  }

  // Discover apps
  const apps = discoverAppsWithEnv(monorepoRoot);
  if (apps.length === 0) {
    clack.outro(chalk.red('No apps with env/ directory found in the monorepo.'));
    return;
  }

  // 2. Variable name
  const variableName = await clack.text({
    message: 'Variable name (SCREAMING_SNAKE_CASE)',
    placeholder: 'MY_FEATURE_FLAG',
    validate: (v = '') => {
      if (!v.trim()) return 'Name is required';
      if (!SCREAMING_SNAKE_REGEX.test(v)) return 'Must be SCREAMING_SNAKE_CASE (uppercase, numbers, underscores)';
    },
  });
  if (clack.isCancel(variableName)) { clack.cancel('Cancelled'); return; }

  // 3. Type
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

  // 4. Default value (optional)
  const defaultValue = await clack.text({
    message: 'Default value (leave empty to skip)',
    placeholder: selectedType === 'bool' ? 'false' : selectedType === 'int' ? '0' : '',
    validate: (v) => {
      if (!v || !v.trim()) return undefined; // allow empty
      if (selectedType === 'int' && !/^-?\d+$/.test(v)) return 'Must be an integer';
      if (selectedType === 'bool' && !['true', 'false'].includes(v)) return 'Must be true or false';
    },
  });
  if (clack.isCancel(defaultValue)) { clack.cancel('Cancelled'); return; }

  // 5. Select apps
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

  // 6. Remote config
  const includeInRemoteConfig = await clack.confirm({
    message: 'Add to VendorsModule RemoteConfig defaultValues?',
    initialValue: true,
  });
  if (clack.isCancel(includeInRemoteConfig)) { clack.cancel('Cancelled'); return; }

  // 6b. Which vendors modules?
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

  // 7. AppConfig
  const includeInAppConfig = await clack.confirm({
    message: 'Add to AppConfig entity and AppConfigModel?',
    initialValue: true,
  });
  if (clack.isCancel(includeInAppConfig)) { clack.cancel('Cancelled'); return; }

  // Generate
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

// ============================================================
// Collaborative Flow
// ============================================================

type CollaborativeAction = 'feature' | 'page' | 'bloc' | 'endpoint';

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
      { value: 'feature', label: 'Feature', hint: 'Complete feature with DI, BLoC, Page, Endpoint stack' },
      { value: 'page', label: 'Page + View', hint: 'Add a new page/view to an existing feature' },
      { value: 'bloc', label: 'BLoC', hint: 'Add a new BLoC to an existing feature' },
      { value: 'endpoint', label: 'Endpoint', hint: 'Add endpoint stack (entity, model, repo, usecase) to an existing feature' },
    ],
  });

  if (clack.isCancel(action)) {
    clack.cancel('Cancelled');
    return;
  }

  switch (action as CollaborativeAction) {
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
    message: 'Feature name (snake_case, e.g. feature_orders)',
    placeholder: 'feature_orders',
    validate: (value) => {
      if (!value || !value.trim()) return 'Name is required';
      if (!SNAKE_CASE_REGEX.test(value)) return 'Must be snake_case';
      const pkgDir = path.join(monorepoRoot, 'packages', 'collaborative', value);
      if (fs.existsSync(pkgDir)) return `packages/collaborative/${value} already exists`;
    },
  });

  if (clack.isCancel(name)) {
    clack.cancel('Cancelled');
    return;
  }

  const genSpinner = clack.spinner();
  genSpinner.start('Creating collaborative feature...');

  try {
    await createCollaborativeFeature({
      monorepoRoot,
      featureName: name as string,
    });
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

  // HTTP Method
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

  // Endpoint path
  const endpointPath = await clack.text({
    message: 'Endpoint path (e.g. /items/{id})',
    placeholder: '/api/items/{id}',
    validate: (v) => { if (!(v ?? '').trim()) return 'Path is required'; },
  });
  if (clack.isCancel(endpointPath)) { clack.cancel('Cancelled'); return; }

  // UseCase name
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

// ============================================================
// App Flow
// ============================================================

type AppAction = 'new-app' | 'app-type' | 'change-splash' | 'change-firebase' | 'change-app-name' | 'change-bundle-id' | 'manage-entitlements';

function getAppsList(monorepoRoot: string): string[] {
  const appsDir = path.join(monorepoRoot, 'apps');
  if (!fs.existsSync(appsDir)) return [];
  return fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .filter(d => d.name !== 'widgetbook')
    .filter(d => fs.existsSync(path.join(appsDir, d.name, 'pubspec.yaml')))
    .map(d => d.name)
    .sort();
}

export async function changeFirebaseProjectFlow(monorepoRoot: string): Promise<void> {
  const appsDir = path.join(monorepoRoot, 'apps');
  const apps = getAppsList(monorepoRoot);

  if (apps.length === 0) {
    clack.outro(chalk.red('No apps found in the monorepo.'));
    return;
  }

  const selectedApp = await clack.select({
    message: 'Select app',
    options: apps.map(a => ({ value: a, label: a })),
  });
  if (clack.isCancel(selectedApp)) {
    clack.cancel('Cancelled');
    return;
  }

  const makefilePath = path.join(appsDir, selectedApp as string, 'Makefile');
  if (!fs.existsSync(makefilePath)) {
    clack.outro(chalk.red('No Makefile found for this app.'));
    return;
  }

  const makefileContent = fs.readFileSync(makefilePath, 'utf-8');

  const stgMatch = makefileContent.match(/fire-stg:\s*\n\tflutterfire configure[^]*?--project=([^\s]+)/);
  const prodMatch = makefileContent.match(/fire-prod:\s*\n\tflutterfire configure[^]*?--project=([^\s]+)/);

  if (!stgMatch && !prodMatch) {
    clack.outro(chalk.red('No fire-stg or fire-prod targets found in Makefile.'));
    return;
  }

  const stgProject = stgMatch ? stgMatch[1] : 'N/A';
  const prodProject = prodMatch ? prodMatch[1] : 'N/A';

  const selectedEnv = await clack.select({
    message: 'Select environment',
    options: [
      { value: 'stg', label: 'STG', hint: `project: ${stgProject}` },
      { value: 'prod', label: 'PROD', hint: `project: ${prodProject}` },
    ],
  });
  if (clack.isCancel(selectedEnv)) {
    clack.cancel('Cancelled');
    return;
  }

  const env = selectedEnv as 'stg' | 'prod';
  const currentProject = env === 'stg' ? stgProject : prodProject;

  if (currentProject === 'N/A') {
    clack.outro(chalk.red(`No fire-${env} target found in Makefile.`));
    return;
  }

  clack.log.info(`Current Firebase project (${env.toUpperCase()}): ${chalk.cyan(currentProject)}`);

  const newProject = await clack.text({
    message: 'New Firebase project ID',
    placeholder: currentProject,
    validate: (v) => {
      const val = (v ?? '').trim();
      if (!val) return 'Project ID is required';
      if (/\s/.test(val)) return 'Project ID cannot contain spaces';
    },
  });
  if (clack.isCancel(newProject)) {
    clack.cancel('Cancelled');
    return;
  }

  const projectId = (newProject as string).trim();

  console.log('');
  clack.log.info(`App:        ${chalk.cyan(selectedApp)}`);
  clack.log.info(`Env:        ${chalk.cyan(env.toUpperCase())}`);
  clack.log.info(`Project:    ${chalk.cyan(currentProject)} → ${chalk.cyan(projectId)}`);
  console.log('');

  const confirmChange = await clack.confirm({
    message: 'Update Firebase project?',
    initialValue: true,
  });
  if (clack.isCancel(confirmChange) || !confirmChange) {
    clack.cancel('Cancelled');
    return;
  }

  const targetName = `fire-${env}`;
  const targetRegex = new RegExp(
    `(${targetName}:\\s*\\n\\tflutterfire configure[^]*?--project=)${escapeRegex(currentProject)}`
  );
  const updated = makefileContent.replace(targetRegex, `$1${projectId}`);

  if (updated === makefileContent) {
    clack.outro(chalk.yellow('No changes made. Target not found or project ID unchanged.'));
    return;
  }

  fs.writeFileSync(makefilePath, updated);
  clack.log.success(chalk.green('Makefile updated!'));
  clack.log.info(`Run: ${chalk.cyan(`cd apps/${selectedApp} && make ${targetName}`)}`);
  clack.outro('Done!');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function changeBundleIdFlow(monorepoRoot: string): Promise<void> {
  const appsDir = path.join(monorepoRoot, 'apps');
  const apps = getAppsList(monorepoRoot);

  if (apps.length === 0) {
    clack.outro(chalk.red('No apps found in the monorepo.'));
    return;
  }

  const selectedApp = await clack.select({
    message: 'Select app',
    options: apps.map(a => ({ value: a, label: a })),
  });
  if (clack.isCancel(selectedApp)) {
    clack.cancel('Cancelled');
    return;
  }

  const appDir = path.join(appsDir, selectedApp as string);
  const flavorizrPath = path.join(appDir, 'flavorizr.yaml');
  if (!fs.existsSync(flavorizrPath)) {
    clack.outro(chalk.red('No flavorizr.yaml found for this app.'));
    return;
  }

  const flavorizrContent = fs.readFileSync(flavorizrPath, 'utf-8');

  const devAppId = flavorizrContent.match(/dev:[\s\S]*?android:\s*\n\s+applicationId:\s*["'](.+?)["']/);
  const prodAppId = flavorizrContent.match(/prod:[\s\S]*?android:\s*\n\s+applicationId:\s*["'](.+?)["']/);

  if (!devAppId && !prodAppId) {
    clack.outro(chalk.red('Could not parse bundle IDs from flavorizr.yaml.'));
    return;
  }

  const devBundleId = devAppId ? devAppId[1] : 'N/A';
  const prodBundleId = prodAppId ? prodAppId[1] : 'N/A';

  const selectedEnv = await clack.select({
    message: 'Select environment',
    options: [
      { value: 'dev', label: 'STG (dev)', hint: devBundleId },
      { value: 'prod', label: 'PROD', hint: prodBundleId },
    ],
  });
  if (clack.isCancel(selectedEnv)) {
    clack.cancel('Cancelled');
    return;
  }

  const env = selectedEnv as 'dev' | 'prod';
  const currentBundleId = env === 'dev' ? devBundleId : prodBundleId;

  if (currentBundleId === 'N/A') {
    clack.outro(chalk.red(`No ${env} flavor found in flavorizr.yaml.`));
    return;
  }

  clack.log.info(`Current bundle ID (${env === 'dev' ? 'STG' : 'PROD'}): ${chalk.cyan(currentBundleId)}`);

  const newBundleId = await clack.text({
    message: 'New bundle ID',
    placeholder: currentBundleId,
    validate: (v) => {
      const val = (v ?? '').trim();
      if (!val) return 'Bundle ID is required';
      if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(val)) return 'Must be a valid reverse-domain identifier (e.g. com.example.app)';
    },
  });
  if (clack.isCancel(newBundleId)) {
    clack.cancel('Cancelled');
    return;
  }

  const bundleId = (newBundleId as string).trim();

  console.log('');
  clack.log.info(`App:      ${chalk.cyan(selectedApp)}`);
  clack.log.info(`Env:      ${chalk.cyan(env === 'dev' ? 'STG' : 'PROD')}`);
  clack.log.info(`Bundle:   ${chalk.cyan(currentBundleId)} → ${chalk.cyan(bundleId)}`);
  console.log('');

  const confirmChange = await clack.confirm({
    message: 'Update bundle ID?',
    initialValue: true,
  });
  if (clack.isCancel(confirmChange) || !confirmChange) {
    clack.cancel('Cancelled');
    return;
  }

  const escapedCurrent = escapeRegex(currentBundleId);
  let updatedFlavorizr = flavorizrContent;

  const flavorizrAppIdRegex = new RegExp(
    `(android:\\s*\\n\\s+applicationId:\\s*["'])${escapedCurrent}(["'])`
  );
  updatedFlavorizr = updatedFlavorizr.replace(flavorizrAppIdRegex, `$1${bundleId}$2`);

  const flavorizrIosRegex = new RegExp(
    `(ios:\\s*\\n\\s+bundleId:\\s*["'])${escapedCurrent}(["'])`
  );
  updatedFlavorizr = updatedFlavorizr.replace(flavorizrIosRegex, `$1${bundleId}$2`);

  if (updatedFlavorizr !== flavorizrContent) {
    fs.writeFileSync(flavorizrPath, updatedFlavorizr);
    clack.log.success('flavorizr.yaml updated');
  }

  const makefilePath = path.join(appDir, 'Makefile');
  if (fs.existsSync(makefilePath)) {
    let makefileContent = fs.readFileSync(makefilePath, 'utf-8');
    let makefileUpdated = false;

    const targets = env === 'dev'
      ? ['firebase', 'fire-stg']
      : ['fire-prod'];

    for (const target of targets) {
      const targetRegex = new RegExp(
        `(${target}:\\s*\\n(?:\\s*#[^\\n]*\\n)*\\s*flutterfire configure[^]*?)(--ios-bundle-id=)${escapedCurrent}(\\s+--android-package-name=)${escapedCurrent}`
      );
      const newContent = makefileContent.replace(
        targetRegex,
        `$1$2${bundleId}$3${bundleId}`
      );
      if (newContent !== makefileContent) {
        makefileContent = newContent;
        makefileUpdated = true;
      }
    }

    if (makefileUpdated) {
      fs.writeFileSync(makefilePath, makefileContent);
      clack.log.success('Makefile updated');
    }
  }

  const exportOptionsPath = path.join(appDir, 'ExportOptions.plist');
  if (fs.existsSync(exportOptionsPath)) {
    let exportContent = fs.readFileSync(exportOptionsPath, 'utf-8');
    const exportRegex = new RegExp(`(<key>)${escapedCurrent}(</key>)`, 'g');
    const newExportContent = exportContent.replace(exportRegex, `$1${bundleId}$2`);
    if (newExportContent !== exportContent) {
      fs.writeFileSync(exportOptionsPath, newExportContent);
      clack.log.success('ExportOptions.plist updated');
    }
  }

  const envFile = env === 'dev' ? 'development.env.json' : 'production.env.json';
  const envPath = path.join(appDir, 'env', envFile);
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf-8');
    const envJson = JSON.parse(envContent);
    if (envJson.ANDROID_STORE_URL && envJson.ANDROID_STORE_URL.includes(currentBundleId)) {
      envJson.ANDROID_STORE_URL = envJson.ANDROID_STORE_URL.replace(currentBundleId, bundleId);
      fs.writeFileSync(envPath, JSON.stringify(envJson, null, 2) + '\n');
      clack.log.success(`${envFile} updated (ANDROID_STORE_URL)`);
    }
  }

  console.log('');
  clack.log.info(chalk.bold('Next steps:'));
  clack.log.info(`  1. Run flavors:   ${chalk.cyan(`cd apps/${selectedApp} && make flavors`)}`);
  clack.log.info(`  2. Run Firebase:  ${chalk.cyan(`cd apps/${selectedApp} && make ${env === 'dev' ? 'fire-stg' : 'fire-prod'}`)}`);

  const spinner = clack.spinner();
  spinner.start('Running flutter_flavorizr...');

  try {
    execSync('dart run flutter_flavorizr', {
      cwd: appDir,
      stdio: 'pipe',
    });
    spinner.stop('Flavors regenerated!');
  } catch {
    spinner.stop('Failed to run flutter_flavorizr');
    clack.log.warn(chalk.yellow('Run manually: make flavors'));
  }

  clack.outro(chalk.green('Done!'));
}

export async function changeAppNameFlow(monorepoRoot: string): Promise<void> {
  const appsDir = path.join(monorepoRoot, 'apps');
  const apps = getAppsList(monorepoRoot);

  if (apps.length === 0) {
    clack.outro(chalk.red('No apps found in the monorepo.'));
    return;
  }

  const selectedApp = await clack.select({
    message: 'Select app',
    options: apps.map(a => ({ value: a, label: a })),
  });
  if (clack.isCancel(selectedApp)) {
    clack.cancel('Cancelled');
    return;
  }

  const flavorizrPath = path.join(appsDir, selectedApp as string, 'flavorizr.yaml');
  if (!fs.existsSync(flavorizrPath)) {
    clack.outro(chalk.red('No flavorizr.yaml found for this app.'));
    return;
  }

  const flavorizrContent = fs.readFileSync(flavorizrPath, 'utf-8');

  const devNameMatch = flavorizrContent.match(/dev:\s*\n\s+app:\s*\n\s+name:\s*["'](.+?)["']/);
  const prodNameMatch = flavorizrContent.match(/prod:\s*\n\s+app:\s*\n\s+name:\s*["'](.+?)["']/);

  if (!devNameMatch && !prodNameMatch) {
    clack.outro(chalk.red('Could not parse app names from flavorizr.yaml.'));
    return;
  }

  const devName = devNameMatch ? devNameMatch[1] : 'N/A';
  const prodName = prodNameMatch ? prodNameMatch[1] : 'N/A';

  const selectedEnv = await clack.select({
    message: 'Select environment',
    options: [
      { value: 'dev', label: 'STG (dev)', hint: devName },
      { value: 'prod', label: 'PROD', hint: prodName },
    ],
  });
  if (clack.isCancel(selectedEnv)) {
    clack.cancel('Cancelled');
    return;
  }

  const env = selectedEnv as 'dev' | 'prod';
  const currentName = env === 'dev' ? devName : prodName;

  if (currentName === 'N/A') {
    clack.outro(chalk.red(`No ${env} flavor found in flavorizr.yaml.`));
    return;
  }

  clack.log.info(`Current app name (${env === 'dev' ? 'STG' : 'PROD'}): ${chalk.cyan(currentName)}`);

  const newName = await clack.text({
    message: 'New app name',
    placeholder: currentName,
    validate: (v) => {
      const val = (v ?? '').trim();
      if (!val) return 'App name is required';
    },
  });
  if (clack.isCancel(newName)) {
    clack.cancel('Cancelled');
    return;
  }

  const appName = (newName as string).trim();

  console.log('');
  clack.log.info(`App:   ${chalk.cyan(selectedApp)}`);
  clack.log.info(`Env:   ${chalk.cyan(env === 'dev' ? 'STG' : 'PROD')}`);
  clack.log.info(`Name:  ${chalk.cyan(currentName)} → ${chalk.cyan(appName)}`);
  console.log('');

  const confirmChange = await clack.confirm({
    message: 'Update app name?',
    initialValue: true,
  });
  if (clack.isCancel(confirmChange) || !confirmChange) {
    clack.cancel('Cancelled');
    return;
  }

  const escapedCurrent = escapeRegex(currentName);
  const flavorRegex = new RegExp(
    `(${env}:\\s*\\n\\s+app:\\s*\\n\\s+name:\\s*["'])${escapedCurrent}(["'])`
  );
  const updated = flavorizrContent.replace(flavorRegex, `$1${appName}$2`);

  if (updated === flavorizrContent) {
    clack.outro(chalk.yellow('No changes made. Name not found or unchanged.'));
    return;
  }

  fs.writeFileSync(flavorizrPath, updated);

  const spinner = clack.spinner();
  spinner.start('Running flutter_flavorizr...');

  try {
    execSync('dart run flutter_flavorizr', {
      cwd: path.join(appsDir, selectedApp as string),
      stdio: 'pipe',
    });
    spinner.stop('App name updated and flavors generated!');
    clack.outro(chalk.green('Done!'));
  } catch {
    spinner.stop('Failed to run flutter_flavorizr');
    clack.log.warn(chalk.yellow('flavorizr.yaml updated but flavor generation failed.'));
    clack.log.info(`Run manually: ${chalk.cyan(`cd apps/${selectedApp} && make flavors`)}`);
  }
}

export async function changeSplashColorFlow(monorepoRoot: string): Promise<void> {
  const appsDir = path.join(monorepoRoot, 'apps');
  const apps = getAppsList(monorepoRoot);

  if (apps.length === 0) {
    clack.outro(chalk.red('No apps found in the monorepo.'));
    return;
  }

  const selectedApp = await clack.select({
    message: 'Select app',
    options: apps.map(a => ({ value: a, label: a })),
  });
  if (clack.isCancel(selectedApp)) {
    clack.cancel('Cancelled');
    return;
  }

  const pubspecPath = path.join(appsDir, selectedApp as string, 'pubspec.yaml');
  const pubspecContent = fs.readFileSync(pubspecPath, 'utf-8');

  const colorMatch = pubspecContent.match(/flutter_native_splash:\s*\n\s*color:\s*["']?(#[0-9A-Fa-f]{6})["']?/);
  const currentColor = colorMatch ? colorMatch[1] : '#000000';

  clack.log.info(`Current splash color: ${chalk.cyan(currentColor)}`);

  const newColor = await clack.text({
    message: 'New splash color (hex)',
    placeholder: currentColor,
    validate: (v) => {
      const val = (v ?? '').trim();
      if (!val) return 'Color is required';
      if (!/^#[0-9A-Fa-f]{6}$/.test(val)) return 'Must be a valid hex color (e.g. #FF0000)';
    },
  });
  if (clack.isCancel(newColor)) {
    clack.cancel('Cancelled');
    return;
  }

  const color = (newColor as string).trim().toUpperCase();

  console.log('');
  clack.log.info(`App:   ${chalk.cyan(selectedApp)}`);
  clack.log.info(`Color: ${chalk.cyan(currentColor)} → ${chalk.cyan(color)}`);
  console.log('');

  const confirmChange = await clack.confirm({
    message: 'Update splash color?',
    initialValue: true,
  });
  if (clack.isCancel(confirmChange) || !confirmChange) {
    clack.cancel('Cancelled');
    return;
  }

  const splashSection = pubspecContent.match(/flutter_native_splash:[\s\S]*?(?=\n[a-z]|\n*$)/);
  if (!splashSection) {
    clack.outro(chalk.red('No flutter_native_splash section found in pubspec.yaml.'));
    return;
  }

  let updated = pubspecContent;
  const splashRegex = /(flutter_native_splash:\s*\n(?:.*\n)*?\s*color:\s*["']?)#[0-9A-Fa-f]{6}(["']?)/g;
  updated = updated.replace(splashRegex, `$1${color}$2`);

  fs.writeFileSync(pubspecPath, updated);

  const spinner = clack.spinner();
  spinner.start('Generating splash screens...');

  try {
    execSync('dart run flutter_native_splash:create', {
      cwd: path.join(appsDir, selectedApp as string),
      stdio: 'pipe',
    });
    spinner.stop('Splash screens generated!');
    clack.outro(chalk.green('Done!'));
  } catch {
    spinner.stop('Failed to generate splash screens');
    clack.log.warn(chalk.yellow('Color updated in pubspec.yaml but splash generation failed.'));
    clack.log.info(`Run manually: ${chalk.cyan(`cd apps/${selectedApp} && make splash`)}`);
  }
}

export async function manageEntitlementsFlow(monorepoRoot: string): Promise<void> {
  const appsDir = path.join(monorepoRoot, 'apps');
  const apps = getAppsList(monorepoRoot);

  if (apps.length === 0) {
    clack.outro(chalk.red('No apps found in the monorepo.'));
    return;
  }

  const selectedApp = await clack.select({
    message: 'Select app',
    options: apps.map(a => ({ value: a, label: a })),
  });
  if (clack.isCancel(selectedApp)) {
    clack.cancel('Cancelled');
    return;
  }

  const appDir = path.join(appsDir, selectedApp as string);
  const entitlementsPath = path.join(appDir, 'ios', 'Runner', 'Runner.entitlements');

  const EMPTY_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
`;

  if (!fs.existsSync(entitlementsPath)) {
    const runnerDir = path.dirname(entitlementsPath);
    if (!fs.existsSync(runnerDir)) {
      fs.mkdirSync(runnerDir, { recursive: true });
    }
    fs.writeFileSync(entitlementsPath, EMPTY_ENTITLEMENTS);
    clack.log.success('Created Runner.entitlements');
  }

  let content = fs.readFileSync(entitlementsPath, 'utf-8');

  const hasPush = /<key>aps-environment<\/key>/.test(content);
  const associatedDomainsMatch = content.match(/<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/);
  const hasAssociatedDomains = !!associatedDomainsMatch;
  const currentDomains: string[] = [];
  if (hasAssociatedDomains) {
    const domainMatches = associatedDomainsMatch![1].matchAll(/<string>([^<]+)<\/string>/g);
    for (const dm of domainMatches) {
      currentDomains.push(dm[1]);
    }
  }

  clack.log.info('Entitlements configure iOS app capabilities.');
  clack.log.info(`Push Notifications: ${hasPush ? chalk.green('enabled') : chalk.gray('disabled')}`);
  if (hasAssociatedDomains && currentDomains.length > 0) {
    clack.log.info(`Associated Domains: ${chalk.cyan(currentDomains.join(', '))}`);
  } else {
    clack.log.info(`Associated Domains: ${chalk.gray('none')}`);
  }

  async function showMenu(): Promise<void> {
    const currentContent = fs.readFileSync(entitlementsPath, 'utf-8');
    const pushEnabled = /<key>aps-environment<\/key>/.test(content);
    const adMatch = currentContent.match(/<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/);
    const domains: string[] = [];
    if (adMatch) {
      for (const dm of adMatch[1].matchAll(/<string>([^<]+)<\/string>/g)) {
        domains.push(dm[1]);
      }
    }

    const action = await clack.select({
      message: 'Entitlements configuration',
      options: [
        {
          value: 'toggle-push',
          label: pushEnabled ? 'Disable Push Notifications' : 'Enable Push Notifications',
          hint: pushEnabled ? 'Remove aps-environment' : 'Add aps-environment (production)',
        },
        {
          value: 'add-domains',
          label: 'Configure Associated Domains',
          hint: hasAssociatedDomains ? `Current: ${domains.filter(d => d.startsWith('applinks:')).map(d => d.replace('applinks:', '')).join(', ') || 'none'}` : 'No domains configured',
        },
        {
          value: 'remove-domains',
          label: 'Remove Associated Domains',
          hint: hasAssociatedDomains ? 'Remove all applinks + webcredentials' : 'No domains to remove',
        },
        { value: 'done', label: 'Done', hint: 'Go back' },
      ],
    });
    if (clack.isCancel(action)) {
      clack.cancel('Cancelled');
      return;
    }

    let updated = currentContent;

    switch (action) {
      case 'toggle-push': {
        if (pushEnabled) {
          updated = updated.replace(/\s*<key>aps-environment<\/key>\s*\n\s*<string>production<\/string>/, '');
        } else {
          updated = updated.replace('</dict>', `\t<key>aps-environment</key>\n\t<string>production</string>\n</dict>`);
        }
        fs.writeFileSync(entitlementsPath, updated);
        content = updated;
        clack.log.success(pushEnabled ? 'Push notifications disabled' : 'Push notifications enabled (production)');
        await showMenu();
        break;
      }

      case 'add-domains': {
        const domain = await clack.text({
          message: 'Domain (e.g., www.jumbo.com.ar)',
          placeholder: 'www.example.com',
          validate: (v) => {
            const val = (v ?? '').trim();
            if (!val) return 'Domain is required';
            if (!/^[\w.-]+$/.test(val)) return 'Invalid domain format';
          },
        });
        if (clack.isCancel(domain)) {
          await showMenu();
          return;
        }

        const domainStr = (domain as string).trim();
        const applink = `applinks:${domainStr}`;
        const webcred = `webcredentials:${domainStr}`;

        if (updated.includes(applink) && updated.includes(webcred)) {
          clack.log.info(chalk.yellow('Domain already configured'));
          await showMenu();
          return;
        }

        const existingAdMatch = updated.match(/<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/);
        if (existingAdMatch) {
          let arrayContent = existingAdMatch[1];
          if (!arrayContent.includes(applink)) {
            arrayContent += `\n\t\t<string>${applink}</string>`;
          }
          if (!arrayContent.includes(webcred)) {
            arrayContent += `\n\t\t<string>${webcred}</string>`;
          }
          updated = updated.replace(
            /(<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>)([\s\S]*?)(<\/array>)/,
            `$1${arrayContent}\n\t$3`,
          );
        } else {
          const block = `\t<key>com.apple.developer.associated-domains</key>\n\t<array>\n\t\t<string>${applink}</string>\n\t\t<string>${webcred}</string>\n\t</array>`;
          updated = updated.replace('</dict>', `${block}\n</dict>`);
        }

        fs.writeFileSync(entitlementsPath, updated);
        content = updated;
        clack.log.success(`Associated domains configured for ${chalk.cyan(domainStr)}`);
        await showMenu();
        break;
      }

      case 'remove-domains': {
        if (!hasAssociatedDomains) {
          clack.log.info(chalk.yellow('No associated domains to remove'));
          await showMenu();
          return;
        }
        updated = updated.replace(/\s*<key>com\.apple\.developer\.associated-domains<\/key>\s*\n\s*<array>[\s\S]*?<\/array>/, '');
        fs.writeFileSync(entitlementsPath, updated);
        content = updated;
        clack.log.success('Associated domains removed');
        await showMenu();
        break;
      }

      case 'done':
        clack.outro(chalk.green('Done!'));
        break;
    }
  }

  await showMenu();
}

export async function appFlow(): Promise<void> {
  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (!monorepoRoot) {
    clack.outro(chalk.red('Not inside a monorepo. Run from within a Melos monorepo.'));
    return;
  }

  clack.log.info(`Monorepo: ${chalk.cyan(path.relative(os.homedir(), monorepoRoot))}`);

  const action = await clack.select({
    message: 'What do you want to do in App?',
    options: [
      { value: 'new-app', label: 'New App', hint: 'Create a new app in the monorepo' },
      { value: 'app-type', label: 'App Type', hint: 'Manage AppType countries in localization' },
      { value: 'change-splash', label: 'Change Splash Color', hint: 'Update native splash screen color' },
      { value: 'change-firebase', label: 'Change Firebase Project', hint: 'Update Firebase project in Makefile' },
      { value: 'change-app-name', label: 'Change App Name', hint: 'Update app display name (Android & iOS)' },
      { value: 'change-bundle-id', label: 'Change Bundle ID', hint: 'Update bundle ID / application ID (Android & iOS)' },
      { value: 'manage-entitlements', label: 'Manage Entitlements', hint: 'Configure iOS capabilities (push notifications, universal links)' },
    ],
  });

  if (clack.isCancel(action)) {
    clack.cancel('Cancelled');
    return;
  }

  switch (action as AppAction) {
    case 'new-app':
      await newAppFlow(monorepoRoot);
      break;
    case 'app-type':
      await appTypeFlow(monorepoRoot);
      break;
    case 'change-splash':
      await changeSplashColorFlow(monorepoRoot);
      break;
    case 'change-firebase':
      await changeFirebaseProjectFlow(monorepoRoot);
      break;
    case 'change-app-name':
      await changeAppNameFlow(monorepoRoot);
      break;
    case 'change-bundle-id':
      await changeBundleIdFlow(monorepoRoot);
      break;
    case 'manage-entitlements':
      await manageEntitlementsFlow(monorepoRoot);
      break;
  }
}

async function newAppFlow(monorepoRoot: string): Promise<void> {
  const appName = await clack.text({
    message: 'App name (cc_brand, e.g., co_jumbo)',
    placeholder: 'co_jumbo',
    validate: (v) => {
      const val = v ?? '';
      if (!val.trim()) return 'App name is required';
      if (!/^[a-z]{2}_[a-z][a-z0-9]*$/.test(val.trim())) return 'Must follow pattern: cc_brand (e.g., co_jumbo, ar_disco, br_prezunic)';
    },
  });
  if (clack.isCancel(appName)) { clack.cancel('Cancelled'); return; }

  const appNameStr = (appName as string).trim();
  const underscoreIdx = appNameStr.indexOf('_');
  const countryCodeLower = appNameStr.substring(0, underscoreIdx);
  const brand = appNameStr.substring(underscoreIdx + 1);
  const countryCode = countryCodeLower.toUpperCase();

  const brandDisplayName = await clack.text({
    message: 'Brand display name (e.g., Jumbo)',
    placeholder: brand.charAt(0).toUpperCase() + brand.slice(1),
    validate: (v) => {
      const val = v ?? '';
      if (!val.trim()) return 'Brand display name is required';
      if (!/^[a-zA-ZÀ-ÿ\s]+$/.test(val.trim())) return 'Only letters and spaces allowed';
    },
  });
  if (clack.isCancel(brandDisplayName)) { clack.cancel('Cancelled'); return; }

  const appTypePath = path.join(
    monorepoRoot, 'packages', 'localization', 'lib', 'enum', 'app_type.dart',
  );

  let appType: string | undefined;
  while (!appType) {
    const existingTypes = parseAppTypes(appTypePath);

    const appTypeOption = await clack.select({
      message: 'AppType (from localization package)',
      options: [
        ...existingTypes.map(t => ({
          value: t.name,
          label: t.name.charAt(0).toUpperCase() + t.name.slice(1),
          hint: t.defaultLocale,
        })),
        { value: '__create_new__', label: '+ Crear nuevo AppType', hint: 'No encuentras tu país?' },
      ],
    });
    if (clack.isCancel(appTypeOption)) { clack.cancel('Cancelled'); return; }

    if (appTypeOption === '__create_new__') {
      await newAppTypeFlow(monorepoRoot);
      continue;
    }

    appType = appTypeOption as string;
  }

  const splashColor = '#000000';
  const parsedTypes = parseAppTypes(appTypePath);
  const selectedType = parsedTypes.find(t => t.name === appType);
  const countryDisplayName = selectedType
    ? selectedType.name.charAt(0).toUpperCase() + selectedType.name.slice(1)
    : countryCode;
  const themePath = `${brand}/${brand}-${countryCode}`;
  const devBundleId = `com.cencosud.${countryCodeLower}.${brand}.test`;
  const prodBundleId = `com.cencosud.${countryCodeLower}.${brand}`;
  const firebaseProjectTest = `${countryCodeLower}-${brand}-appwl-test`;
  const firebaseProjectProd = `${countryCodeLower}-${brand}-appwl-prod`;

  console.log('');
  clack.log.info(`App:          ${chalk.cyan(appNameStr)}`);
  clack.log.info(`Brand:        ${chalk.cyan(brand)}`);
  clack.log.info(`Country:      ${chalk.cyan(countryCode)} (${countryDisplayName})`);
  clack.log.info(`AppType:      ${chalk.cyan(appType)}`);
  clack.log.info(`Splash color: ${chalk.cyan(splashColor)}`);
  clack.log.info(`Theme:        ${chalk.cyan(themePath)}`);
  clack.log.info(`Dev bundle:   ${chalk.cyan(devBundleId)}`);
  clack.log.info(`Prod bundle:  ${chalk.cyan(prodBundleId)}`);
  clack.log.info(`Firebase:     ${chalk.cyan(firebaseProjectTest)} / ${chalk.cyan(firebaseProjectProd)}`);
  console.log('');

  const confirmCreate = await clack.confirm({
    message: 'Create this app?',
    initialValue: true,
  });
  if (clack.isCancel(confirmCreate) || !confirmCreate) {
    clack.cancel('Cancelled');
    return;
  }

  const spinner = clack.spinner();
  spinner.start('Creating app...');

  try {
    await createApp({
      monorepoRoot,
      appName: appNameStr,
      brand,
      brandDisplayName: (brandDisplayName as string).trim(),
      countryCode,
      countryDisplayName,
      appType: appType as string,
      splashColor: (splashColor as string).trim(),
      themePath,
      devBundleId,
      prodBundleId,
      androidNamespace: prodBundleId,
      firebaseProjectTest,
      firebaseProjectProd,
    });

    spinner.stop('App created');
    clack.outro(chalk.green('Done! App created successfully.'));
  } catch (error) {
    spinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

async function appTypeFlow(monorepoRoot: string): Promise<void> {
  const action = await clack.select({
    message: 'App Type management',
    options: [
      { value: 'new', label: 'New App Type', hint: 'Add a new country AppType to localization' },
      { value: 'edit', label: 'Edit App Type', hint: 'Edit an existing AppType locale configuration' },
    ],
  });

  if (clack.isCancel(action)) {
    clack.cancel('Cancelled');
    return;
  }

  switch (action as 'new' | 'edit') {
    case 'new':
      await newAppTypeFlow(monorepoRoot);
      break;
    case 'edit':
      await editAppTypeFlow(monorepoRoot);
      break;
  }
}

async function newAppTypeFlow(monorepoRoot: string): Promise<void> {
  const appTypePath = path.join(
    monorepoRoot, 'packages', 'localization', 'lib', 'enum', 'app_type.dart',
  );

  if (!fs.existsSync(appTypePath)) {
    clack.outro(chalk.red('app_type.dart not found in packages/localization'));
    return;
  }

  const existingTypes = parseAppTypes(appTypePath);

  const country = await clack.select({
    message: 'Select the country for the new AppType',
    options: SUPPORTED_COUNTRIES.map(c => ({
      value: c,
      label: c.name,
      hint: `${c.locale} (${c.language})`,
    })),
  });
  if (clack.isCancel(country)) { clack.cancel('Cancelled'); return; }

  const selectedCountry = country as typeof SUPPORTED_COUNTRIES[number];
  const enumName = countryToEnumName(selectedCountry.name);

  if (existingTypes.some(t => t.name === enumName)) {
    const shouldEdit = await clack.confirm({
      message: `AppType "${enumName}" already exists. Do you want to edit it instead?`,
      initialValue: true,
    });
    if (clack.isCancel(shouldEdit) || !shouldEdit) {
      clack.cancel('Cancelled');
      return;
    }
    await editAppTypeFlow(monorepoRoot, enumName);
    return;
  }

  console.log('');
  clack.log.info(`Country:       ${chalk.cyan(selectedCountry.name)}`);
  clack.log.info(`Enum name:     ${chalk.cyan(enumName)}`);
  clack.log.info(`Locale:        ${chalk.cyan(selectedCountry.locale)}`);
  clack.log.info(`Language:      ${chalk.cyan(selectedCountry.language)}`);
  clack.log.info(`Timezone:      ${chalk.cyan(selectedCountry.timezone)}`);
  console.log('');

  const confirmCreate = await clack.confirm({
    message: 'Create this AppType?',
    initialValue: true,
  });
  if (clack.isCancel(confirmCreate) || !confirmCreate) {
    clack.cancel('Cancelled');
    return;
  }

  const spinner = clack.spinner();
  spinner.start('Creating AppType...');

  try {
    await createAppType(monorepoRoot, selectedCountry);
    spinner.stop('AppType created');
    clack.outro(chalk.green('Done! AppType created successfully.'));
  } catch (error) {
    spinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

async function editAppTypeFlow(monorepoRoot: string, preselectedType?: string): Promise<void> {
  const appTypePath = path.join(
    monorepoRoot, 'packages', 'localization', 'lib', 'enum', 'app_type.dart',
  );
  const i18nDir = path.join(
    monorepoRoot, 'packages', 'localization', 'lib', 'i18n',
  );

  if (!fs.existsSync(appTypePath)) {
    clack.outro(chalk.red('app_type.dart not found in packages/localization'));
    return;
  }

  const existingTypes = parseAppTypes(appTypePath);
  if (existingTypes.length === 0) {
    clack.outro(chalk.red('No AppTypes found in app_type.dart'));
    return;
  }

  let selectedTypeName: string;

  if (preselectedType) {
    selectedTypeName = preselectedType;
  } else {
    const appTypeOption = await clack.select({
      message: 'Select AppType to edit',
      options: existingTypes.map(t => ({
        value: t.name,
        label: t.name.charAt(0).toUpperCase() + t.name.slice(1),
        hint: `default: ${t.defaultLocale}, supported: ${t.supportedLocales.join(', ')}`,
      })),
    });
    if (clack.isCancel(appTypeOption)) { clack.cancel('Cancelled'); return; }
    selectedTypeName = appTypeOption as string;
  }

  const target = existingTypes.find(t => t.name === selectedTypeName);
  if (!target) {
    clack.outro(chalk.red(`AppType "${selectedTypeName}" not found`));
    return;
  }

  const existingLocales = discoverExistingLocales(i18nDir);
  if (existingLocales.length === 0) {
    clack.outro(chalk.red('No i18n locale files found'));
    return;
  }

  const defaultLocale = await clack.select({
    message: 'Select default locale',
    options: existingLocales.map(loc => ({
      value: loc,
      label: loc,
      hint: loc === target.defaultLocale ? 'current' : undefined,
    })),
    initialValue: target.defaultLocale,
  });
  if (clack.isCancel(defaultLocale)) { clack.cancel('Cancelled'); return; }

  const supportedLocales = await clack.multiselect({
    message: 'Select supported locales (space to toggle)',
    options: existingLocales.map(loc => ({
      value: loc,
      label: loc,
      selected: target.supportedLocales.includes(loc),
    })),
    required: true,
  });
  if (clack.isCancel(supportedLocales) || (supportedLocales as string[]).length === 0) {
    clack.cancel('Cancelled');
    return;
  }

  const newDefault = defaultLocale as string;
  const newSupported = supportedLocales as string[];

  if (!newSupported.includes(newDefault)) {
    newSupported.push(newDefault);
  }

  console.log('');
  clack.log.info(`AppType:           ${chalk.cyan(selectedTypeName)}`);
  clack.log.info(`Default locale:    ${chalk.cyan(newDefault)}`);
  clack.log.info(`Supported locales: ${chalk.cyan(newSupported.join(', '))}`);
  console.log('');

  const confirmEdit = await clack.confirm({
    message: 'Save changes?',
    initialValue: true,
  });
  if (clack.isCancel(confirmEdit) || !confirmEdit) {
    clack.cancel('Cancelled');
    return;
  }

  const spinner = clack.spinner();
  spinner.start('Updating AppType...');

  try {
    await editAppType(monorepoRoot, selectedTypeName, newDefault, newSupported);
    spinner.stop('AppType updated');
    clack.outro(chalk.green('Done! AppType updated successfully.'));
  } catch (error) {
    spinner.stop('Failed');
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
      {
        value: 'app',
        label: 'App',
        hint: 'Create and manage apps',
      },
      { value: 'bloc', label: 'BLoC', hint: 'State management' },
      { value: 'widget', label: 'Widget', hint: 'Design system component' },
      {
        value: 'usecase',
        label: 'Widgetbook Use-Case',
        hint: 'Component showcase',
      },
      {
        value: 'page',
        label: 'Page',
        hint: 'GoRoute + View with barrels',
      },
      {
        value: 'endpoint',
        label: 'Endpoint',
        hint: 'BFF Clean Architecture stack',
      },
      {
        value: 'package',
        label: 'Package',
        hint: 'Create a new package in the monorepo',
      },
      {
        value: 'env-var',
        label: 'Env Var',
        hint: 'Add environment variable to monorepo stack',
      },
      {
        value: 'collaborative',
        label: 'Collaborative',
        hint: 'Generate collaborative feature / page / bloc / endpoint',
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
    case 'page':
      await pageFlow();
      break;
    case 'endpoint':
      await endpointFlow();
      break;
    case 'package':
      await packageFlow();
      break;
    case 'env-var':
      await envVarFlow();
      break;
    case 'collaborative':
      await collaborativeFlow();
      break;
    case 'app':
      await appFlow();
      break;
    case 'docs':
      await docsInteractiveMode();
      break;
  }
}
