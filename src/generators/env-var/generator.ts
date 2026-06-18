import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { camelCase } from 'change-case';
import { injectMethod } from '../../dart/injector.js';
import { findFileRecursive, findFileInPackages, findClassInPackages } from '../../shared/fs-helpers.js';
import {
  injectBeforeClassClose,
  injectConstructorParam,
  injectIntoPropsList,
  injectIntoSuperCall,
} from '../../dart/class-manipulator.js';

// ============================================================
// Types
// ============================================================

export type EnvVarType = 'String' | 'int' | 'bool' | 'List<String>';

export interface EnvVarOptions {
  monorepoRoot: string;
  variableName: string; // SCREAMING_SNAKE_CASE
  dartType: EnvVarType;
  defaultValue?: string;
  selectedApps: string[];
  vendorsTargets: string[];
  includeInRemoteConfig: boolean;
  includeInAppConfig: boolean;
}

// ============================================================
// Helpers
// ============================================================

function screamingSnakeToCamel(name: string): string {
  return camelCase(name.toLowerCase());
}

function dartTypeForGetter(type: EnvVarType): string {
  return type; // String, int, bool, List<String> map directly
}

function typedJsonValue(defaultValue: string | undefined, dartType: EnvVarType): unknown {
  if (!defaultValue || !defaultValue.trim()) {
    switch (dartType) {
      case 'int': return 0;
      case 'bool': return false;
      case 'List<String>': return [];
      default: return '';
    }
  }
  switch (dartType) {
    case 'int':
      return parseInt(defaultValue, 10);
    case 'bool':
      return defaultValue === 'true';
    case 'List<String>':
      return defaultValue.split(',').map((s) => s.trim());
    default:
      return defaultValue;
  }
}

function abstractGetterCode(camelName: string, dartType: EnvVarType): string {
  const type = dartTypeForGetter(dartType);
  return `${type} get ${camelName};`;
}

function buildEnvGetterCode(camelName: string, constName: string, dartType: EnvVarType): string {
  const type = dartTypeForGetter(dartType);
  switch (dartType) {
    case 'String':
      return `@override\nString get ${camelName} => const String.fromEnvironment('${constName}');`;
    case 'int':
      return `@override\nint get ${camelName} => const int.fromEnvironment('${constName}');`;
    case 'bool':
      return `@override\nbool get ${camelName} => const bool.fromEnvironment('${constName}');`;
    case 'List<String>':
      return [
        '@override',
        `List<String> get ${camelName} {`,
        `  const rawString = String.fromEnvironment('${constName}');`,
        '  if (rawString.isEmpty) return [];',
        "  return rawString.split(',').map((e) => e.trim()).toList();",
        '}',
      ].join('\n');
  }
}

function appConfigDefaultValue(dartType: EnvVarType): string {
  switch (dartType) {
    case 'String':
      return "''";
    case 'int':
      return '0';
    case 'bool':
      return 'false';
    case 'List<String>':
      return 'const []';
  }
}

function appConfigModelJsonKey(camelName: string, dartType: EnvVarType): string {
  switch (dartType) {
    case 'bool':
      return `@override\n  @JsonKey(name: '${camelName}', fromJson: AppConfigModel.parseBool)`;
    case 'int':
      return `@override\n  @JsonKey(name: '${camelName}', fromJson: AppConfigModel.parseInt)`;
    case 'List<String>':
      return `@override\n  @JsonKey(name: '${camelName}', fromJson: AppConfigModel.parseToList)`;
    default:
      return `@override\n  @JsonKey(name: '${camelName}')`;
  }
}

// ============================================================
// Discovery
// ============================================================

export function discoverAppsWithEnv(monorepoRoot: string): string[] {
  const appsDir = path.join(monorepoRoot, 'apps');
  if (!fs.existsSync(appsDir)) return [];

  return fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => fs.existsSync(path.join(appsDir, d.name, 'env')))
    .map((d) => d.name)
    .sort();
}

