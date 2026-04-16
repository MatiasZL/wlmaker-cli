import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { pascalCase, camelCase } from 'change-case';
import { type DartField, jsonToFields } from './json-to-dart.js';
import {
  entityTemplate,
  modelTemplate,
  requestModelTemplate,
  useCaseTemplate,
  retrofitMethod,
  datasourceMethod,
  repositoryInterfaceMethod,
  repositoryImplMethod,
} from './endpoint-templates.js';
import { injectMethod, injectImport, injectExport } from './dart-injector.js';
import { findPubspecDir, hasBuildRunner, runBuildRunner } from './build-runner.js';

export interface EndpointOptions {
  projectRoot: string;

  // HTTP config
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpointPath: string;

  // BFF API file
  bffApiFile: string;

  // Response
  responseModelName: string;
  responseFields?: DartField[]; // if provided, generate entity + model

  // Request (for POST/PUT/PATCH)
  requestModelName?: string;
  requestFields?: DartField[];

  // UseCase
  useCaseName: string;

  // Class names for injection targets
  datasourceFile: string;
  datasourceClassName: string;
  repositoryInterfaceFile: string;
  repositoryInterfaceName: string;
  repositoryImplFile: string;
  repositoryImplClassName: string;

  // Feature grouping
  feature: string;

  // Build runner
  runBuildRunner: boolean;
}

export async function createEndpoint(options: EndpointOptions): Promise<void> {
  const lib = path.join(options.projectRoot, 'lib');
  const pascal = pascalCase(options.responseModelName);
  const useCasePascal = pascalCase(options.useCaseName);
  const useCaseSnake = options.useCaseName;
  const hasRequestBody = ['POST', 'PUT', 'PATCH'].includes(options.httpMethod) && options.requestFields;

  // Path params extracted from endpoint path
  const pathParams = extractPathParams(options.endpointPath);

  // Build method param list
  const methodParams = buildMethodParams(options, pathParams, hasRequestBody);
  const methodParamsForSignature = methodParams.map((p) => ({ name: p.name, type: p.type }));

  // Response return type
  const returnType = `${pascal}Entity`;
  const repositoryInterfaceSnake = path.basename(options.repositoryInterfaceFile, '.dart');

  const spinner = (msg: string) => console.log(chalk.cyan(`  → ${msg}`));

  // 1. Generate Entity + Model (new files)
  if (options.responseFields && options.responseFields.length > 0) {
    spinner('Generating entity');
    const entityDir = path.join(lib, 'domain', 'entities', options.feature);
    fs.mkdirSync(entityDir, { recursive: true });
    fs.writeFileSync(
      path.join(entityDir, `${options.responseModelName}_entity.dart`),
      entityTemplate(options.responseModelName, pascal, options.responseFields),
    );

    spinner('Generating model');
    const modelDir = path.join(lib, 'data', 'models', options.feature);
    fs.mkdirSync(modelDir, { recursive: true });
    fs.writeFileSync(
      path.join(modelDir, `${options.responseModelName}_model.dart`),
      modelTemplate(options.responseModelName, pascal, options.responseFields),
    );
  }

  // 2. Generate Request Model (if needed)
  if (hasRequestBody && options.requestFields && options.requestModelName) {
    spinner('Generating request model');
    const reqPascal = pascalCase(options.requestModelName);
    const reqModelDir = path.join(lib, 'data', 'models', options.feature);
    fs.mkdirSync(reqModelDir, { recursive: true });
    fs.writeFileSync(
      path.join(reqModelDir, `${options.requestModelName}_request_model.dart`),
      requestModelTemplate(options.requestModelName, reqPascal, options.requestFields),
    );
  }

  // 3. Inject Retrofit method
  spinner('Injecting Retrofit method');
  const bffPath = path.resolve(options.bffApiFile);
  if (fs.existsSync(bffPath)) {
    const retrofitParams = buildRetrofitParams(options, pathParams, hasRequestBody);
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
    const modelImport = `import 'package:${options.feature}/data/models/${options.responseModelName}/${options.responseModelName}_model.dart';`;
    injectImport(bffPath, modelImport);
  } else {
    console.log(chalk.yellow(`  ⚠ BFF API file not found: ${bffPath}`));
  }

  // 4. Inject datasource method
  spinner('Injecting datasource method');
  const dsPath = path.resolve(options.datasourceFile);
  if (fs.existsSync(dsPath)) {
    const dsMethod = datasourceMethod(
      camelCase(options.useCaseName),
      returnType,
      methodParamsForSignature,
    );
    injectMethod(dsPath, options.datasourceClassName, dsMethod);
  } else {
    console.log(chalk.yellow(`  ⚠ Datasource file not found: ${dsPath}`));
  }

  // 5. Inject repository interface method
  spinner('Injecting repository interface method');
  const repoIfacePath = path.resolve(options.repositoryInterfaceFile);
  if (fs.existsSync(repoIfacePath)) {
    const ifaceMethod = repositoryInterfaceMethod(
      camelCase(options.useCaseName),
      returnType,
      methodParamsForSignature,
    );
    injectMethod(repoIfacePath, options.repositoryInterfaceName, ifaceMethod);

    // Inject entity import
    const entityImport = `import 'package:${options.feature}/domain/entities/${options.responseModelName}/${options.responseModelName}_entity.dart';`;
    injectImport(repoIfacePath, entityImport);
  } else {
    console.log(chalk.yellow(`  ⚠ Repository interface not found: ${repoIfacePath}`));
  }

  // 6. Inject repository implementation method
  spinner('Injectating repository implementation method');
  const repoImplPath = path.resolve(options.repositoryImplFile);
  if (fs.existsSync(repoImplPath)) {
    const dsVarName = camelCase(options.datasourceClassName);
    const implMethod = repositoryImplMethod(
      camelCase(options.useCaseName),
      returnType,
      methodParamsForSignature,
      dsVarName,
    );
    injectMethod(repoImplPath, options.repositoryImplClassName, implMethod);
  } else {
    console.log(chalk.yellow(`  ⚠ Repository implementation not found: ${repoImplPath}`));
  }

  // 7. Create UseCase file
  spinner('Generating UseCase');
  const useCaseDir = path.join(lib, 'domain', 'usecases', options.feature);
  fs.mkdirSync(useCaseDir, { recursive: true });
  fs.writeFileSync(
    path.join(useCaseDir, `${useCaseSnake}_usecase.dart`),
    useCaseTemplate(
      useCaseSnake,
      useCasePascal,
      camelCase(options.useCaseName),
      methodParamsForSignature,
      returnType,
      repositoryInterfaceName,
    ),
  );

  // 8. Update barrel file
  spinner('Updating barrel file');
  const barrelPath = path.join(useCaseDir, 'usecases.dart');
  const exportLine = `export '${useCaseSnake}_usecase.dart';`;
  injectExport(barrelPath, exportLine);

  // 9. Run build_runner
  if (options.runBuildRunner) {
    const projectRoot = findPubspecDir(options.projectRoot);
    if (projectRoot && hasBuildRunner(projectRoot)) {
      spinner('Running build_runner...');
      await runBuildRunner(projectRoot);
      console.log(chalk.green('  ✓ build_runner completed.'));
    } else {
      console.log(chalk.yellow('  ⚠ Skipping build_runner (not found).'));
    }
  }

  console.log(chalk.green(`\n✓ Endpoint "${options.useCaseName}" generated successfully.`));
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

  if (hasRequestBody && options.requestModelName) {
    const reqPascal = pascalCase(options.requestModelName);
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

  if (hasRequestBody && options.requestModelName) {
    const reqPascal = pascalCase(options.requestModelName);
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
