import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { pascalCase, camelCase } from 'change-case';
import {
  entityBoilerplate,
  modelBoilerplate,
  requestModelBoilerplate,
  useCaseTemplate,
  retrofitMethod,
  datasourceMethod,
  repositoryInterfaceMethod,
  repositoryImplMethod,
} from './endpoint-templates.js';
import { injectMethod, injectImport, injectExport } from './dart-injector.js';

export interface EndpointOptions {
  projectRoot: string;

  // HTTP config
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpointPath: string;

  // BFF API file (absolute or relative path)
  bffApiFile: string;

  // UseCase name (snake_case) — also used as entity/model name
  useCaseName: string;
}

export async function createEndpoint(options: EndpointOptions): Promise<void> {
  const lib = path.join(options.projectRoot, 'lib');
  const pascal = pascalCase(options.useCaseName);
  const useCasePascal = pascalCase(options.useCaseName);
  const useCaseSnake = options.useCaseName;
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(options.httpMethod);

  // Extract domain from BFF API file name: bff_{domain}_api.dart
  const domain = extractDomain(options.bffApiFile);

  // Auto-derive paths and class names from domain
  const datasourceFile = path.join(lib, 'data', 'datasources', `${domain}_rest_datasource.dart`);
  const datasourceClassName = `${pascalCase(domain)}RestDataSource`;
  const repositoryInterfaceFile = path.join(lib, 'domain', 'repositories', `${domain}_repository.dart`);
  const repositoryInterfaceName = `${pascalCase(domain)}Repository`;
  const repositoryImplFile = path.join(lib, 'data', 'repositories', `${domain}_repository_data.dart`);
  const repositoryImplClassName = `${pascalCase(domain)}RepositoryData`;
  const feature = domain;

  // Path params extracted from endpoint path
  const pathParams = extractPathParams(options.endpointPath);

  // Build method param list
  const methodParams = buildMethodParams(options, pathParams, needsBody);
  const methodParamsForSignature = methodParams.map((p) => ({ name: p.name, type: p.type }));

  // Response return type
  const returnType = `${pascal}Entity`;
  const repositoryInterfaceSnake = path.basename(repositoryInterfaceFile, '.dart');

  const spinner = (msg: string) => console.log(chalk.cyan(`  → ${msg}`));

  // 1. Generate Entity (boilerplate)
  spinner('Generating entity');
  const entityDir = path.join(lib, 'domain', 'entities', feature, useCaseSnake);
  fs.mkdirSync(entityDir, { recursive: true });
  fs.writeFileSync(
    path.join(entityDir, `${useCaseSnake}_entity.dart`),
    entityBoilerplate(pascal),
  );

  // 2. Generate Model (boilerplate)
  spinner('Generating model');
  const modelDir = path.join(lib, 'data', 'models', feature, useCaseSnake);
  fs.mkdirSync(modelDir, { recursive: true });
  fs.writeFileSync(
    path.join(modelDir, `${useCaseSnake}_model.dart`),
    modelBoilerplate(useCaseSnake, pascal),
  );

  // 3. Generate Request Model (boilerplate, if POST/PUT/PATCH)
  if (needsBody) {
    spinner('Generating request model');
    const reqModelDir = path.join(lib, 'data', 'models', feature, useCaseSnake);
    fs.mkdirSync(reqModelDir, { recursive: true });
    fs.writeFileSync(
      path.join(reqModelDir, `${useCaseSnake}_request_model.dart`),
      requestModelBoilerplate(useCaseSnake, pascal),
    );
  }

  // 4. Inject Retrofit method
  spinner('Injecting Retrofit method');
  const bffPath = path.resolve(options.bffApiFile);
  if (fs.existsSync(bffPath)) {
    const retrofitParams = buildRetrofitParams(options, pathParams, needsBody);
    const retrofitReturnType = `${pascal}Model`;
    const method = retrofitMethod(
      camelCase(options.useCaseName),
      options.endpointPath,
      options.httpMethod,
      retrofitParams,
      retrofitReturnType,
    );
    injectMethod(bffPath, extractClassName(bffPath), method);

    // Inject model import
    const modelImport = `import 'package:${feature}/data/models/${useCaseSnake}/${useCaseSnake}_model.dart';`;
    injectImport(bffPath, modelImport);
  } else {
    console.log(chalk.yellow(`  ⚠ BFF API file not found: ${bffPath}`));
  }

  // 5. Inject datasource method
  spinner('Injecting datasource method');
  const dsPath = path.resolve(datasourceFile);
  if (fs.existsSync(dsPath)) {
    const dsMethod = datasourceMethod(
      camelCase(options.useCaseName),
      returnType,
      methodParamsForSignature,
    );
    injectMethod(dsPath, datasourceClassName, dsMethod);
  } else {
    console.log(chalk.yellow(`  ⚠ Datasource file not found: ${dsPath}`));
  }

  // 6. Inject repository interface method
  spinner('Injecting repository interface method');
  const repoIfacePath = path.resolve(repositoryInterfaceFile);
  if (fs.existsSync(repoIfacePath)) {
    const ifaceMethod = repositoryInterfaceMethod(
      camelCase(options.useCaseName),
      returnType,
      methodParamsForSignature,
    );
    injectMethod(repoIfacePath, repositoryInterfaceName, ifaceMethod);

    // Inject entity import
    const entityImport = `import 'package:${feature}/domain/entities/${useCaseSnake}/${useCaseSnake}_entity.dart';`;
    injectImport(repoIfacePath, entityImport);
  } else {
    console.log(chalk.yellow(`  ⚠ Repository interface not found: ${repoIfacePath}`));
  }

  // 7. Inject repository implementation method
  spinner('Injecting repository implementation method');
  const repoImplPath = path.resolve(repositoryImplFile);
  if (fs.existsSync(repoImplPath)) {
    const dsVarName = camelCase(datasourceClassName);
    const implMethod = repositoryImplMethod(
      camelCase(options.useCaseName),
      returnType,
      methodParamsForSignature,
      dsVarName,
    );
    injectMethod(repoImplPath, repositoryImplClassName, implMethod);
  } else {
    console.log(chalk.yellow(`  ⚠ Repository implementation not found: ${repoImplPath}`));
  }

  // 8. Create UseCase file
  spinner('Generating UseCase');
  const useCaseDir = path.join(lib, 'domain', 'usecases', feature);
  fs.mkdirSync(useCaseDir, { recursive: true });
  fs.writeFileSync(
    path.join(useCaseDir, `${useCaseSnake}_usecase.dart`),
    useCaseTemplate(
      useCaseSnake,
      useCasePascal,
      camelCase(options.useCaseName),
      methodParamsForSignature,
      returnType,
      repositoryInterfaceSnake,
    ),
  );

  // 9. Update barrel file
  spinner('Updating barrel file');
  const barrelPath = path.join(useCaseDir, 'usecases.dart');
  const exportLine = `export '${useCaseSnake}_usecase.dart';`;
  injectExport(barrelPath, exportLine);

  console.log(chalk.green(`\n✓ Endpoint "${options.useCaseName}" generated successfully.`));
}

