import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { pascalCase } from 'change-case';
import {
  collaborativePubspec,
  featureDiTemplate,
  blocsModuleTemplate,
  datasourcesModuleTemplate,
  repositoriesModuleTemplate,
  usecasesModuleTemplate,
  emptyBarrelTemplate,
  mainBarrelTemplate,
  collaborativeGitignore,
} from './collaborative-templates.js';
import { resolveWorkspaceVersions } from '../project-analyzer.js';

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

export interface CollaborativeFeatureOptions {
  monorepoRoot: string;
  featureName: string;
  description?: string;
  runBootstrap?: boolean;
}

export async function createCollaborativeFeature(
  options: CollaborativeFeatureOptions,
): Promise<void> {
  const { monorepoRoot, featureName } = options;
  const pascal = pascalCase(featureName);
  const description = options.description ?? `${pascal} collaborative feature`;

  if (!SNAKE_CASE_REGEX.test(featureName)) {
    throw new Error(
      'Feature name must be snake_case (lowercase letters, digits, underscores).',
    );
  }

  const collaborativeDir = path.join(monorepoRoot, 'packages', 'collaborative');
  if (!fs.existsSync(collaborativeDir)) {
    fs.mkdirSync(collaborativeDir, { recursive: true });
  }

  const pkgDir = path.join(collaborativeDir, featureName);
  if (fs.existsSync(pkgDir)) {
    throw new Error(`packages/collaborative/${featureName} already exists`);
  }

  console.log(
    chalk.bold(`\nCreating collaborative feature: ${chalk.cyan(featureName)}\n`),
  );

  // 1. flutter create
  console.log(chalk.cyan(' -> Running flutter create...'));
  execSync(
    `flutter create --template=package packages/collaborative/${featureName}`,
    { cwd: monorepoRoot, stdio: 'pipe' },
  );

  const autoTestFile = path.join(pkgDir, 'test', `${featureName}_test.dart`);
  if (fs.existsSync(autoTestFile)) {
    fs.unlinkSync(autoTestFile);
  }

  console.log(chalk.cyan(' -> Generating feature structure...'));

  const lib = path.join(pkgDir, 'lib');

  // 2. Create directory structure
  const dirs = [
    path.join(lib, 'data', 'api', 'bff'),
    path.join(lib, 'data', 'datasources'),
    path.join(lib, 'data', 'models'),
    path.join(lib, 'data', 'repositories'),
    path.join(lib, 'domain', 'entities'),
    path.join(lib, 'domain', 'repositories'),
    path.join(lib, 'domain', 'usecases'),
    path.join(lib, 'presentation', 'bloc'),
    path.join(lib, 'presentation', 'pages', 'views'),
    path.join(lib, 'di'),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 3. pubspec.yaml
  const workspaceVersions = resolveWorkspaceVersions(monorepoRoot);
  fs.writeFileSync(
    path.join(pkgDir, 'pubspec.yaml'),
    collaborativePubspec(featureName, description, workspaceVersions),
  );

  // 4. gitignore
  fs.writeFileSync(
    path.join(pkgDir, '.gitignore'),
    collaborativeGitignore(),
  );

  // 5. DI files (empty modules)
  const diDir = path.join(lib, 'di');
  fs.writeFileSync(
    path.join(diDir, `${featureName}_di.dart`),
    featureDiTemplate(featureName),
  );
  fs.writeFileSync(
    path.join(diDir, 'blocs_module.dart'),
    blocsModuleTemplate(featureName),
  );
  fs.writeFileSync(
    path.join(diDir, 'datasources_module.dart'),
    datasourcesModuleTemplate(featureName),
  );
  fs.writeFileSync(
    path.join(diDir, 'repositories_module.dart'),
    repositoriesModuleTemplate(featureName),
  );
  fs.writeFileSync(
    path.join(diDir, 'usecases_module.dart'),
    usecasesModuleTemplate(featureName),
  );

  // 6. Empty sub-barrel files
  const barrelPaths = [
    path.join(lib, 'data', 'api', 'bff', 'bff.dart'),
    path.join(lib, 'data', 'datasources', 'datasources.dart'),
    path.join(lib, 'data', 'models', 'models.dart'),
    path.join(lib, 'data', 'repositories', 'repositories.dart'),
    path.join(lib, 'domain', 'entities', 'entities.dart'),
    path.join(lib, 'domain', 'repositories', 'repositories.dart'),
    path.join(lib, 'domain', 'usecases', 'usecases.dart'),
    path.join(lib, 'presentation', 'bloc', 'bloc.dart'),
    path.join(lib, 'presentation', 'pages', 'views', 'views.dart'),
    path.join(lib, 'presentation', 'pages', 'pages.dart'),
  ];

  for (const barrelPath of barrelPaths) {
    fs.writeFileSync(barrelPath, emptyBarrelTemplate());
  }

  // 7. Top-level barrel
  fs.writeFileSync(
    path.join(lib, `${featureName}.dart`),
    mainBarrelTemplate(featureName),
  );

  // 8. melos bootstrap
  if (options.runBootstrap !== false) {
    console.log(chalk.cyan(' -> Running melos bootstrap...'));
    try {
      execSync('melos bootstrap', { cwd: monorepoRoot, stdio: 'pipe' });
      console.log(chalk.green('  melos bootstrap completed'));
    } catch {
      console.log(
        chalk.yellow('  melos bootstrap failed (you may need to run it manually)'),
      );
    }
  }

  console.log(
    chalk.green(`\nFeature "${featureName}" created successfully!`),
  );
  console.log(chalk.gray(`  ${pkgDir}`));
  console.log(chalk.gray(`\n  Next steps:`));
  console.log(chalk.gray(`    wlmaker collaborative endpoint ...`));
  console.log(chalk.gray(`    wlmaker collaborative bloc ...`));
  console.log(chalk.gray(`    wlmaker collaborative page ...`));
}
