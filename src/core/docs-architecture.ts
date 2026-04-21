import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import YAML from 'yaml';
import { findMonorepoRoot } from './project-analyzer.js';
import { detectDesignSystem } from './design-system-analyzer.js';

interface PackageInfo {
  name: string;
  dir: string;
  keyDeps: string[];
}

interface AppInfo {
  name: string;
  dir: string;
}

export interface ArchitectureInfo {
  root: string;
  projectName: string;
  apps: AppInfo[];
  packages: PackageInfo[];
  hasDesignSystem: boolean;
  designSystemTiers: string[];
}

const KEY_DEPS = [
  'freezed',
  'freezed_annotation',
  'flutter_bloc',
  'bloc',
  'retrofit',
  'retrofit_generator',
  'json_serializable',
  'injectable',
  'get_it',
  'go_router',
  'widgetbook',
];

/**
 * Scan apps/ and packages/ dirs for pubspec.yaml, extract key deps,
 * detect design system tiers.
 */
export function discoverArchitecture(startDir: string): ArchitectureInfo | null {
  const root = findMonorepoRoot(startDir);
  if (!root) return null;

  const melosPath = path.join(root, 'melos.yaml');
  if (!fs.existsSync(melosPath)) return null;

  const melosContent = fs.readFileSync(melosPath, 'utf8');
  const melos = YAML.parse(melosContent);
  const projectName = melos?.name ?? path.basename(root);

  // Scan apps/
  const apps: AppInfo[] = [];
  const appsDir = path.join(root, 'apps');
  if (fs.existsSync(appsDir)) {
    for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(appsDir, entry.name);
      if (fs.existsSync(path.join(candidate, 'pubspec.yaml'))) {
        apps.push({ name: entry.name, dir: candidate });
      }
    }
  }

  // Scan packages/ (flat + features subdirectory)
  const packages: PackageInfo[] = [];
  const packageBases = ['packages', 'packages/features'];
  for (const base of packageBases) {
    const baseDir = path.join(root, base);
    if (!fs.existsSync(baseDir)) continue;
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(baseDir, entry.name);
      const pubspecPath = path.join(candidate, 'pubspec.yaml');
      if (!fs.existsSync(pubspecPath)) continue;

      const content = fs.readFileSync(pubspecPath, 'utf8');
      const pubspec = YAML.parse(content);
      const deps = {
        ...pubspec?.dependencies,
        ...pubspec?.dev_dependencies,
      };

      const keyDeps = KEY_DEPS.filter((d) => d in deps);
      packages.push({
        name: pubspec?.name ?? entry.name,
        dir: candidate,
        keyDeps,
      });
    }
  }

  // Detect design system
  let hasDesignSystem = false;
  let designSystemTiers: string[] = [];
  const ds = detectDesignSystem(root);
  if (ds) {
    hasDesignSystem = true;
    designSystemTiers = ds.availableTiers;
  }

  return {
    root,
    projectName,
    apps,
    packages,
    hasDesignSystem,
    designSystemTiers,
  };
}

/**
 * Print a tree view of the monorepo architecture using Unicode box-drawing chars.
 */
export function displayArchitecture(info: ArchitectureInfo): void {
  const T = '├── ';
  const L = '└── ';
  const I = '│   ';
  const S = '    ';

  console.log(chalk.bold(chalk.cyan(info.projectName)) + chalk.gray(`  (${info.root})`));
  console.log(`${I}`);

  // Apps
  if (info.apps.length > 0) {
    console.log(chalk.white(`${T}apps/`));
    for (let i = 0; i < info.apps.length; i++) {
      const app = info.apps[i];
      const prefix = i === info.apps.length - 1 ? `${I}${S}${L}` : `${I}${S}${T}`;
      console.log(`${prefix}${chalk.green(app.name)}`);
    }
  }

  // Packages
  if (info.packages.length > 0) {
    // Check if any are under packages/features/
    const rootPkgs = info.packages.filter(
      (p) => !p.dir.includes(`${path.sep}features${path.sep}`),
    );
    const featurePkgs = info.packages.filter((p) =>
      p.dir.includes(`${path.sep}features${path.sep}`),
    );

    console.log(chalk.white(`${T}packages/`));

    // Root-level packages
    for (let i = 0; i < rootPkgs.length; i++) {
      const pkg = rootPkgs[i];
      const isLast = i === rootPkgs.length - 1 && featurePkgs.length === 0;
      const prefix = isLast ? `${I}${S}${L}` : `${I}${S}${T}`;
      const deps = pkg.keyDeps.length > 0
        ? chalk.dim(` [${pkg.keyDeps.join(', ')}]`)
        : '';
      console.log(`${prefix}${chalk.yellow(pkg.name)}${deps}`);
    }

    // Feature packages
    if (featurePkgs.length > 0) {
      console.log(`${I}${S}${T}features/`);
      for (let i = 0; i < featurePkgs.length; i++) {
        const pkg = featurePkgs[i];
        const isLast = i === featurePkgs.length - 1;
        const prefix = isLast ? `${I}${S}${S}${L}` : `${I}${S}${S}${T}`;
        const deps = pkg.keyDeps.length > 0
          ? chalk.dim(` [${pkg.keyDeps.join(', ')}]`)
          : '';
        console.log(`${prefix}${chalk.yellow(pkg.name)}${deps}`);
      }
    }
  }

  // Design system
  if (info.hasDesignSystem) {
    const tiers = info.designSystemTiers.length > 0
      ? chalk.dim(` (${info.designSystemTiers.join(', ')})`)
      : '';
    console.log(`${T}${chalk.magenta('design_system')}${tiers}`);
  }

  // Other root indicators
  const bookDir = path.join(info.root, 'book');
  if (fs.existsSync(bookDir)) {
    console.log(`${T}${chalk.blue('book/')}` + chalk.dim(' (Docusaurus)'));
  }

  if (fs.existsSync(path.join(info.root, 'melos.yaml'))) {
    console.log(`${L}${chalk.gray('melos.yaml')}`);
  }

  console.log(); // trailing newline
}
