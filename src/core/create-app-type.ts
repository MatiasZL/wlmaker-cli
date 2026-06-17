import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { SUPPORTED_COUNTRIES, type CountryConfig } from './app-type-constants.js';

export interface AppTypeInfo {
  name: string;
  defaultLocale: string;
  supportedLocales: string[];
  timezone: string;
}

export function parseAppTypes(appTypePath: string): AppTypeInfo[] {
  const content = fs.readFileSync(appTypePath, 'utf8');
  const types: AppTypeInfo[] = [];

  const enumRegex = /(\w+)\(\s*defaultLocale:\s*Locale\('([^']*)',\s*'([^']*)'\),\s*supportedLocales:\s*\[([^\]]*)\],\s*timezone:\s*'([^']*)',?\s*\)/g;
  let match;
  while ((match = enumRegex.exec(content)) !== null) {
    const name = match[1].toLowerCase();
    const lang = match[2];
    const country = match[3];
    const supportedRaw = match[4];
    const timezone = match[5];

    const supportedLocales: string[] = [];
    const localeRegex = /Locale\('([^']*)',\s*'([^']*)'\)/g;
    let locMatch;
    while ((locMatch = localeRegex.exec(supportedRaw)) !== null) {
      supportedLocales.push(`${locMatch[1]}_${locMatch[2]}`);
    }

    types.push({
      name,
      defaultLocale: `${lang}_${country}`,
      supportedLocales,
      timezone,
    });
  }

  return types;
}

export function discoverExistingLocales(i18nDir: string): string[] {
  const locales: string[] = [];

  if (!fs.existsSync(i18nDir)) return locales;

  const langDirs = fs.readdirSync(i18nDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const lang of langDirs) {
    const langDir = path.join(i18nDir, lang);
    const files = fs.readdirSync(langDir).filter(f => f.endsWith('.i18n.json'));

    for (const file of files) {
      const baseName = file.replace('.i18n.json', '');
      if (baseName.includes('-')) {
        const parts = baseName.split('-');
        locales.push(`${parts[0]}_${parts[1]}`);
      } else {
        const country = SUPPORTED_COUNTRIES.find(c => c.language === lang);
        if (country) {
          locales.push(`${lang}_${country.code}`);
        } else {
          locales.push(lang);
        }
      }
    }
  }

  return [...new Set(locales)].sort();
}

export function countryToEnumName(countryName: string): string {
  return countryName.toLowerCase().replace(/\s+/g, '');
}

export function findCountryConfig(countryCode: string): CountryConfig | undefined {
  return SUPPORTED_COUNTRIES.find(c => c.code === countryCode);
}

export async function createAppType(
  monorepoRoot: string,
  country: CountryConfig,
): Promise<void> {
  const localizationDir = path.join(monorepoRoot, 'packages', 'localization');
  const appTypePath = path.join(localizationDir, 'lib', 'enum', 'app_type.dart');
  const i18nDir = path.join(localizationDir, 'lib', 'i18n');
  const widgetbookMainPath = path.join(monorepoRoot, 'apps', 'widgetbook', 'lib', 'main.dart');

  const enumName = countryToEnumName(country.name);

  // 1. Validate AppType doesn't already exist
  const existingTypes = parseAppTypes(appTypePath);
  if (existingTypes.some(t => t.name === enumName)) {
    throw new Error(`AppType "${enumName}" already exists in app_type.dart`);
  }

  // 2. Add enum value to app_type.dart
  console.log(chalk.cyan(' → Adding AppType to enum...'));
  addEnumValue(appTypePath, country, enumName);
  dartFormat(appTypePath);

  // 3. Copy base i18n file to country-specific file
  console.log(chalk.cyan(' → Creating i18n file...'));
  copyI18nBase(i18nDir, country);

  // 4. Update widgetbook
  console.log(chalk.cyan(' → Updating widgetbook...'));
  updateWidgetbook(widgetbookMainPath, country, enumName);

  console.log(chalk.green(`\nAppType "${enumName}" created successfully!`));
}

export async function editAppType(
  monorepoRoot: string,
  enumName: string,
  newDefaultLocale: string,
  newSupportedLocales: string[],
): Promise<void> {
  const appTypePath = path.join(
    monorepoRoot, 'packages', 'localization', 'lib', 'enum', 'app_type.dart',
  );

  const existingTypes = parseAppTypes(appTypePath);
  const target = existingTypes.find(t => t.name === enumName);
  if (!target) {
    throw new Error(`AppType "${enumName}" not found in app_type.dart`);
  }

  console.log(chalk.cyan(' → Updating AppType enum...'));
  updateEnumValue(appTypePath, enumName, newDefaultLocale, newSupportedLocales, target.timezone);
  dartFormat(appTypePath);

  console.log(chalk.green(`\nAppType "${enumName}" updated successfully!`));
}

