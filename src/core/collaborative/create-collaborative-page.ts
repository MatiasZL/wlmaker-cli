import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { pascalCase } from 'change-case';
import {
  collaborativePageTemplate,
  collaborativeViewTemplate,
} from './collaborative-templates.js';
import { injectExport } from '../dart-injector.js';

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

export interface CollaborativePageOptions {
  featurePath: string;
  pageName: string;
}

export async function createCollaborativePage(
  options: CollaborativePageOptions,
): Promise<void> {
  const { featurePath, pageName } = options;
  const pascal = pascalCase(pageName);

  if (!SNAKE_CASE_REGEX.test(pageName)) {
    throw new Error(
      'Page name must be snake_case (lowercase letters, digits, underscores).',
    );
  }

  const lib = path.join(featurePath, 'lib');
  const pagesDir = path.join(lib, 'presentation', 'pages');
  const viewsDir = path.join(pagesDir, 'views');

  if (!fs.existsSync(pagesDir)) {
    throw new Error(
      `Not a collaborative feature structure. Missing: ${pagesDir}`,
    );
  }

  fs.mkdirSync(viewsDir, { recursive: true });

  const pageFile = path.join(pagesDir, `${pageName}_page.dart`);
  const viewFile = path.join(viewsDir, `${pageName}_view.dart`);

  if (fs.existsSync(pageFile)) {
    throw new Error(`Page "${pageName}" already exists at ${pageFile}`);
  }

  const featureName = extractFeatureName(featurePath);

  fs.writeFileSync(
    pageFile,
    collaborativePageTemplate(pageName, pascal),
  );
  console.log(chalk.green(`  Page created: ${pageFile}`));

  fs.writeFileSync(viewFile, collaborativeViewTemplate(pascal));
  console.log(chalk.green(`  View created: ${viewFile}`));

  // Update barrel files
  if (featureName) {
    const viewsBarrel = path.join(viewsDir, 'views.dart');
    injectExport(viewsBarrel, `export '${pageName}_view.dart';`);

    const pagesBarrel = path.join(pagesDir, 'pages.dart');
    injectExport(pagesBarrel, `export '${pageName}_page.dart';`);
    injectExport(pagesBarrel, `export 'views/views.dart';`);

    // Update main barrel
    const mainBarrel = path.join(lib, `${featureName}.dart`);
    if (fs.existsSync(mainBarrel)) {
      const content = fs.readFileSync(mainBarrel, 'utf8');
      if (!content.includes(`export 'presentation/pages/${pageName}_page.dart';`)) {
        injectExport(
          mainBarrel,
          `export 'presentation/pages/${pageName}_page.dart';`,
        );
      }
      if (!content.includes(`export 'presentation/pages/views/${pageName}_view.dart';`)) {
        injectExport(
          mainBarrel,
          `export 'presentation/pages/views/${pageName}_view.dart';`,
        );
      }
    }
  }
}

function extractFeatureName(featurePath: string): string | null {
  const normalized = featurePath.replace(/\\/g, '/');
  const match = normalized.match(/\/([^/]+)\/lib\/?$/);
  if (match) return match[1];
  // If path is the feature root itself
  return path.basename(featurePath);
}
