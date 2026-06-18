import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

export interface CreatePackageOptions {
  monorepoRoot: string;
  packageName: string;
}

const MAIN_TESTER_CONTENT = `// ignore_for_file: avoid_print

import 'dart:io';

void main() {
  final currentDir = Directory.current;
  final testDir = Directory('\${currentDir.path}/test');

  try {
    final entities = testDir.listSync(recursive: true);
    final testFiles = <String>[];

    print('Finding test files in \${testDir.path}:');
    print('----------------------------------------');

    for (final entity in entities) {
      if (entity is File &&
          entity.path.endsWith('_test.dart') &&
          !entity.path.endsWith('/main_test.dart')) {
        final fullPath = entity.path;
        final relativePath = fullPath.substring(
          testDir.path.length + 1,
        );

        print('Found test file: \$relativePath');
        testFiles.add(relativePath);
      }
    }

    print('----------------------------------------');
    print('Total test files found: \${testFiles.length}');

    final mainTestContent = StringBuffer();

    for (final file in testFiles) {
      final importName = file.replaceAll('/', '_').replaceAll('.dart', '');
      mainTestContent.writeln("import '\$file' as \$importName;");
    }

    mainTestContent.writeln('\\nvoid main() {');

    for (final file in testFiles) {
      final importName = file.replaceAll('/', '_').replaceAll('.dart', '');
      mainTestContent.writeln('  \$importName.main();');
    }

    mainTestContent.writeln('}');

    final mainTestFile = File('\${testDir.path}/main_test.dart')
      ..writeAsStringSync(mainTestContent.toString());

    print('\\nCreated file: \${mainTestFile.path}');
    print('----------------------------------------');
  } on Exception catch (e) {
    print('Error: \$e');
  }
}
`;

function buildPubspecContent(packageName: string): string {
  const description = `${capitalize(packageName.replace(/_/g, ' '))} package`;
  return `name: ${packageName}
description: "${description}"
version: 0.0.1
publish_to: none

environment:
  sdk: ^3.8.1
  flutter: ">=1.17.0"

dependencies:
  core:
  design_system:
  flutter:
    sdk: flutter
  flutter_bloc: ^9.1.1
  freezed_annotation: ^3.1.0
  go_router: ^16.0.0
  localization:

dev_dependencies:
  bloc_test: ^10.0.0
  build_runner: ^2.5.4
  flutter_test:
    sdk: flutter
  freezed: ^3.2.0
  mocktail: ^1.0.4
  very_good_analysis: ^9.0.0

dependency_overrides:
  source_gen: ^4.2.0

flutter:
  uses-material-design: true
`;
}

function buildGitignoreContent(): string {
  return `# Miscellaneous
*.class
*.log
*.pyc
*.swp
.DS_Store
.atom/
.buildlog/
.history
.svn/
migrate_working_dir/

# IntelliJ related
*.iml
*.ipr
*.iws
.idea/

# Flutter/Dart/Pub related
/pubspec.lock
**/doc/api/
.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
build/

coverage/

test/main_test.dart
`;
}

function buildMakefileContent(): string {
  return `.PHONY: test
test:
\tdart test/main_tester.dart
\tdart format test/main_test.dart
\tdart fix --apply test/main_test.dart
\tflutter test --coverage test/main_test.dart
`;
}

function buildAnalysisOptionsContent(): string {
  return `include: ../../analysis_options.yaml
`;
}

function buildBarrelExport(packageName: string): string {
  return `export 'bloc/bloc.dart';
export 'pages/pages.dart';
`;
}

function buildEmptyBarrel(): string {
  return '';
}

function buildGitHubWorkflow(packageName: string): string {
  return `name: packages/${packageName}

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: \${{ github.workflow }}-\${{ github.event.pull_request.number || github.ref }}-${packageName}
  cancel-in-progress: true

on:
  push:
    branches:
      - master
    paths:
      - "packages/${packageName}/**"
      - ".github/workflows/${packageName}.yaml"
      - ".github/workflows/test.yaml"
  pull_request:
    branches:
      - master
    paths:
      - "packages/${packageName}/**"
      - ".github/workflows/${packageName}.yaml"
      - ".github/workflows/test.yaml"

jobs:
  test:
    uses: ./.github/workflows/test.yaml
    with:
      package_name: ${packageName}
      working_directory: packages/${packageName}
`;
}

