import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { pascalCase, camelCase } from 'change-case';
import { injectExport, injectImport, injectMethod } from '../dart-injector.js';

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

export interface CollaborativeEndpointOptions {
  featurePath: string;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpointPath: string;
  useCaseName: string;
  featureName: string;
}

export async function createCollaborativeEndpoint(
  options: CollaborativeEndpointOptions,
): Promise<void> {
  const { featurePath, featureName } = options;
  const pascal = pascalCase(options.useCaseName);
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(options.httpMethod);
  const pathParams = extractPathParams(options.endpointPath);

  const lib = path.join(featurePath, 'lib');

  if (!fs.existsSync(lib)) {
    throw new Error(`Feature path does not exist: ${featurePath}`);
  }

  if (!SNAKE_CASE_REGEX.test(options.useCaseName)) {
    throw new Error('UseCase name must be snake_case.');
  }

  console.log(chalk.cyan(' -> Generating endpoint stack...'));

  // 1. Entity
  const entityDir = path.join(lib, 'domain', 'entities');
  fs.mkdirSync(entityDir, { recursive: true });
  fs.writeFileSync(
    path.join(entityDir, `${options.useCaseName}_entity.dart`),
    entityTemplate(pascal),
  );
  console.log(chalk.green('  Entity created'));

  // 2. Model
  const modelDir = path.join(lib, 'data', 'models');
  fs.mkdirSync(modelDir, { recursive: true });
  fs.writeFileSync(
    path.join(modelDir, `${options.useCaseName}_model.dart`),
    modelTemplate(options.useCaseName, pascal, featureName),
  );
  console.log(chalk.green('  Model created'));

  // 3. Request Model (if needed)
  if (needsBody) {
    fs.writeFileSync(
      path.join(modelDir, `${options.useCaseName}_request_model.dart`),
      requestModelTemplate(options.useCaseName, pascal),
    );
    console.log(chalk.green('  Request Model created'));
  }

  // 4. Inject BFF API method
  const bffDir = path.join(lib, 'data', 'api', 'bff');
  fs.mkdirSync(bffDir, { recursive: true });

  const domain = featureName.replace(/^feature_/, '');
  const bffApiFile = path.join(bffDir, `bff_${domain}_api.dart`);
  const bffApiClass = `Bff${pascalCase(domain)}Api`;

  if (fs.existsSync(bffApiFile)) {
    const method = bffApiMethodSnippet(
      camelCase(options.useCaseName),
      options.endpointPath,
      options.httpMethod,
      pathParams,
      needsBody,
      `${pascal}Model`,
    );
    injectMethod(bffApiFile, bffApiClass, method);
    console.log(chalk.green('  BFF API method injected'));
  } else {
    // Create BFF API file
    fs.writeFileSync(bffApiFile, newBffApiTemplate(domain, bffApiClass));
    const method = bffApiMethodSnippet(
      camelCase(options.useCaseName),
      options.endpointPath,
      options.httpMethod,
      pathParams,
      needsBody,
      `${pascal}Model`,
    );
    injectMethod(bffApiFile, bffApiClass, method);
    console.log(chalk.green('  BFF API file created with method'));
  }

  // 5. Inject datasource method
  const datasourceFile = path.join(
    lib,
    'data',
    'datasources',
    `${featureName}_datasource_fake.dart`,
  );
  const dsClass = `${pascalCase(featureName)}DatasourceFake`;
  if (fs.existsSync(datasourceFile)) {
    const dsMethod = datasourceMethodSnippet(
      camelCase(options.useCaseName),
      `${pascal}Model`,
      pathParams,
    );
    injectMethod(datasourceFile, dsClass, dsMethod);
    console.log(chalk.green('  Datasource method injected'));
  }

  // 6. Repository interface method
  const repoInterfaceFile = path.join(
    lib,
    'domain',
    'repositories',
    `${featureName}_repository.dart`,
  );
  const repoInterface = `${pascalCase(featureName)}Repository`;
  if (fs.existsSync(repoInterfaceFile)) {
    const ifaceMethod = repositoryInterfaceMethodSnippet(
      camelCase(options.useCaseName),
      `${pascal}Entity`,
      pathParams,
    );
    injectMethod(repoInterfaceFile, repoInterface, ifaceMethod);
    console.log(chalk.green('  Repository interface method injected'));
  }

  // 7. Repository implementation method
  const repoImplFile = path.join(
    lib,
    'data',
    'repositories',
    `${featureName}_repository_data.dart`,
  );
  const repoImpl = `${pascalCase(featureName)}RepositoryData`;
  if (fs.existsSync(repoImplFile)) {
    const implMethod = repositoryImplMethodSnippet(
      camelCase(options.useCaseName),
      `${pascal}Entity`,
      `${pascal}Model`,
      pathParams,
      camelCase(dsClass),
    );
    injectMethod(repoImplFile, repoImpl, implMethod);
    console.log(chalk.green('  Repository impl method injected'));
  }

  // 8. UseCase
  const useCaseDir = path.join(lib, 'domain', 'usecases');
  fs.mkdirSync(useCaseDir, { recursive: true });
  fs.writeFileSync(
    path.join(useCaseDir, `${options.useCaseName}_usecase.dart`),
    useCaseTemplate(
      options.useCaseName,
      pascal,
      featureName,
      pathParams,
      repoInterface,
    ),
  );
  console.log(chalk.green('  UseCase created'));

  // 9. Update barrels
  updateBarrels(lib, options.useCaseName, needsBody, domain);

  // 10. Register in DI modules
  registerEndpointDi(lib, featureName, pascal, pathParams);

  // 11. build_runner
  console.log(chalk.cyan(' -> Running build_runner...'));
  try {
    execSync(
      'dart run build_runner build --delete-conflicting-outputs',
      { cwd: featurePath, stdio: 'pipe' },
    );
    console.log(chalk.green('  build_runner completed'));
  } catch {
    console.log(
      chalk.yellow('  build_runner failed (you may need to run it manually)'),
    );
  }

  console.log(
    chalk.green(`\nEndpoint "${options.useCaseName}" generated successfully.`),
  );
}