function extractDomain(bffApiFile: string): string {
  const baseName = path.basename(bffApiFile);
  const match = baseName.match(/^bff_(.+)_api\.dart$/);
  if (match) return match[1];
  // Fallback: use the file name without extension
  return baseName.replace(/\.dart$/, '');
}

function extractPathParams(endpointPath: string): { name: string; type: string }[] {
  const regex = /\{(\w+)\}/g;
  const params: { name: string; type: string }[] = [];
  let match;
  while ((match = regex.exec(endpointPath)) !== null) {
    params.push({ name: match[1], type: 'String' });
  }
  return params;
}

function buildMethodParams(
  options: EndpointOptions,
  pathParams: { name: string; type: string }[],
  hasRequestBody: boolean,
): { name: string; type: string }[] {
  const params: { name: string; type: string }[] = [...pathParams];

  if (hasRequestBody) {
    const reqPascal = pascalCase(options.useCaseName);
    params.push({ name: 'body', type: `${reqPascal}RequestModel` });
  }

  return params;
}

function buildRetrofitParams(
  options: EndpointOptions,
  pathParams: { name: string; type: string }[],
  hasRequestBody: boolean,
): { name: string; type: string; isPath?: boolean; isBody?: boolean; isQuery?: boolean }[] {
  const params: { name: string; type: string; isPath?: boolean; isBody?: boolean; isQuery?: boolean }[] = [];

  for (const pp of pathParams) {
    params.push({ ...pp, isPath: true });
  }

  if (hasRequestBody) {
    const reqPascal = pascalCase(options.useCaseName);
    params.push({ name: 'body', type: `${reqPascal}RequestModel`, isBody: true });
  }

  return params;
}

function extractClassName(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/class\s+(\w+)\s+/);
  if (!match) throw new Error(`No class found in ${filePath}`);
  return match[1];
}
