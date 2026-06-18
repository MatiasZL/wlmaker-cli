import * as fs from 'fs';
import * as path from 'path';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { SNAKE_CASE_REGEX } from '../shared/naming.js';
import { analyzeProject, findMonorepoRoot, type ProjectInfo } from '../analyzer/project.js';
import { createEndpoint, type EndpointOptions } from '../generators/endpoint/generator.js';

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

function inferBffFile(bffFiles: string[], endpointPath: string): string | null {
  const firstSegment = endpointPath.replace(/^\//, '').split('/')[0].toLowerCase();
  if (!firstSegment) return null;

  type FileWithDomain = { file: string; domain: string };
  const withDomains: FileWithDomain[] = bffFiles
    .filter((f) => /^bff_.+_api\.dart$/.test(path.basename(f)))
    .map((f) => {
      const base = path.basename(f, '.dart');
      const domain = base.replace(/^bff_/, '').replace(/_api$/, '');
      return { file: f, domain };
    });

  const exact = withDomains.filter((x) => x.domain === firstSegment);
  if (exact.length === 1) return exact[0].file;

  const singular = firstSegment.replace(/s$/, '');
  const singularMatch = withDomains.filter((x) => x.domain === singular);
  if (singularMatch.length === 1) return singularMatch[0].file;

  const endsWith = withDomains.filter(
    (x) => x.domain.endsWith(firstSegment) || x.domain.endsWith(singular),
  );
  if (endsWith.length === 1) return endsWith[0].file;

  const contains = withDomains.filter(
    (x) => firstSegment.includes(x.domain) || singular.includes(x.domain),
  );
  if (contains.length === 1) return contains[0].file;

  return null;
}

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

  const cwdProject = analyzeProject(process.cwd());
  if (cwdProject && fs.existsSync(path.join(cwdProject.projectRoot, 'lib', 'data', 'api', 'bff'))) {
    s.stop(`Using ${chalk.green(cwdProject.projectName)}`);
    return cwdProject;
  }

  s.stop('No BFF package found');

  const manualPath = await clack.text({
    message: 'Enter the path to the package (must contain lib/data/api/bff/):',
    placeholder: 'e.g. /path/to/my-package or ./packages/core',
    validate: (v) => {
      if (v === undefined || !v.trim()) return 'Path is required';
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
    message: 'Endpoint path (e.g. /products/{id})',
    placeholder: '/api/users/{id}',
    validate: (v) => { if (v === undefined || !v.trim()) return 'Path is required'; },
  });
  if (clack.isCancel(endpointPath)) { clack.cancel('Cancelled'); return; }

  let bffApiFile = inferBffFile(bffFiles, endpointPath as string);

  if (bffApiFile) {
    clack.log.info(`Auto-detected BFF file: ${chalk.cyan(path.basename(bffApiFile))}`);
  } else {
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
      if (v === undefined || !v.trim()) return 'Name is required';
      if (!SNAKE_CASE_REGEX.test(v)) return 'Must be snake_case';
    },
  });
  if (clack.isCancel(useCaseName)) { clack.cancel('Cancelled'); return; }

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

  let diLazySingleton = true;
  if (diTarget !== 'none') {
    const lazyAnswer = await clack.confirm({
      message: 'Use @lazySingleton annotation?',
      initialValue: true,
    });
    if (clack.isCancel(lazyAnswer)) { clack.cancel('Cancelled'); return; }
    diLazySingleton = lazyAnswer as boolean;
  }

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
