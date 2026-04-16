export interface DartField {
  name: string;
  dartType: string;
  isNullable: boolean;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function jsonToFields(jsonStr: string): DartField[] {
  const parsed: JsonValue = JSON.parse(jsonStr);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object at the top level');
  }
  return objectToFields(parsed as Record<string, JsonValue>);
}

function objectToFields(obj: Record<string, JsonValue>): DartField[] {
  const fields: DartField[] = [];
  for (const [key, value] of Object.entries(obj)) {
    fields.push({
      name: key,
      dartType: dartTypeOf(value, key),
      isNullable: value === null,
    });
  }
  return fields;
}

function dartTypeOf(value: JsonValue, nameHint: string): string {
  if (value === null) return 'dynamic';
  if (typeof value === 'string') return 'String';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'int' : 'double';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'List<dynamic>';
    const elementType = dartTypeOf(value[0], nameHint);
    return `List<${elementType}>`;
  }
  if (typeof value === 'object') {
    // For nested objects, return Map<String, dynamic> as a simple approach
    return 'Map<String, dynamic>';
  }
  return 'dynamic';
}

export function fieldsToDartParams(fields: DartField[]): string {
  return fields
    .map((f) => {
      const nullable = f.isNullable ? '?' : '';
      return `    required this.${f.name},`;
    })
    .join('\n');
}

export function fieldsToConstructorParams(fields: DartField[], indent: string = '    '): string {
  return fields
    .map((f) => {
      const nullable = f.isNullable ? '?' : '';
      return `${indent}required ${f.dartType}${nullable} ${f.name},`;
    })
    .join('\n');
}

export function fieldsToFromJson(fields: DartField[], modelName: string): string {
  const entries = fields
    .map((f) => {
      if (f.dartType.startsWith('List<')) {
        return `      ${f.name}: (${_jsonFieldName(f)} as List<dynamic>).map((e) => e as ${_extractGenericType(f.dartType)}).toList(),`;
      }
      return `      ${f.name}: ${_jsonFieldName(f)} as ${f.dartType}${f.isNullable ? '?' : ''},`;
    })
    .join('\n');

  return `factory ${modelName}.fromJson(Map<String, dynamic> json) => ${modelName}(\n${entries}\n    );`;
}

export function fieldsToJson(fields: DartField[], modelName: string): string {
  const entries = fields
    .map((f) => `      '${f.name}': ${f.name},`)
    .join('\n');

  return `Map<String, dynamic> toJson() => {\n${entries}\n    };`;
}

function _jsonFieldName(f: DartField): string {
  return `json['${f.name}']`;
}

function _extractGenericType(listType: string): string {
  const match = listType.match(/^List<(.+)>$/);
  return match ? match[1] : 'dynamic';
}