function addEnumValue(appTypePath: string, country: CountryConfig, enumName: string): void {
  let content = fs.readFileSync(appTypePath, 'utf8');

  const lang = country.language;
  const code = country.code;

  const newValue = `  ${enumName}(
    defaultLocale: Locale('${lang}', '${code}'),
    supportedLocales: [Locale('${lang}', '${code}')],
    timezone: '${country.timezone}',
  );`;

  const enumOpen = content.indexOf('enum AppType {');
  if (enumOpen === -1) throw new Error('Could not find enum AppType in app_type.dart');

  const constPattern = '\n  const AppType(';
  const constIdx = content.indexOf(constPattern, enumOpen);
  if (constIdx === -1) throw new Error('Could not find enum closing in app_type.dart');

  const semicolonBeforeConst = content.lastIndexOf(';', constIdx);
  if (semicolonBeforeConst === -1) throw new Error('Could not find enum closing semicolon');

  content = content.slice(0, semicolonBeforeConst) + ',\n' + newValue + content.slice(semicolonBeforeConst + 1);

  fs.writeFileSync(appTypePath, content);
}

function copyI18nBase(i18nDir: string, country: CountryConfig): void {
  const lang = country.language;
  const code = country.code;
  const langDir = path.join(i18nDir, lang);
  const baseFile = path.join(langDir, `${lang}.i18n.json`);
  const targetFile = path.join(langDir, `${lang}-${code}.i18n.json`);

  if (!fs.existsSync(langDir)) {
    fs.mkdirSync(langDir, { recursive: true });
  }

  if (fs.existsSync(targetFile)) {
    console.log(chalk.yellow(`  i18n file ${lang}-${code}.i18n.json already exists, skipping copy`));
    return;
  }

  if (!fs.existsSync(baseFile)) {
    throw new Error(`Base i18n file not found: ${baseFile}`);
  }

  fs.copyFileSync(baseFile, targetFile);
  console.log(chalk.green(`  Created ${lang}-${code}.i18n.json from base`));
}

function updateWidgetbook(widgetbookMainPath: string, country: CountryConfig, enumName: string): void {
  if (!fs.existsSync(widgetbookMainPath)) {
    console.log(chalk.yellow('  Widgetbook main.dart not found, skipping'));
    return;
  }

  let content = fs.readFileSync(widgetbookMainPath, 'utf8');

  const localeStr = `Locale('${country.language}', '${country.code}')`;
  if (!content.includes(localeStr)) {
    const localesArrayPattern = /locales:\s*const\s*\[/;
    const match = localesArrayPattern.exec(content);
    if (match) {
      const afterBracket = match.index + match[0].length;
      content = content.slice(0, afterBracket) + `\n            ${localeStr},` + content.slice(afterBracket);
    }
  }

  fs.writeFileSync(widgetbookMainPath, content);
  console.log(chalk.green('  Updated widgetbook main.dart'));
}

function updateEnumValue(
  appTypePath: string,
  enumName: string,
  newDefaultLocale: string,
  newSupportedLocales: string[],
  timezone: string,
): void {
  let content = fs.readFileSync(appTypePath, 'utf8');

  const [defLang, defCountry] = newDefaultLocale.split('_');

  const supportedStr = newSupportedLocales
    .map(loc => {
      const [l, c] = loc.split('_');
      return `Locale('${l}', '${c}')`;
    })
    .join(', ');

  const newBlock = `  ${enumName}(
    defaultLocale: Locale('${defLang}', '${defCountry}'),
    supportedLocales: [${supportedStr}],
    timezone: '${timezone}',
  ),`;

  const enumStart = content.indexOf(`  ${enumName}(`);
  if (enumStart === -1) {
    throw new Error(`Could not find ${enumName} enum value in app_type.dart`);
  }

  let parenCount = 0;
  let enumEnd = -1;
  for (let i = enumStart; i < content.length; i++) {
    if (content[i] === '(') parenCount++;
    else if (content[i] === ')') {
      parenCount--;
      if (parenCount === 0) {
        enumEnd = i;
        break;
      }
    }
  }

  if (enumEnd === -1) {
    throw new Error(`Could not find end of ${enumName} enum value`);
  }

  let replaceEnd = enumEnd + 1;
  if (content[replaceEnd] === ',') replaceEnd++;

  content = content.slice(0, enumStart) + newBlock + content.slice(replaceEnd);

  fs.writeFileSync(appTypePath, content);
}

function dartFormat(filePath: string): void {
  try {
    execSync(`dart format "${filePath}"`, { stdio: 'pipe' });
  } catch {
    console.log(chalk.yellow('  dart format failed (file saved but not formatted)'));
  }
}