function capitalize(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function findWorkspaceFile(monorepoRoot: string): string | null {
  const files = fs.readdirSync(monorepoRoot);
  return files.find((f) => f.endsWith('.code-workspace')) ?? null;
}

function updateCodeWorkspace(monorepoRoot: string, packageName: string): void {
  const wsFileName = findWorkspaceFile(monorepoRoot);
  if (!wsFileName) {
    console.log(chalk.yellow('  No .code-workspace file found, skipping'));
    return;
  }

  const wsPath = path.join(monorepoRoot, wsFileName);
  const content = fs.readFileSync(wsPath, 'utf8');

  const folderPath = `packages/${packageName}`;

  if (content.includes(`"path": "${folderPath}"`)) {
    console.log(chalk.yellow(`  Already in ${wsFileName}`));
    return;
  }

  const folderName = `\u{1F4E6} ${packageName}`;
  const newBlock = `    {
      "name": "${folderName}",
      "path": "${folderPath}"
    },`;

  const lines = content.split('\n');

  const foldersLineIdx = lines.findIndex((l) => l.includes('"folders"'));
  if (foldersLineIdx === -1) {
    console.log(chalk.yellow('  No "folders" key found in workspace, skipping'));
    return;
  }

  let foldersOpenBracket = -1;
  for (let j = foldersLineIdx; j < lines.length; j++) {
    if (lines[j].includes('[')) {
      foldersOpenBracket = j;
      break;
    }
  }
  if (foldersOpenBracket === -1) {
    console.log(chalk.yellow('  Could not find folders array, skipping'));
    return;
  }

  let bracketCount = 0;
  let foldersCloseBracket = -1;
  for (let j = foldersOpenBracket; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === '[') bracketCount++;
      else if (ch === ']') {
        bracketCount--;
        if (bracketCount === 0) {
          foldersCloseBracket = j;
          break;
        }
      }
    }
    if (foldersCloseBracket !== -1) break;
  }
  if (foldersCloseBracket === -1) {
    console.log(chalk.yellow('  Could not find folders array end, skipping'));
    return;
  }

  let widgetbookBlockStart = -1;
  let idx = foldersOpenBracket + 1;
  while (idx <= foldersCloseBracket) {
    const trimmed = lines[idx].trim();
    if (trimmed === '{' || trimmed.startsWith('{')) {
      let braceCount = 0;
      let blockEnd = -1;
      for (let j = idx; j <= foldersCloseBracket; j++) {
        for (const ch of lines[j]) {
          if (ch === '{') braceCount++;
          else if (ch === '}') {
            braceCount--;
            if (braceCount === 0) {
              blockEnd = j;
              break;
            }
          }
        }
        if (blockEnd !== -1) break;
      }

      if (blockEnd !== -1) {
        const blockText = lines.slice(idx, blockEnd + 1).join('\n');
        if (blockText.includes('widgetbook')) {
          widgetbookBlockStart = idx;
          break;
        }
        idx = blockEnd + 1;
        continue;
      }
    }
    idx++;
  }

  if (widgetbookBlockStart === -1) {
    console.log(chalk.yellow('  No widgetbook entry found in workspace, skipping'));
    return;
  }

  lines.splice(widgetbookBlockStart, 0, newBlock);

  fs.writeFileSync(wsPath, lines.join('\n'));
  console.log(chalk.green(`  Updated ${wsFileName}`));
}

function updateHelixConfig(monorepoRoot: string, packageName: string): void {
  const helixPath = path.join(monorepoRoot, '.helix', 'languages.toml');
  if (!fs.existsSync(helixPath)) {
    console.log(chalk.yellow('  No .helix/languages.toml found, skipping'));
    return;
  }

  let content = fs.readFileSync(helixPath, 'utf8');

  const entry = `{ path = "packages/${packageName}" }`;
  if (content.includes(entry)) {
    console.log(chalk.yellow('  Already in .helix/languages.toml'));
    return;
  }

  const workspaceLineRegex = /^\s*\{\s*path\s*=\s*"packages\//;
  const lines = content.split('\n');
  let lastPackageLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (workspaceLineRegex.test(lines[i])) {
      lastPackageLineIdx = i;
    }
  }

  if (lastPackageLineIdx === -1) {
    const closingBracketIdx = lines.findIndex((l) => l.trim() === ']');
    if (closingBracketIdx === -1) {
      console.log(chalk.yellow('  Could not parse .helix/languages.toml'));
      return;
    }
    lines.splice(closingBracketIdx, 0, `  { path = "packages/${packageName}" },`);
  } else {
    const allPackageEntries: { lineIdx: number; entry: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*\{\s*path\s*=\s*"packages\/([^"]+)"\s*\}/);
      if (m) {
        allPackageEntries.push({ lineIdx: i, entry: m[1] });
      }
    }

    allPackageEntries.push({ lineIdx: -1, entry: packageName });
    allPackageEntries.sort((a, b) => a.entry.localeCompare(b.entry));

    const insertIdx = allPackageEntries.findIndex((e) => e.entry === packageName);
    let targetLine: number;

    if (insertIdx === 0) {
      const firstLine = lines.findIndex((l) => workspaceLineRegex.test(l));
      targetLine = firstLine;
    } else {
      const prevEntry = allPackageEntries[insertIdx - 1];
      targetLine = prevEntry.lineIdx + 1;
    }

    lines.splice(targetLine, 0, `  { path = "packages/${packageName}" },`);
  }

  fs.writeFileSync(helixPath, lines.join('\n'));
  console.log(chalk.green('  Updated .helix/languages.toml'));
}