// ============================================================
// TEMPLATES
// ============================================================

function entityTemplate(pascal: string): string {
  return `import 'package:equatable/equatable.dart';

class ${pascal}Entity extends Equatable {
  const ${pascal}Entity();

  @override
  List<Object?> get props => [];
}
`;
}

function modelTemplate(
  useCaseName: string,
  pascal: string,
  featureName: string,
): string {
  return `import 'package:json_annotation/json_annotation.dart';
import 'package:${featureName}/domain/entities/${useCaseName}_entity.dart';

part '${useCaseName}_model.g.dart';

@JsonSerializable()
class ${pascal}Model {
  const ${pascal}Model();

  factory ${pascal}Model.fromJson(Map<String, dynamic> json) =>
      _\$${pascal}ModelFromJson(json);

  Map<String, dynamic> toJson() => _\$${pascal}ModelToJson(this);

  ${pascal}Entity toEntity() {
    // TODO: implement toEntity
    throw UnimplementedError();
  }
}
`;
}

function requestModelTemplate(
  useCaseName: string,
  pascal: string,
): string {
  return `import 'package:json_annotation/json_annotation.dart';

part '${useCaseName}_request_model.g.dart';

@JsonSerializable()
class ${pascal}RequestModel {
  const ${pascal}RequestModel();

  factory ${pascal}RequestModel.fromJson(Map<String, dynamic> json) =>
      _\$${pascal}RequestModelFromJson(json);

  Map<String, dynamic> toJson() => _\$${pascal}RequestModelToJson(this);
}
`;
}

function newBffApiTemplate(domain: string, className: string): string {
  return `import 'package:dio/dio.dart';

class ${className} {
  ${className}(this._dio, {String? baseUrl}) : _baseUrl = baseUrl;

  final Dio _dio;
  final String? _baseUrl;
}
`;
}

function bffApiMethodSnippet(
  methodName: string,
  endpointPath: string,
  httpMethod: string,
  pathParams: { name: string; type: string }[],
  hasBody: boolean,
  returnType: string,
): string {
  const paramList = pathParams.map((p) => `${p.type} ${p.name}`).join(', ');
  const bodyParam = hasBody ? `, Object? body` : '';
  const allParams = paramList ? `${paramList}${bodyParam}` : (hasBody ? 'Object? body' : '');

  let pathInterpolated = endpointPath;
  for (const p of pathParams) {
    pathInterpolated = pathInterpolated.replace(`{${p.name}}`, `\${${p.name}}`);
  }

  const pathArg = pathInterpolated.includes('$') ? `'${pathInterpolated}'` : `'${endpointPath}'`;

  const dioMethod = httpMethod.toLowerCase();

  return `Future<${returnType}> ${methodName}(${allParams}) async {
    final response = await _dio.${dioMethod}(
      ${pathArg},
      ${hasBody ? 'data: body,\n' : ''}    );
    // TODO: parse response to ${returnType}
    throw UnimplementedError();
  }`;
}

function datasourceMethodSnippet(
  methodName: string,
  returnType: string,
  params: { name: string; type: string }[],
): string {
  const paramList = params.map((p) => `${p.type} ${p.name}`).join(', ');
  return `Future<${returnType}> ${methodName}(${paramList}) async {
    // TODO: implement ${methodName}
    throw UnimplementedError();
  }`;
}

