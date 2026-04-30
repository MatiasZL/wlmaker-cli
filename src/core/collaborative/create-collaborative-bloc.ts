import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { pascalCase } from 'change-case';
import {
  collaborativeBlocTemplate,
  collaborativeBlocEventTemplate,
  collaborativeBlocStateTemplate,
  blocRegistrationSnippet,
} from './collaborative-templates.js';
import { injectMethod } from '../dart-injector.js';

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

export interface CollaborativeBlocOptions {
  featurePath: string;
  blocName: string;
}

export async function createCollaborativeBloc(
  options: CollaborativeBlocOptions,
): Promise<void> {
  const { featurePath, blocName } = options;
  const pascal = pascalCase(blocName);

  if (!SNAKE_CASE_REGEX.test(blocName)) {
    throw new Error(
      'BLoC name must be snake_case (lowercase letters, digits, underscores).',
    );
  }

  const lib = path.join(featurePath, 'lib');
  const blocDir = path.join(lib, 'presentation', 'bloc');

  if (!fs.existsSync(blocDir)) {
    throw new Error(
      `Not a collaborative feature structure. Missing: ${blocDir}`,
    );
  }

  const blocFile = path.join(blocDir, `${blocName}_bloc.dart`);
  if (fs.existsSync(blocFile)) {
    throw new Error(`BLoC "${blocName}" already exists at ${blocFile}`);
  }

  fs.writeFileSync(
    blocFile,
    collaborativeBlocTemplate(blocName, pascal),
  );
  console.log(chalk.green(`  BLoC created: ${blocFile}`));

  fs.writeFileSync(
    path.join(blocDir, `${blocName}_event.dart`),
    collaborativeBlocEventTemplate(blocName, pascal),
  );

  fs.writeFileSync(
    path.join(blocDir, `${blocName}_state.dart`),
    collaborativeBlocStateTemplate(blocName, pascal),
  );
  console.log(chalk.green(`  Event + State files created`));

  // Update barrel
  const barrelPath = path.join(blocDir, 'bloc.dart');
  const exportLine = `export '${blocName}_bloc.dart';`;
  if (fs.existsSync(barrelPath)) {
    const content = fs.readFileSync(barrelPath, 'utf8');
    if (!content.includes(exportLine)) {
      fs.writeFileSync(barrelPath, content.trimEnd() + '\n' + exportLine + '\n');
    }
  } else {
    fs.writeFileSync(barrelPath, exportLine + '\n');
  }

  // Register in BlocsModule
  const featureName = path.basename(featurePath);
  const diDir = path.join(lib, 'di');
  const blocsModulePath = path.join(diDir, 'blocs_module.dart');

  if (fs.existsSync(blocsModulePath)) {
    const snippet = blocRegistrationSnippet(blocName, pascal);
    const importLine = `import 'package:${featureName}/presentation/bloc/${blocName}_bloc.dart';`;

    const content = fs.readFileSync(blocsModulePath, 'utf8');
    if (!content.includes(importLine)) {
      // Add import after existing imports
      const importRegex = /^import\s+[^;]+;/gm;
      const imports = [...content.matchAll(importRegex)];
      if (imports.length > 0) {
        const lastImport = imports[imports.length - 1];
        const insertPos = lastImport.index! + lastImport[0].length;
        const newContent =
          content.slice(0, insertPos) +
          '\n' +
          importLine +
          content.slice(insertPos);
        fs.writeFileSync(blocsModulePath, newContent);
      }
    }

    injectMethod(blocsModulePath, 'BlocsModule', snippet);
    console.log(chalk.green('  Registered in BlocsModule'));
  }
}
