import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

export interface ProjectInfo {
  projectRoot: string;
  projectName: string;
  hasFreezed: boolean;
  hasBloc: boolean;
  hasBuildRunner: boolean;
  features: string[];
}

export function analyzeProject(startDir: string): ProjectInfo | null {
  const projectRoot = findPubspecDir(startDir);
  if (!projectRoot) return null;

  const pubspecPath = path.join(projectRoot, 'pubspec.yaml');
  const content = fs.readFileSync(pubspecPath, 'utf8');
  const pubspec = YAML.parse(content);

  const deps = {
    ...pubspec?.dependencies,
    ...pubspec?.dev_dependencies,
  };

  const features = discoverFeatures(projectRoot);

  return {
    projectRoot,
    projectName: pubspec?.name ?? path.basename(projectRoot),
    hasFreezed: 'freezed' in deps || 'freezed_annotation' in deps,
    hasBloc: 'flutter_bloc' in deps || 'bloc' in deps,
    hasBuildRunner: 'build_runner' in deps,
    features,
  };
}

function findPubspecDir(startDir: string): string | undefined {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return undefined;
}

function discoverFeatures(projectRoot: string): string[] {
  const featuresDir = path.join(projectRoot, 'lib', 'features');
  if (!fs.existsSync(featuresDir)) return [];

  return fs
    .readdirSync(featuresDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function findMonorepoRoot(startDir: string): string | undefined {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'melos.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return undefined;
}

export function discoverPackages(monorepoRoot: string): ProjectInfo[] {
  const packageDirs = ['packages', 'packages/features'];

  const projects: ProjectInfo[] = [];

  for (const base of packageDirs) {
    const baseDir = path.join(monorepoRoot, base);
    if (!fs.existsSync(baseDir)) continue;

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(baseDir, entry.name);
      if (!fs.existsSync(path.join(candidate, 'pubspec.yaml'))) continue;

      const project = analyzeProject(candidate);
      if (project && (project.hasFreezed || project.hasBloc)) {
        projects.push(project);
      }
    }
  }

  return projects.sort((a, b) => a.projectName.localeCompare(b.projectName));
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.dart_tool',
  'build',
  '.git',
  '.idea',
  '.fvm',
  'coverage',
]);

export function discoverProjects(searchDir: string, maxDepth = 2): ProjectInfo[] {
  const projects: ProjectInfo[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    const project = analyzeProject(dir);
    if (project && (project.hasFreezed || project.hasBloc)) {
      projects.push(project);
      return; // don't go deeper into a found project
    }

    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  }

  walk(searchDir, 0);
  return projects.sort((a, b) => a.projectName.localeCompare(b.projectName));
}
