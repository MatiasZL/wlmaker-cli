import { camelCase } from 'change-case';
import {
  type DartField,
  fieldsToConstructorParams,
  fieldsToFromJson,
  fieldsToJson,
} from './json-to-dart.js';

export function entityTemplate(
  name: string,
  pascal: string,
  fields: DartField[],
): string {
  const params = fieldsToConstructorParams(fields);
  const props = fields
    .map((f) => {
      const nullable = f.isNullable ? '?' : '';
      return `  final ${f.dartType}${nullable} ${f.name};`;
    })
    .join('\n');

  const propsList = fields
    .map((f) => `    ${f.name},`)
    .join('\n');

  return `import 'package:equatable/equatable.dart';

class ${pascal}Entity extends Equatable {
${props}

  const ${pascal}Entity({
${params}
  });

  @override
  List<Object?> get props => [
${propsList}
  ];
}
`;
}

export function modelTemplate(
  name: string,
  pascal: string,
  fields: DartField[],
): string {
  const params = fieldsToConstructorParams(fields);
  const props = fields
    .map((f) => {
      const nullable = f.isNullable ? '?' : '';
      return `  final ${f.dartType}${nullable} ${f.name};`;
    })
    .join('\n');

  const fromJson = fieldsToFromJson(fields, `${pascal}Model`);
  const toJson = fieldsToJson(fields, `${pascal}Model`);

  return `import 'package:json_annotation/json_annotation.dart';
import '../../domain/entities/${name}/${name}_entity.dart';

part '${name}_model.g.dart';

@JsonSerializable()
class ${pascal}Model extends ${pascal}Entity {
  const ${pascal}Model({
${params}
  }) : super(
${fields.map((f) => `      ${f.name}: ${f.name},`).join('\n')}
  );

  ${fromJson}

  ${toJson}

  factory ${pascal}Model.fromJson(Map<String, dynamic> json) =>
      _\$${pascal}ModelFromJson(json);

  @override
  Map<String, dynamic> toJson() => _\$${pascal}ModelToJson(this);
}
`;
}

export function requestModelTemplate(
  name: string,
  pascal: string,
  fields: DartField[],
): string {
  const params = fieldsToConstructorParams(fields);
  const props = fields
    .map((f) => {
      const nullable = f.isNullable ? '?' : '';
      return `  final ${f.dartType}${nullable} ${f.name};`;
    })
    .join('\n');

  return `import 'package:json_annotation/json_annotation.dart';

part '${name}_request_model.g.dart';

@JsonSerializable()
class ${pascal}RequestModel {
${props}

  ${pascal}RequestModel({
${params}
  });

  factory ${pascal}RequestModel.fromJson(Map<String, dynamic> json) =>
      _\$${pascal}RequestModelFromJson(json);

  Map<String, dynamic> toJson() => _\$${pascal}RequestModelToJson(this);
}
`;
}

export function entityBoilerplate(pascal: string): string {
  return `import 'package:equatable/equatable.dart';

class ${pascal}Entity extends Equatable {
  // TODO: Define fields

  const ${pascal}Entity();

  @override
  List<Object?> get props => [];
}
`;
}

export function modelBoilerplate(name: string, pascal: string, projectName: string): string {
  return `import 'package:${projectName}/core.dart';
import 'package:json_annotation/json_annotation.dart';

part '${name}_model.g.dart';

@JsonSerializable(createToJson: true)
class ${pascal}Model {
  // TODO: Define constructor parameters and fields

  const ${pascal}Model();

  factory ${pascal}Model.fromJson(Map<String, dynamic> json) =>
      _\$${pascal}ModelFromJson(json);

  ${pascal}Entity toEntity() {
    // TODO: Implement toEntity mapping
    throw UnimplementedError();
  }

  Map<String, dynamic> toJson() => _\$${pascal}ModelToJson(this);
}
`;
}

export function requestModelBoilerplate(name: string, pascal: string): string {
  return `import 'package:json_annotation/json_annotation.dart';

part '${name}_request_model.g.dart';

@JsonSerializable(createToJson: true)
class ${pascal}RequestModel {
  // TODO: Define constructor parameters and fields

  const ${pascal}RequestModel();

  factory ${pascal}RequestModel.fromJson(Map<String, dynamic> json) =>
      _\$${pascal}RequestModelFromJson(json);

  Map<String, dynamic> toJson() => _\$${pascal}RequestModelToJson(this);
}
`;
}

