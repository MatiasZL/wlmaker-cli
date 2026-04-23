import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { pageTemplate, viewTemplate } from './page-templates.js';

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

export interface PageOptions {
  pagesPath: string;
}

export async function createPage(name: string, options: PageOptions): Promise<void> {
  const pagesPath = path.resolve(options.pagesPath);

  if (!name || name.trim().length === 0) {
    throw new Error('Page name is required.');
  }
  if (!SNAKE_CASE_REGEX.test(name)) {
    throw new Error('Page name must be snake_case (lowercase letters, digits, underscores).');
  }
  if (!fs.existsSync(pagesPath)) {
    throw new Error(`Path does not exist: ${pagesPath}`);
  }

  const packageName = extractPackageName(pagesPath);
  const pageFile = path.join(pagesPath, `${name}_page.dart`);
  const viewsDir = path.join(pagesPath, 'views');
  const viewFile = path.join(viewsDir, `${name}_view.dart`);

  if (fs.existsSync(pageFile)) {
    throw new Error(`Page "${name}" already exists at ${pageFile}`);
  }
  if (fs.existsSync(viewFile)) {
    throw new Error(`View "${name}" already exists at ${viewFile}`);
  }

  fs.mkdirSync(viewsDir, { recursive: true });

  if (!packageName) {
    throw new Error(
      `Could not determine package name from path: ${pagesPath}\n` +
      `Expected path pattern: .../packages/<name>/lib/pages`,
    );
  }

  fs.writeFileSync(pageFile, pageTemplate(name, packageName));
  console.log(chalk.green(`  ✓ Page file created: ${pageFile}`));

  fs.writeFileSync(viewFile, viewTemplate(name));
  console.log(chalk.green(`  ✓ View file created: ${viewFile}`));

  updateViewsBarrel(viewsDir, name);
  updatePagesBarrel(pagesPath, name);
}

function updateViewsBarrel(viewsDir: string, name: string): void {
  const barrelPath = path.join(viewsDir, 'views.dart');
  const exportLine = `export '${name}_view.dart';`;

  let lines: string[] = [];

  if (fs.existsSync(barrelPath)) {
    const content = fs.readFileSync(barrelPath, 'utf8');
    lines = content.split('\n').filter((l) => l.trim().length > 0);
  }

  if (lines.includes(exportLine)) {
    console.log(chalk.blue('  · Export already in views.dart'));
    return;
  }

  lines.push(exportLine);
  lines.sort();
  fs.writeFileSync(barrelPath, lines.join('\n') + '\n');
  console.log(chalk.green('  ✓ views.dart updated'));
}

function updatePagesBarrel(pagesPath: string, name: string): void {
  const barrelPath = path.join(pagesPath, 'pages.dart');
  const pageExport = `export '${name}_page.dart';`;
  const viewsExport = `export 'views/views.dart';`;

  let lines: string[] = [];

  if (fs.existsSync(barrelPath)) {
    const content = fs.readFileSync(barrelPath, 'utf8');
    lines = content.split('\n').filter((l) => l.trim().length > 0);
  }

  let modified = false;

  if (!lines.includes(pageExport)) {
    lines.push(pageExport);
    modified = true;
  }

  if (!lines.includes(viewsExport)) {
    lines.push(viewsExport);
    modified = true;
  }

  if (modified) {
    lines.sort();
    fs.writeFileSync(barrelPath, lines.join('\n') + '\n');
    console.log(chalk.green('  ✓ pages.dart updated'));
  } else {
    console.log(chalk.blue('  · pages.dart already up to date'));
  }
}

function extractPackageName(pagesPath: string): string | null {
  const normalized = pagesPath.replace(/\\/g, '/');
  const match = normalized.match(/\/([^/]+)\/lib\/pages\/?$/);
  return match ? match[1] : null;
}