function repositoryInterfaceMethodSnippet(
  methodName: string,
  returnType: string,
  params: { name: string; type: string }[],
): string {
  const paramList = params.map((p) => `${p.type} ${p.name}`).join(', ');
  return `Future<${returnType}> ${methodName}(${paramList});`;
}

function repositoryImplMethodSnippet(
  methodName: string,
  returnType: string,
  modelType: string,
  params: { name: string; type: string }[],
  datasourceVar: string,
): string {
  const paramList = params.map((p) => `${p.type} ${p.name}`).join(', ');
  const args = params.map((p) => p.name).join(', ');
  return `@override
  Future<${returnType}> ${methodName}(${paramList}) async {
    final model = await _datasource.${methodName}(${args});
    return model.toEntity();
  }`;
}

function useCaseTemplate(
  useCaseName: string,
  pascal: string,
  featureName: string,
  params: { name: string; type: string }[],
  repoInterface: string,
): string {
  const hasParams = params.length > 0;
  const paramsClass = hasParams
    ? `
  class Params {
    const Params({${params.map((p) => `required this.${p.name}`).join(', ')}});
${params.map((p) => `    final ${p.type} ${p.name};`).join('\n')}
  }
`
    : '';

  const callParams = hasParams ? 'Params params' : '';
  const args = hasParams
    ? params.map((p) => `params.${p.name}`).join(', ')
    : '';

  return `import 'package:${featureName}/domain/repositories/${featureName.replace(/^feature_/, '')}_repository.dart';

class ${pascal}UseCase {
  ${pascal}UseCase(this._repository);

  final ${repoInterface} _repository;
${paramsClass}
  Future<${pascal}Entity> call(${callParams}) async {
    return _repository.${camelCase(useCaseName)}(${args});
  }
}
`;
}

// ============================================================
// BARREL UPDATES
// ============================================================

function updateBarrels(
  lib: string,
  useCaseName: string,
  needsBody: boolean,
  domain: string,
): void {
  // Entities barrel
  injectExport(
    path.join(lib, 'domain', 'entities', 'entities.dart'),
    `export '${useCaseName}_entity.dart';`,
  );

  // Models barrel
  const modelsBarrel = path.join(lib, 'data', 'models', 'models.dart');
  injectExport(modelsBarrel, `export '${useCaseName}_model.dart';`);
  if (needsBody) {
    injectExport(modelsBarrel, `export '${useCaseName}_request_model.dart';`);
  }

  // BFF barrel
  injectExport(
    path.join(lib, 'data', 'api', 'bff', 'bff.dart'),
    `export 'bff_${domain}_api.dart';`,
  );

  // UseCases barrel
  injectExport(
    path.join(lib, 'domain', 'usecases', 'usecases.dart'),
    `export '${useCaseName}_usecase.dart';`,
  );
}

// ============================================================
// DI REGISTRATION
// ============================================================

function registerEndpointDi(
  lib: string,
  featureName: string,
  pascal: string,
  params: { name: string; type: string }[],
): void {
  const diDir = path.join(lib, 'di');
  const featurePascal = pascalCase(featureName);

  // UseCasesModule
  const ucModulePath = path.join(diDir, 'usecases_module.dart');
  if (fs.existsSync(ucModulePath)) {
    const useCaseClass = `${pascal}UseCase`;
    const useCaseVar = camelCase(useCaseClass);
    const repoInterface = `${featurePascal}Repository`;

    const snippet = `  @lazySingleton
  ${useCaseClass} ${useCaseVar}(${repoInterface} repository) =>
      ${useCaseClass}(repository);`;

    const importLine = `import 'package:${featureName}/domain/usecases/${camelCase(pascal)}_usecase.dart';`;

    const content = fs.readFileSync(ucModulePath, 'utf8');
    if (!content.includes(useCaseClass)) {
      if (!content.includes(importLine)) {
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
          fs.writeFileSync(ucModulePath, newContent);
        }
      }
      injectMethod(ucModulePath, 'UseCasesModule', snippet);
      console.log(chalk.green('  Registered in UseCasesModule'));
    }
  }
}

// ============================================================
// HELPERS
// ============================================================

function extractPathParams(
  endpointPath: string,
): { name: string; type: string }[] {
  const regex = /\{(\w+)\}/g;
  const params: { name: string; type: string }[] = [];
  let match;
  while ((match = regex.exec(endpointPath)) !== null) {
    params.push({ name: match[1], type: 'String' });
  }
  return params;
}