export function useCaseTemplate(
  pascal: string,
  method: string,
  params: { name: string; type: string }[],
  returnType: string,
  repositoryInterface: string,
  projectName: string,
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
  const callReturn = `Future<${returnType}>`;
  const args = hasParams
    ? params.map((p) => `params.${p.name}`).join(', ')
    : '';

  return `import 'package:${projectName}/core.dart';

class ${pascal}UseCase {
  ${pascal}UseCase(this._repository);

  final ${repositoryInterface} _repository;
${paramsClass}
  ${callReturn} call(${callParams}) async {
    return _repository.${method}(${args});
  }
}
`;
}

export function retrofitMethod(
  methodName: string,
  path: string,
  httpMethod: string,
  params: { name: string; type: string; isPath?: boolean; isBody?: boolean; isQuery?: boolean }[],
  returnType: string,
): string {
  const httpAnnotation = `@${httpMethod.toUpperCase()}('${path}')`;
  const paramList = params
    .map((p) => {
      if (p.isPath) return `@Path('${p.name}') ${p.type} ${p.name}`;
      if (p.isBody) return `@Body() ${p.type} ${p.name}`;
      if (p.isQuery) return `@Query('${p.name}') ${p.type} ${p.name}`;
      return `${p.type} ${p.name}`;
    })
    .join(', ');

  return `${httpAnnotation}
  Future<${returnType}> ${methodName}(${paramList});`;
}

export function datasourceMethod(
  methodName: string,
  returnType: string,
  params: { name: string; type: string }[],
): string {
  const paramList = params
    .map((p) => `${p.type} ${p.name}`)
    .join(', ');

  return `Future<${returnType}> ${methodName}(${paramList}) async {
    // TODO: implement ${methodName}
    throw UnimplementedError();
  }`;
}

export function repositoryInterfaceMethod(
  methodName: string,
  returnType: string,
  params: { name: string; type: string }[],
): string {
  const paramList = params
    .map((p) => `${p.type} ${p.name}`)
    .join(', ');

  return `Future<${returnType}> ${methodName}(${paramList});`;
}

export function repositoryImplMethod(
  methodName: string,
  returnType: string,
  _modelType: string,
  params: { name: string; type: string }[],
  _datasourceName: string,
): string {
  const paramList = params
    .map((p) => `${p.type} ${p.name}`)
    .join(', ');

  return `@override
  Future<${returnType}> ${methodName}(${paramList}) {
    // TODO: implement ${methodName}
    throw UnimplementedError();
  }`;
}

export function datasourceModuleRegistration(domainPascal: string, lazy = true): string {
  const dsClass = `${domainPascal}RestDataSource`;
  const dsCamel = camelCase(dsClass);
  const apiClass = `Bff${domainPascal}Api`;
  const annotation = lazy ? '@lazySingleton\n' : '';

  return `//============================================================================
// ${domainPascal}
//============================================================================
${annotation}${dsClass} ${dsCamel}(${apiClass} api) =>
    ${dsClass}(api: api);`;
}

export function repositoryModuleRegistration(domainPascal: string, lazy = true): string {
  const repoInterface = `${domainPascal}Repository`;
  const repoCamel = camelCase(repoInterface);
  const repoImpl = `${domainPascal}RepositoryData`;
  const dsClass = `${domainPascal}RestDataSource`;
  const annotation = lazy ? '@lazySingleton\n' : '';

  return `//============================================================================
// ${domainPascal}
//============================================================================
${annotation}${repoInterface} ${repoCamel}(
  ${dsClass} restDataSource,
) => ${repoImpl}(restDataSource: restDataSource);`;
}

export function useCaseModuleRegistration(
  useCasePascal: string,
  domainPascal: string,
  lazy = true,
): string {
  const useCaseClass = `${useCasePascal}UseCase`;
  const useCaseCamel = camelCase(useCaseClass);
  const repoInterface = `${domainPascal}Repository`;
  const annotation = lazy ? '@lazySingleton\n' : '';

  return `//============================================================================
// ${domainPascal}
//============================================================================
${annotation}${useCaseClass} ${useCaseCamel}(${repoInterface} repository) =>
    ${useCaseClass}(repository);`;
}