// ============================================================
// PASO 1: Env JSON files
// ============================================================

function injectIntoJsonFile(
  filePath: string,
  key: string,
  value: unknown,
  isTemplate: boolean,
): string | null {
  if (!fs.existsSync(filePath)) {
    console.log(chalk.yellow(`  Skipping ${filePath} (not found)`));
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(content);

  if (key in json) {
    console.log(chalk.yellow(`  Key "${key}" already exists in ${path.basename(filePath)}`));
    return null;
  }

  json[key] = isTemplate ? `\${${key}}` : value;

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
  console.log(chalk.green(`  Updated ${path.basename(filePath)}`));
  return filePath;
}

// ============================================================
// PASO 2: AppEnvironment (abstract class)
// ============================================================

function injectAbstractGetter(
  monorepoRoot: string,
  camelName: string,
  dartType: EnvVarType,
): string | null {
  const packagesDir = path.join(monorepoRoot, 'packages');
  if (!fs.existsSync(packagesDir)) return null;

  const envFile = findFileInPackages(packagesDir, 'app_environment.dart');
  if (!envFile) {
    console.log(chalk.yellow('  app_environment.dart not found in any package'));
    return null;
  }

  const content = fs.readFileSync(envFile, 'utf8');
  const dedup = `get ${camelName}`;
  if (content.includes(dedup)) {
    console.log(chalk.yellow(`  '${camelName}' already in AppEnvironment`));
    return null;
  }

  // Find the last getter line (pattern: "  Type get name;")
  const getterRegex = /\n\s+\w+(?:<[^>]+>)?\s+get\s+\w+;/g;
  let lastGetterMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = getterRegex.exec(content)) !== null) {
    lastGetterMatch = match;
  }

  if (!lastGetterMatch) {
    console.log(chalk.yellow('  No getters found in AppEnvironment'));
    return null;
  }

  const insertPos = lastGetterMatch.index + lastGetterMatch[0].length;
  const getterLine = `\n  ${abstractGetterCode(camelName, dartType)}`;

  const newContent = content.slice(0, insertPos) + getterLine + content.slice(insertPos);
  fs.writeFileSync(envFile, newContent);
  console.log(chalk.green(`  Injected abstract getter in ${formatPkgPath(monorepoRoot, envFile)}`));
  return envFile;
}

// ============================================================
// PASO 3: AppBuildEnvironment (implementation class)
// ============================================================

function injectBuildEnvGetter(
  monorepoRoot: string,
  variableName: string,
  camelName: string,
  dartType: EnvVarType,
): string | null {
  const packagesDir = path.join(monorepoRoot, 'packages');
  if (!fs.existsSync(packagesDir)) return null;

  // app_build_environment.dart lives in packages/core/
  const buildEnvFile = findFileInPackages(packagesDir, 'app_build_environment.dart');
  if (!buildEnvFile) {
    console.log(chalk.yellow('  app_build_environment.dart not found in any package'));
    return null;
  }

  const code = buildEnvGetterCode(camelName, variableName, dartType);
  try {
    injectMethod(buildEnvFile, 'AppBuildEnvironment', code, `get ${camelName}`);
    console.log(chalk.green(`  Injected build env getter in ${formatPkgPath(monorepoRoot, buildEnvFile)}`));
    return buildEnvFile;
  } catch (e) {
    console.log(chalk.yellow(`  Skipped: ${(e as Error).message}`));
    return null;
  }
}

// ============================================================
// PASO 4: VendorsModule RemoteConfig defaultValues
// ============================================================

