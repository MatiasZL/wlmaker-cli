import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { pascalCase } from 'change-case';
import {
  type Tier,
  normalizeTier,
  tierPlural,
  getDefaultPattern,
} from './tier.js';
import { detectDesignSystem } from './design-system-analyzer.js';
import { updateSortedBarrelFile } from './barrel.js';
import {
  atomTemplateA,
  atomTemplateB,
  moleculeTemplateA,
  moleculeTemplateB,
  moleculeTemplateC,
  organismTemplateA,
  organismTemplateB,
  templateA,
} from './widget-templates.js';

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

interface CreateWidgetOptions {
  projectRoot: string;
  pattern?: string;
}

export async function createWidget(
  name: string,
  tierInput: string,
  options: CreateWidgetOptions,
): Promise<void> {
  // Normalize name: strip wl_ prefix if provided
  let cleanName = name;
  if (cleanName.startsWith('wl_')) {
    cleanName = cleanName.slice(3);
  }

  if (!cleanName || !SNAKE_CASE_REGEX.test(cleanName)) {
    throw new Error(
      'Name must be snake_case (lowercase letters, digits, underscores).',
    );
  }

  const tier = normalizeTier(tierInput);
  const plural = tierPlural(tier);
  const pascal = pascalCase(cleanName);
  const fileName = `wl_${cleanName}`;

  // Detect design system
  const ds = detectDesignSystem(options.projectRoot);
  if (!ds) {
    throw new Error(
      'Could not detect design system. Ensure wl_design_system/ directory exists.',
    );
  }

  const tierDir = path.join(ds.componentsDir, plural);
  if (!fs.existsSync(tierDir)) {
    fs.mkdirSync(tierDir, { recursive: true });
  }

  // Determine pattern
  const pattern = options.pattern ?? getDefaultPattern(tier);

  // Verify no collision
  const flatPath = path.join(tierDir, `${fileName}.dart`);
  const subDirPath = path.join(tierDir, fileName);

  if (fs.existsSync(flatPath) || fs.existsSync(subDirPath)) {
    throw new Error(`Widget "${fileName}" already exists in ${plural}/.`);
  }

  // Generate files based on tier + pattern
  switch (tier) {
    case 'atom':
      createAtomFiles(tierDir, cleanName, pascal, fileName, pattern);
      break;
    case 'molecule':
      createMoleculeFiles(tierDir, cleanName, pascal, fileName, pattern);
      break;
    case 'organism':
      createOrganismFiles(tierDir, cleanName, pascal, fileName, pattern);
      break;
    case 'template':
      createTemplateFiles(tierDir, cleanName, pascal, fileName, pattern);
      break;
  }

  // Update barrel
  const barrelFileName = `${plural}.dart`;
  const isSubdirectory =
    (tier === 'molecule' && pattern === 'subdirectory-parts') ||
    (tier === 'molecule' && pattern === 'subdirectory-widgets') ||
    (tier === 'organism' && pattern === 'subdirectory-show');
  const exportLine =
    tier === 'template'
      ? `export '${cleanName}/wl_${cleanName}_template.dart';`
      : isSubdirectory
        ? `export '${fileName}/${fileName}.dart';`
        : `export '${fileName}.dart';`;

  updateSortedBarrelFile(tierDir, barrelFileName, exportLine);

  console.log(chalk.green(`Widget "Wl${pascal}" created in ${plural}/`));
}

function createAtomFiles(
  tierDir: string,
  name: string,
  pascal: string,
  fileName: string,
  pattern: string,
): void {
  switch (pattern) {
    case 'single-public': {
      fs.writeFileSync(
        path.join(tierDir, `${fileName}.dart`),
        atomTemplateA(name, pascal),
      );
      break;
    }
    case 'single-factory': {
      fs.writeFileSync(
        path.join(tierDir, `${fileName}.dart`),
        atomTemplateB(name, pascal),
      );
      break;
    }
    default:
      throw new Error(`Unknown atom pattern: ${pattern}`);
  }
}

function createMoleculeFiles(
  tierDir: string,
  name: string,
  pascal: string,
  fileName: string,
  pattern: string,
): void {
  switch (pattern) {
    case 'single': {
      fs.writeFileSync(
        path.join(tierDir, `${fileName}.dart`),
        moleculeTemplateA(name, pascal),
      );
      break;
    }
    case 'subdirectory-parts': {
      const dir = path.join(tierDir, fileName);
      fs.mkdirSync(dir, { recursive: true });
      const tpl = moleculeTemplateB(name, pascal);
      fs.writeFileSync(path.join(dir, `${fileName}.dart`), tpl.main);
      fs.writeFileSync(
        path.join(dir, `${fileName}_type.dart`),
        tpl.type,
      );
      break;
    }
    case 'subdirectory-widgets': {
      const dir = path.join(tierDir, fileName);
      fs.mkdirSync(dir, { recursive: true});
      fs.mkdirSync(path.join(dir, 'widgets'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'utils'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${fileName}.dart`),
        moleculeTemplateC(name, pascal),
      );
      break;
    }
    default:
      throw new Error(`Unknown molecule pattern: ${pattern}`);
  }
}

function createOrganismFiles(
  tierDir: string,
  name: string,
  pascal: string,
  fileName: string,
  pattern: string,
): void {
  switch (pattern) {
    case 'subdirectory-show': {
      const dir = path.join(tierDir, fileName);
      fs.mkdirSync(dir, { recursive: true });
      const tpl = organismTemplateA(name, pascal);
      fs.writeFileSync(path.join(dir, `${fileName}.dart`), tpl.main);
      fs.writeFileSync(
        path.join(dir, `${fileName}_variant.dart`),
        tpl.variant,
      );
      fs.writeFileSync(path.join(dir, `${fileName}_i18n.dart`), tpl.i18n);
      fs.writeFileSync(
        path.join(dir, `${fileName}_skeleton.dart`),
        tpl.skeleton,
      );
      break;
    }
    case 'single': {
      fs.writeFileSync(
        path.join(tierDir, `${fileName}.dart`),
        organismTemplateB(name, pascal),
      );
      break;
    }
    default:
      throw new Error(`Unknown organism pattern: ${pattern}`);
  }
}

function createTemplateFiles(
  tierDir: string,
  name: string,
  pascal: string,
  fileName: string,
  pattern: string,
): void {
  // Templates always use a subdirectory named after the feature (not wl_ prefixed)
  const dir = path.join(tierDir, name);
  fs.mkdirSync(dir, { recursive: true });

  const tpl = templateA(name, pascal);
  fs.writeFileSync(
    path.join(dir, `wl_${name}_template.dart`),
    tpl.main,
  );
  fs.writeFileSync(
    path.join(dir, `wl_${name}_i18n.dart`),
    tpl.i18n,
  );
  fs.writeFileSync(
    path.join(dir, `wl_${name}_skeleton.dart`),
    tpl.skeleton,
  );
}