export async function createPackage(options: CreatePackageOptions): Promise<void> {
  const { monorepoRoot, packageName } = options;
  const pkgDir = path.join(monorepoRoot, 'packages', packageName);

  if (fs.existsSync(pkgDir)) {
    throw new Error(`packages/${packageName} already exists`);
  }

  console.log(chalk.bold(`\nCreating package: ${chalk.cyan(packageName)}\n`));

  console.log(chalk.cyan(' → Running flutter create...'));
  execSync(`flutter create -t package packages/${packageName}`, {
    cwd: monorepoRoot,
    stdio: 'pipe',
  });

  const autoTestFile = path.join(pkgDir, 'test', `${packageName}_test.dart`);
  if (fs.existsSync(autoTestFile)) {
    fs.unlinkSync(autoTestFile);
  }

  console.log(chalk.cyan(' → Customizing package files...'));

  fs.writeFileSync(
    path.join(pkgDir, 'pubspec.yaml'),
    buildPubspecContent(packageName),
  );

  fs.writeFileSync(
    path.join(pkgDir, '.gitignore'),
    buildGitignoreContent(),
  );

  fs.writeFileSync(
    path.join(pkgDir, 'analysis_options.yaml'),
    buildAnalysisOptionsContent(),
  );

  fs.writeFileSync(
    path.join(pkgDir, 'Makefile'),
    buildMakefileContent(),
  );

  const libDir = path.join(pkgDir, 'lib');
  fs.writeFileSync(
    path.join(libDir, `${packageName}.dart`),
    buildBarrelExport(packageName),
  );

  fs.mkdirSync(path.join(libDir, 'bloc'), { recursive: true });
  fs.writeFileSync(
    path.join(libDir, 'bloc', 'bloc.dart'),
    buildEmptyBarrel(),
  );

  fs.mkdirSync(path.join(libDir, 'pages'), { recursive: true });
  fs.writeFileSync(
    path.join(libDir, 'pages', 'pages.dart'),
    buildEmptyBarrel(),
  );

  const testDir = path.join(pkgDir, 'test');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(testDir, 'main_tester.dart'),
    MAIN_TESTER_CONTENT,
  );

  console.log(chalk.cyan(' → Updating workspace configuration...'));

  updateCodeWorkspace(monorepoRoot, packageName);
  updateHelixConfig(monorepoRoot, packageName);

  console.log(chalk.cyan(' → Creating GitHub Actions workflow...'));

  const workflowsDir = path.join(monorepoRoot, '.github', 'workflows');
  if (fs.existsSync(workflowsDir)) {
    fs.writeFileSync(
      path.join(workflowsDir, `${packageName}.yaml`),
      buildGitHubWorkflow(packageName),
    );
    console.log(chalk.green(`  Created .github/workflows/${packageName}.yaml`));
  } else {
    console.log(chalk.yellow('  No .github/workflows/ directory found, skipping CI workflow'));
  }

  console.log(chalk.cyan(' → Running melos bootstrap...'));
  try {
    execSync('melos bootstrap', { cwd: monorepoRoot, stdio: 'pipe' });
    console.log(chalk.green('  melos bootstrap completed'));
  } catch {
    console.log(chalk.yellow('  melos bootstrap failed (you may need to run it manually)'));
  }

  console.log(chalk.green(`\nPackage "${packageName}" created successfully!`));
  console.log(chalk.gray(`  ${pkgDir}`));
}