function injectIntoRemoteConfigDefaults(
  vendorsPath: string,
  camelName: string,
  dartType: EnvVarType,
): string | null {
  const content = fs.readFileSync(vendorsPath, 'utf8');

  // Check if already present
  if (content.includes(`'${camelName}'`) || content.includes(`"${camelName}"`)) {
    console.log(chalk.yellow(`  '${camelName}' already in ${path.basename(vendorsPath)}`));
    return null;
  }

  // Find the defaultValues map and inject before the closing brace
  const defaultValuesRegex = /final\s+defaultValues\s*=\s*(?:<String,\s*dynamic>\s*)?\{/;
  const match = content.match(defaultValuesRegex);
  if (!match) {
    console.log(chalk.yellow(`  Could not find defaultValues map in ${path.basename(vendorsPath)}`));
    return null;
  }

  // Find the closing brace of the map by brace-tracking from the match
  const mapStart = content.indexOf(match[0]) + match[0].length;
  let braceCount = 1;
  let mapEnd = -1;

  for (let i = mapStart; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        mapEnd = i;
        break;
      }
    }
  }

  if (mapEnd === -1) {
    console.log(chalk.yellow(`  Could not find end of defaultValues map`));
    return null;
  }

  const valueExpr = dartType === 'List<String>'
    ? `jsonEncode(env.${camelName})`
    : `env.${camelName}`;

  // Detect indentation from last entry in the map
  const beforeClose = content.slice(0, mapEnd);
  const mapLines = beforeClose.split('\n');
  let lastEntryIndent = '      '; // fallback
  for (let i = mapLines.length - 1; i >= 0; i--) {
    const trimmed = mapLines[i].trim();
    if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
      const leadingSpaces = mapLines[i].match(/^(\s*)/)?.[1] ?? '';
      lastEntryIndent = leadingSpaces;
      break;
    }
  }

  // Insert right before the closing }
  const insertion = `${lastEntryIndent}'${camelName}': ${valueExpr},\n`;
  const newContent =
    content.slice(0, mapEnd) +
    insertion +
    content.slice(mapEnd);

  fs.writeFileSync(vendorsPath, newContent);
  console.log(chalk.green(`  Injected into VendorsModule defaultValues`));
  return vendorsPath;
}

// ============================================================
// PASO 5: AppConfig entity
// ============================================================

function injectAppConfigProperty(
  configPath: string,
  camelName: string,
  dartType: EnvVarType,
): string | null {
  const content = fs.readFileSync(configPath, 'utf8');

  if (content.includes(`final ${dartTypeForGetter(dartType)} ${camelName}`)) {
    console.log(chalk.yellow(`  '${camelName}' already in AppConfig`));
    return null;
  }

  // 1. Inject field declaration before the @override / props getter section
  // Insert before the blank line that precedes @override, so the new field
  // sits right after the last field with a blank line before @override.
  const fieldLine = `  final ${dartTypeForGetter(dartType)} ${camelName};\n`;
  let newContent = content;

  // Find the blank line before @override props getter: "\n\n  @override\n  List<Object?>"
  const propsSeparator = newContent.search(/\n\n(\s*)@override\n\s+List<Object\?>/);
  if (propsSeparator !== -1) {
    newContent = newContent.slice(0, propsSeparator + 1) + fieldLine + newContent.slice(propsSeparator + 1);
  } else {
    // Fallback: inject before class closing brace
    newContent = injectBeforeClassClose(newContent, 'AppConfig', `  final ${dartTypeForGetter(dartType)} ${camelName};`);
  }

  // 2. Inject constructor param (find the constructor and add before the closing paren)
  newContent = injectConstructorParam(newContent, 'AppConfig', camelName, appConfigDefaultValue(dartType));

  // 3. Inject into props list (find the props getter and add before the closing bracket)
  newContent = injectIntoPropsList(newContent, camelName);

  fs.writeFileSync(configPath, newContent);
  console.log(chalk.green(`  Injected into AppConfig entity`));
  return configPath;
}

// ============================================================
// PASO 6: AppConfigModel
// ============================================================

