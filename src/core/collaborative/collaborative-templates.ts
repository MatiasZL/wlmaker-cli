import { camelCase, pascalCase } from 'change-case';
import type { WorkspaceDependencyVersions } from '../project-analyzer.js';

const COLLABORATIVE_DEPS = [
  'app_base',
  'dio',
  'equatable',
  'flutter_bloc',
  'freezed_annotation',
  'get_it',
  'go_router',
  'injectable',
  'json_annotation',
];

const COLLABORATIVE_DEV_DEPS = [
  'build_runner',
  'freezed',
  'injectable_generator',
  'json_serializable',
  'very_good_analysis',
];

const COLLABORATIVE_OVERRIDE_EXCLUDE = new Set([
  'analyzer',
  'dart_style',
  'build_runner',
  'source_gen',
]);

// ============================================================
// PUBSPEC
// ============================================================

export function collaborativePubspec(
  featureName: string,
  description: string,
  versions: WorkspaceDependencyVersions,
): string {
  const depLines: string[] = ['  app_base:'];
  for (const dep of COLLABORATIVE_DEPS) {
    if (dep === 'app_base') continue;
    const version = versions.dependencies[dep] ?? versions.devDependencies[dep];
    if (version) {
      depLines.push(`  ${dep}: ${version}`);
    }
  }

  const devDepLines: string[] = [
    '  flutter_test:',
    '    sdk: flutter',
  ];
  for (const dep of COLLABORATIVE_DEV_DEPS) {
    const version = versions.devDependencies[dep] ?? versions.dependencies[dep];
    if (version) {
      devDepLines.push(`  ${dep}: ${version}`);
    }
  }

  const overrideLines: string[] = [];
  for (const [name, version] of Object.entries(versions.dependencyOverrides)) {
    if (!COLLABORATIVE_OVERRIDE_EXCLUDE.has(name)) {
      overrideLines.push(`  ${name}: ${version}`);
    }
  }

  const overridesSection =
    overrideLines.length > 0
      ? `\ndependency_overrides:\n${overrideLines.join('\n')}\n`
      : '';

  return `name: ${featureName}
description: "${description}"
version: 0.0.1
publish_to: none

environment:
  sdk: ^3.8.1
  flutter: ">=1.17.0"

dependencies:
  flutter:
    sdk: flutter
${depLines.join('\n')}

dev_dependencies:
${devDepLines.join('\n')}
${overridesSection}
flutter:
  uses-material-design: true
`;
}

// ============================================================
// DI FILES
// ============================================================

export function featureDiTemplate(featureName: string): string {
  const pascal = pascalCase(featureName);
  return `import 'package:injectable/injectable.dart';

@InjectableInit.microPackage()
void init${pascal}Package() {}
`;
}

export function blocsModuleTemplate(featureName: string): string {
  return `import 'package:injectable/injectable.dart';

@module
abstract class BlocsModule {}
`;
}

export function datasourcesModuleTemplate(featureName: string): string {
  return `import 'package:injectable/injectable.dart';

@module
abstract class DatasourcesModule {}
`;
}

export function repositoriesModuleTemplate(featureName: string): string {
  return `import 'package:injectable/injectable.dart';

@module
abstract class RepositoriesModule {}
`;
}

export function usecasesModuleTemplate(featureName: string): string {
  return `import 'package:injectable/injectable.dart';

@module
abstract class UseCasesModule {}
`;
}

// ============================================================
// BLOC (Freezed sealed classes)
// ============================================================

export function collaborativeBlocTemplate(
  featureName: string,
  pascal: string,
): string {
  return `import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part '${featureName}_bloc.freezed.dart';
part '${featureName}_event.dart';
part '${featureName}_state.dart';

class ${pascal}Bloc extends Bloc<${pascal}Event, ${pascal}State> {
  ${pascal}Bloc() : super(const ${pascal}State.initial()) {
    on<_Started>(_onStarted);
  }

  Future<void> _onStarted(
    _Started event,
    Emitter<${pascal}State> emit,
  ) async {
    emit(const ${pascal}State.loading());
  }
}
`;
}

export function collaborativeBlocEventTemplate(
  featureName: string,
  pascal: string,
): string {
  return `part of '${featureName}_bloc.dart';

@freezed
sealed class ${pascal}Event with _\$${pascal}Event {
  const factory ${pascal}Event.started() = _Started;
}
`;
}

export function collaborativeBlocStateTemplate(
  featureName: string,
  pascal: string,
): string {
  return `part of '${featureName}_bloc.dart';

@freezed
sealed class ${pascal}State with _\$${pascal}State {
  const factory ${pascal}State.initial() = _Initial;
  const factory ${pascal}State.loading() = _Loading;
  const factory ${pascal}State.error(String message) = _Error;
}
`;
}

// ============================================================
// PAGE (GoRoute)
// ============================================================

export function collaborativePageTemplate(
  featureName: string,
  pascal: string,
): string {
  const routePath = '/' + featureName.replace(/^feature_/, '');
  return `import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:${featureName}/presentation/pages/views/views.dart';

class ${pascal}Page extends GoRoute {
  ${pascal}Page({super.name, super.routes})
      : super(
          path: fullPath,
          pageBuilder: (context, state) =>
              const MaterialPage(child: ${pascal}View()),
        );

  static const fullPath = '${routePath}';

  static void open(BuildContext context) => context.go(fullPath);
}
`;
}

// ============================================================
// VIEW
// ============================================================

export function collaborativeViewTemplate(pascal: string): string {
  return `import 'package:flutter/material.dart';

class ${pascal}View extends StatelessWidget {
  const ${pascal}View({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: const Center(child: Text('${pascal}')),
    );
  }
}
`;
}

// ============================================================
// BARREL FILES
// ============================================================

export function emptyBarrelTemplate(): string {
  return '';
}

export function mainBarrelTemplate(featureName: string): string {
  return `export 'data/api/bff/bff.dart';
export 'data/datasources/datasources.dart';
export 'data/models/models.dart';
export 'data/repositories/repositories.dart';
export 'domain/entities/entities.dart';
export 'domain/repositories/repositories.dart';
export 'domain/usecases/usecases.dart';
export 'presentation/bloc/bloc.dart';
export 'presentation/pages/pages.dart';
export 'presentation/pages/views/views.dart';
export 'di/${featureName}_di.dart';
`;
}

// ============================================================
// GITIGNORE
// ============================================================

export function collaborativeGitignore(): string {
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
`;
}

// ============================================================
// INJECTABLE MODULE REGISTRATION SNIPPETS
// ============================================================

export function blocRegistrationSnippet(
  featureName: string,
  pascal: string,
): string {
  const blocClass = `${pascal}Bloc`;
  const blocVar = camelCase(blocClass);
  return `  @injectable
  ${blocClass} ${blocVar}() => ${blocClass}();`;
}
