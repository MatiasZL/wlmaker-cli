import * as fs from 'fs';
import * as path from 'path';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { SNAKE_CASE_REGEX } from '../shared/naming.js';
import { findMonorepoRoot } from '../analyzer/project.js';
import { createPage } from '../generators/page/generator.js';

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

async function askManualPagesPath(): Promise<string | undefined> {
  const customPath = await clack.text({
    message: 'Absolute path to pages directory',
    placeholder: '/path/to/project/lib/pages',
    validate: (v) => {
      if (v === undefined || !v.trim()) return 'Path is required';
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

export async function pageFlow(
  initialName?: string,
  initialPath?: string,
): Promise<void> {
  const name =
    initialName ??
    (await clack.text({
      message: 'Page name (snake_case)',
      placeholder: 'e.g. profile, order_detail',
      validate: (value) => {
        if (value === undefined || !value.trim()) return 'Name is required';
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
            validate: (v) => {
              if (v === undefined || !v.trim()) return 'Path is required';
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