function injectAppConfigModelProperty(
  modelPath: string,
  camelName: string,
  dartType: EnvVarType,
): string | null {
  const content = fs.readFileSync(modelPath, 'utf8');

  if (content.includes(`final ${dartTypeForGetter(dartType)} ${camelName}`)) {
    console.log(chalk.yellow(`  '${camelName}' already in AppConfigModel`));
    return null;
  }

  // 1. Inject field with @JsonKey annotation before static methods
  // Leading \n creates a blank line separating from the last field.
  // Trailing \n preserves the blank line before static methods.
  const jsonKey = appConfigModelJsonKey(camelName, dartType);
  const fieldLines = (jsonKey
    ? `\n  ${jsonKey}\n  final ${dartTypeForGetter(dartType)} ${camelName};\n`
    : `\n  final ${dartTypeForGetter(dartType)} ${camelName};\n`);

  let newContent = content;

  // Fields go before the first 'static' method or factory
  // The regex \n\s+static matches the \n before the static line, which is preceded
  // by a blank line. insertAnchor points to the first \n of that blank line.
  const staticPos = newContent.search(/\n\s+static\s/);
  const factoryPos = newContent.search(/\n\s+factory\s+AppConfigModel/);
  let insertAnchor = -1;
  if (staticPos !== -1) {
    insertAnchor = staticPos;
  } else if (factoryPos !== -1) {
    insertAnchor = factoryPos;
  }

  if (insertAnchor !== -1) {
    // insertAnchor points to \n of blank line before static/factory.
    // insertAnchor + 1 is the second \n (the actual blank line content).
    // We replace from insertAnchor + 1, keeping one \n (the one at insertAnchor)
    // and adding fieldLines which ends with \n, preserving the blank line before static.
    newContent = newContent.slice(0, insertAnchor + 1) + fieldLines + newContent.slice(insertAnchor + 1);
  } else {
    newContent = injectBeforeClassClose(newContent, 'AppConfigModel', fieldLines);
  }

  // 2. Inject constructor param
  newContent = injectConstructorParam(newContent, 'AppConfigModel', camelName, dartType);

  // 3. Inject into super() call
  newContent = injectIntoSuperCall(newContent, camelName);

  fs.writeFileSync(modelPath, newContent);
  console.log(chalk.green(`  Injected into AppConfigModel`));
  return modelPath;
}

// ============================================================
// Discovery helpers (thin wrappers around shared utilities)
// ============================================================

export function discoverVendorsModules(monorepoRoot: string): string[] {
  const packagesDir = path.join(monorepoRoot, 'packages');
  if (!fs.existsSync(packagesDir)) return [];

  const results: string[] = [];
  const packages = fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const pkg of packages) {
    const pkgDir = path.join(packagesDir, pkg.name);
    const found = findFileRecursive(pkgDir, 'vendors_module.dart');
    if (found) results.push(pkg.name);
  }

  return results.sort();
}

function findAppConfigFile(monorepoRoot: string): string | null {
  const packagesDir = path.join(monorepoRoot, 'packages');
  if (!fs.existsSync(packagesDir)) return null;
  return findClassInPackages(packagesDir, 'AppConfig');
}

function findAppConfigModelFile(monorepoRoot: string): string | null {
  const packagesDir = path.join(monorepoRoot, 'packages');
  if (!fs.existsSync(packagesDir)) return null;
  return findClassInPackages(packagesDir, 'AppConfigModel');
}

function formatPkgPath(monorepoRoot: string, absPath: string): string {
  return path.relative(monorepoRoot, absPath);
}

// ============================================================
// Main exported function
// ============================================================

const spinner = (msg: string) => console.log(chalk.cyan(` → ${msg}`));

export async function createEnvVar(options: EnvVarOptions): Promise<void> {
  const {
    monorepoRoot,
    variableName,
    dartType,
    defaultValue,
    selectedApps,
    includeInRemoteConfig,
    includeInAppConfig,
  } = options;

  const camelName = screamingSnakeToCamel(variableName);
  const modifiedFiles: string[] = [];

  console.log(chalk.bold(`\nAdding environment variable: ${chalk.cyan(variableName)}\n`));

  // PASO 1: Env JSON files
  spinner('PASO 1: Updating env JSON files');
  const jsonValue = typedJsonValue(defaultValue, dartType);
  const appsDir = path.join(monorepoRoot, 'apps');

  for (const app of selectedApps) {
    const appEnvDir = path.join(appsDir, app, 'env');
    const files = [
      { name: 'example.env.json', isTemplate: true },
      { name: 'development.env.json', isTemplate: false },
      { name: 'production.env.json', isTemplate: false },
    ];

    for (const { name, isTemplate } of files) {
      const modified = injectIntoJsonFile(path.join(appEnvDir, name), variableName, jsonValue, isTemplate);
      if (modified) modifiedFiles.push(modified);
    }
  }

  // PASO 2: AppEnvironment abstract class
  spinner('PASO 2: Injecting into AppEnvironment');
  const envFile = injectAbstractGetter(monorepoRoot, camelName, dartType);
  if (envFile) modifiedFiles.push(envFile);

  // PASO 3: AppBuildEnvironment implementation
  spinner('PASO 3: Injecting into AppBuildEnvironment');
  const buildEnvFile = injectBuildEnvGetter(monorepoRoot, variableName, camelName, dartType);
  if (buildEnvFile) modifiedFiles.push(buildEnvFile);

  // PASO 4: VendorsModule RemoteConfig defaultValues
  if (includeInRemoteConfig) {
    spinner('PASO 4: Injecting into VendorsModule RemoteConfig');
    for (const pkgName of options.vendorsTargets) {
      const pkgDir = path.join(monorepoRoot, 'packages', pkgName);
      const vendorsPath = findFileRecursive(pkgDir, 'vendors_module.dart');
      if (vendorsPath) {
        console.log(chalk.cyan(`  → ${pkgName}/vendors_module.dart`));
        const modified = injectIntoRemoteConfigDefaults(vendorsPath, camelName, dartType);
        if (modified) modifiedFiles.push(modified);
      } else {
        console.log(chalk.yellow(`  vendors_module.dart not found in ${pkgName}`));
      }
    }
  }

  // PASO 5: AppConfig entity
  if (includeInAppConfig) {
    spinner('PASO 5: Injecting into AppConfig entity');
    const configPath = findAppConfigFile(monorepoRoot);
    if (configPath) {
      const modified = injectAppConfigProperty(configPath, camelName, dartType);
      if (modified) modifiedFiles.push(modified);
    } else {
      console.log(chalk.yellow('  app_config.dart not found, skipping AppConfig'));
    }

    // PASO 6: AppConfigModel
    spinner('PASO 6: Injecting into AppConfigModel');
    const modelPath = findAppConfigModelFile(monorepoRoot);
    if (modelPath) {
      const modified = injectAppConfigModelProperty(modelPath, camelName, dartType);
      if (modified) modifiedFiles.push(modified);
    } else {
      console.log(chalk.yellow('  app_config_model.dart not found, skipping AppConfigModel'));
    }
  }

  console.log(chalk.green('\nEnvironment variable added successfully!'));

  // Run dart format only on modified .dart files
  const dartFiles = modifiedFiles.filter((f) => f.endsWith('.dart'));
  if (dartFiles.length > 0) {
    spinner('Running dart format on modified files...');
    try {
      const fileList = dartFiles.join(' ');
      execSync(`dart format ${fileList}`, { cwd: monorepoRoot, stdio: 'pipe' });
      console.log(chalk.green(`  Formatted ${dartFiles.length} file(s)`));
    } catch {
      console.log(chalk.yellow('  dart format failed (you may need to run it manually)'));
    }
  }
}
