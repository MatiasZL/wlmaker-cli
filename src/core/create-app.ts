import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { pascalCase } from 'change-case';
import {
  type AppTemplateParams,
  pubspecTemplate,
  flavorizrTemplate,
  versionTemplate,
  makefileTemplate,
  gitignoreTemplate,
  analysisOptionsTemplate,
  devtoolsOptionsTemplate,
  envGitignoreTemplate,
  exampleEnvJsonTemplate,
  mainDartTemplate,
  bootstrapTemplate,
  appBarrelTemplate,
  firebaseOptionsTemplate,
  dependenciesTemplate,
  preloadModuleTemplate,
  blocsModuleTemplate,
  collaborativeRouterTemplate,
  assetsTemplate,
  screenNamesTemplate,
  setVersionScriptTemplate,
  fixIosIconsScriptTemplate,
  androidAppBuildGradleTemplate,
  androidFlavorizrGradleTemplate,
  androidSettingsGradleTemplate,
  androidBuildGradleTemplate,
  androidGradlePropertiesTemplate,
  mainActivityTemplate,
  searchActionJsonTemplate,
  themeJsonTemplate,
  runnerEntitlementsTemplate,
  addressRouterTemplate,
  countryModuleTemplate,
  storeModuleTemplate,
  checkoutModuleTemplate,
  primeModuleTemplate,
  sessionRouterImplTemplate,
} from './app-templates.js';

export interface CreateAppOptions {
  monorepoRoot: string;
  appName: string;
  brand: string;
  brandDisplayName: string;
  countryCode: string;
  countryDisplayName: string;
  appType: string;
  splashColor: string;
  themePath: string;
  devBundleId: string;
  prodBundleId: string;
  androidNamespace: string;
  firebaseProjectTest: string;
  firebaseProjectProd: string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function createBlackPng(size: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  const ihdr = makePngChunk('IHDR', ihdrData);

  const rowSize = 1 + size * 3;
  const rawData = Buffer.alloc(size * rowSize);
  const compressed = zlib.deflateSync(rawData);
  const idat = makePngChunk('IDAT', compressed);

  const iend = makePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createMinimalAnimationJson(): string {
  return JSON.stringify({
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 60,
    w: 100,
    h: 100,
    nm: "animation",
    ddd: 0,
    assets: [],
    layers: [],
  }, null, 2);
}

function write(filePath: string, content: string | Buffer): void {
  fs.writeFileSync(filePath, content);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export async function createApp(options: CreateAppOptions): Promise<void> {
  const { monorepoRoot, appName } = options;
  const appDir = path.join(monorepoRoot, 'apps', appName);

  if (fs.existsSync(appDir)) {
    throw new Error(`apps/${appName} already exists`);
  }

  const params: AppTemplateParams = {
    ...options,
  };

  console.log(chalk.bold(`\nCreating app: ${chalk.cyan(appName)}\n`));

  console.log(chalk.cyan(' → Running flutter create...'));
  execSync(
    `flutter create --platforms android,ios --project-name ${appName} apps/${appName}`,
    { cwd: monorepoRoot, stdio: 'pipe' },
  );

  console.log(chalk.cyan(' → Writing app files...'));

  write(path.join(appDir, 'pubspec.yaml'), pubspecTemplate(params));
  write(path.join(appDir, '.gitignore'), gitignoreTemplate());
  write(path.join(appDir, 'analysis_options.yaml'), analysisOptionsTemplate());
  write(path.join(appDir, 'devtools_options.yaml'), devtoolsOptionsTemplate());
  write(path.join(appDir, 'flavorizr.yaml'), flavorizrTemplate(params));
  write(path.join(appDir, 'version.yaml'), versionTemplate());
  write(path.join(appDir, 'Makefile'), makefileTemplate(params));

  ensureDir(path.join(appDir, 'env'));
  write(path.join(appDir, 'env', '.gitignore'), envGitignoreTemplate());
  write(path.join(appDir, 'env', 'example.env.json'), exampleEnvJsonTemplate());

  ensureDir(path.join(appDir, 'assets', 'app_icon'));
  write(path.join(appDir, 'assets', 'app_icon', 'logo.png'), createBlackPng(1024));
  write(path.join(appDir, 'assets', 'app_icon', 'logo_stg.png'), createBlackPng(1024));

  ensureDir(path.join(appDir, 'assets', 'analytics'));
  write(path.join(appDir, 'assets', 'analytics', 'search_action.json'), searchActionJsonTemplate());

  ensureDir(path.join(appDir, 'assets', 'animations'));
  write(path.join(appDir, 'assets', 'animations', 'loading_cko.json'), createMinimalAnimationJson());
  write(path.join(appDir, 'assets', 'animations', 'splash.json'), createMinimalAnimationJson());

  ensureDir(path.join(appDir, 'scripts'));
  write(path.join(appDir, 'scripts', 'set-version.sh'), setVersionScriptTemplate());
  fs.chmodSync(path.join(appDir, 'scripts', 'set-version.sh'), 0o755);
  write(path.join(appDir, 'scripts', 'fix_ios_icons.py'), fixIosIconsScriptTemplate());
  fs.chmodSync(path.join(appDir, 'scripts', 'fix_ios_icons.py'), 0o755);

  const libDir = path.join(appDir, 'lib');
  ensureDir(libDir);
  write(path.join(libDir, 'main.dart'), mainDartTemplate(params));
  write(path.join(libDir, 'bootstrap.dart'), bootstrapTemplate(params));
  write(path.join(libDir, `${appName}.dart`), appBarrelTemplate(params));
  write(path.join(libDir, 'firebase_options.dart'), firebaseOptionsTemplate());

  ensureDir(path.join(libDir, 'assets'));
  write(path.join(libDir, 'assets', 'assets.dart'), assetsTemplate(params));

  ensureDir(path.join(libDir, 'screen_names'));
  write(path.join(libDir, 'screen_names', 'screen_names.dart'), screenNamesTemplate());

  ensureDir(path.join(libDir, 'dependencies'));
  write(path.join(libDir, 'dependencies', 'dependencies.dart'), dependenciesTemplate(params));
  write(path.join(libDir, 'dependencies', 'preload_module.dart'), preloadModuleTemplate(params));
  write(path.join(libDir, 'dependencies', 'blocs_module.dart'), blocsModuleTemplate());

  ensureDir(path.join(libDir, 'dependencies', 'collaborative_router'));
  write(
    path.join(libDir, 'dependencies', 'collaborative_router', `${appName}_collaborative_router.dart`),
    collaborativeRouterTemplate(params),
  );

  ensureDir(path.join(libDir, 'dependencies', 'address', 'country'));
  ensureDir(path.join(libDir, 'dependencies', 'address', 'store'));
  write(path.join(libDir, 'dependencies', 'address', 'address.dart'), addressRouterTemplate(params));
  write(path.join(libDir, 'dependencies', 'address', 'country', 'country.dart'), countryModuleTemplate());
  write(path.join(libDir, 'dependencies', 'address', 'store', 'store.dart'), storeModuleTemplate());

  ensureDir(path.join(libDir, 'dependencies', 'checkout'));
  write(path.join(libDir, 'dependencies', 'checkout', 'checkout.dart'), checkoutModuleTemplate(params));

  ensureDir(path.join(libDir, 'dependencies', 'prime'));
  write(path.join(libDir, 'dependencies', 'prime', 'prime.dart'), primeModuleTemplate(params));

  ensureDir(path.join(libDir, 'dependencies', 'sessions'));
  write(path.join(libDir, 'dependencies', 'sessions', 'session_router_impl.dart'), sessionRouterImplTemplate(params));

  console.log(chalk.cyan(' → Writing Android files (Kotlin DSL)...'));

  write(path.join(appDir, 'android', 'build.gradle.kts'), androidBuildGradleTemplate());
  write(path.join(appDir, 'android', 'settings.gradle.kts'), androidSettingsGradleTemplate());
  write(path.join(appDir, 'android', 'gradle.properties'), androidGradlePropertiesTemplate());
  write(path.join(appDir, 'android', 'app', 'build.gradle.kts'), androidAppBuildGradleTemplate(params));
  write(path.join(appDir, 'android', 'app', 'flavorizr.gradle.kts'), androidFlavorizrGradleTemplate(params));

  const kotlinPackagePath = params.androidNamespace.split('.').join('/');
  const mainActivityDir = path.join(
    appDir, 'android', 'app', 'src', 'main', 'kotlin', kotlinPackagePath,
  );
  ensureDir(mainActivityDir);
  write(path.join(mainActivityDir, 'MainActivity.kt'), mainActivityTemplate(params));

  console.log(chalk.cyan(' → Writing iOS entitlements...'));
  const iosRunnerDir = path.join(appDir, 'ios', 'Runner');
  if (fs.existsSync(iosRunnerDir)) {
    write(path.join(iosRunnerDir, 'Runner.entitlements'), runnerEntitlementsTemplate());
  }

  console.log(chalk.cyan(' → Creating design system theme...'));

  const brandDir = path.join(
    monorepoRoot, 'packages', 'design_system', 'assets', 'json', params.brand,
  );
  ensureDir(brandDir);
  const themeFileName = `${params.brand}-${params.countryCode}.json`;
  write(
    path.join(brandDir, themeFileName),
    themeJsonTemplate(params.brand, params.countryCode),
  );

  console.log(chalk.cyan(' → Registering theme in design_system pubspec.yaml...'));
  const dsPubspecPath = path.join(monorepoRoot, 'packages', 'design_system', 'pubspec.yaml');
  if (fs.existsSync(dsPubspecPath)) {
    let dsPubspec = fs.readFileSync(dsPubspecPath, 'utf8');
    const assetLine = `    - assets/json/${params.brand}/${themeFileName}`;
    if (!dsPubspec.includes(assetLine)) {
      const prismaLine = '    - assets/json/prisma.json';
      dsPubspec = dsPubspec.replace(prismaLine, `${prismaLine}\n${assetLine}`);
      write(dsPubspecPath, dsPubspec);
      console.log(chalk.green(`  Added ${assetLine} to design_system/pubspec.yaml`));
    }
  }

  console.log(chalk.cyan(' → Registering theme in widgetbook...'));
  const widgetbookMainPath = path.join(monorepoRoot, 'apps', 'widgetbook', 'lib', 'main.dart');
  if (fs.existsSync(widgetbookMainPath)) {
    let widgetbookContent = fs.readFileSync(widgetbookMainPath, 'utf8');
    const themePath = params.themePath;
    const brandLabel = `${params.brandDisplayName}-${params.countryCode}`;

    const lightEntry = `            const WidgetbookTheme(
              name: '${brandLabel}-Light',
              data: WlThemeItem(
                path: '${themePath}',
                isDark: false,
              ),
            ),`;

    const darkEntry = `            const WidgetbookTheme(
              name: '${brandLabel}-Dark',
              data: WlThemeItem(
                path: '${themePath}',
                isDark: true,
              ),
            ),`;

    if (!widgetbookContent.includes(`'${brandLabel}-Light'`)) {
      const lastThemePattern = /const WidgetbookTheme\(\s*name: 'Prezunic-BR-Dark'[^)]+\),\s*\),/;
      if (lastThemePattern.test(widgetbookContent)) {
        widgetbookContent = widgetbookContent.replace(
          lastThemePattern,
          (match) => `${match}\n${lightEntry}\n${darkEntry}`,
        );
        write(widgetbookMainPath, widgetbookContent);
        console.log(chalk.green(`  Added ${brandLabel} themes to widgetbook`));
      } else {
        console.log(chalk.yellow('  Could not find insertion point in widgetbook/main.dart'));
      }
    }
  }

  console.log(chalk.cyan(' → Updating workspace configuration...'));
  updateCodeWorkspace(monorepoRoot, params.appName, params.brandDisplayName, params.countryDisplayName);

  console.log(chalk.cyan(' → Cleaning auto-generated test directory...'));
  const testDir = path.join(appDir, 'test');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }

  console.log(chalk.cyan(' → Running melos bootstrap...'));
  try {
    execSync('melos bootstrap', { cwd: monorepoRoot, stdio: 'pipe' });
    console.log(chalk.green('  melos bootstrap completed'));
  } catch {
    console.log(chalk.yellow('  melos bootstrap failed (you may need to run it manually)'));
  }

  console.log(chalk.cyan(' → Running build_runner build...'));
  try {
    execSync('dart run build_runner build', { cwd: appDir, stdio: 'pipe' });
    console.log(chalk.green('  build_runner build completed'));
  } catch {
    console.log(chalk.yellow('  build_runner build failed (you may need to run it manually)'));
  }

  console.log(chalk.cyan(' → Formatting code...'));
  try {
    execSync('dart format lib/', { cwd: appDir, stdio: 'pipe' });
    console.log(chalk.green('  dart format completed'));
  } catch {
    console.log(chalk.yellow('  dart format failed (you may need to run it manually)'));
  }

  console.log(chalk.green(`\nApp "${appName}" created successfully!`));
  console.log(chalk.gray(`  ${appDir}`));
  console.log(chalk.gray(`\n  Next steps:`));
  console.log(chalk.gray(`    1. make flavors`));
  console.log(chalk.gray(`    2. make firebase`));
  console.log(chalk.gray(`    3. make splash`));
}

function findWorkspaceFile(monorepoRoot: string): string | null {
  const files = fs.readdirSync(monorepoRoot);
  return files.find((f) => f.endsWith('.code-workspace')) ?? null;
}

function updateCodeWorkspace(
  monorepoRoot: string,
  appName: string,
  brandDisplayName: string,
  countryDisplayName: string,
): void {
  const wsFileName = findWorkspaceFile(monorepoRoot);
  if (!wsFileName) {
    console.log(chalk.yellow('  No .code-workspace file found, skipping'));
    return;
  }

  const wsPath = path.join(monorepoRoot, wsFileName);
  let content = fs.readFileSync(wsPath, 'utf8');

  const folderPath = `apps/${appName}`;

  if (content.includes(`"path": "${folderPath}"`)) {
    console.log(chalk.yellow(`  Already in ${wsFileName}`));
    return;
  }

  const folderName = `\u26AB ${brandDisplayName} ${countryDisplayName}`;
  const newFolderBlock = `    {
      "name": "${folderName}",
      "path": "${folderPath}"
    },`;

  content = insertFolderEntry(content, newFolderBlock);
  content = insertLaunchConfigs(content, appName, folderName);

  fs.writeFileSync(wsPath, content);
  console.log(chalk.green(`  Updated ${wsFileName}`));
}

function insertFolderEntry(content: string, newBlock: string): string {
  const lines = content.split('\n');

  const foldersLineIdx = lines.findIndex((l) => l.includes('"folders"'));
  if (foldersLineIdx === -1) return content;

  let foldersOpenBracket = -1;
  for (let j = foldersLineIdx; j < lines.length; j++) {
    if (lines[j].includes('[')) {
      foldersOpenBracket = j;
      break;
    }
  }
  if (foldersOpenBracket === -1) return content;

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
  if (foldersCloseBracket === -1) return content;

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

  if (widgetbookBlockStart === -1) return content;

  lines.splice(widgetbookBlockStart, 0, newBlock);
  return lines.join('\n');
}

function insertLaunchConfigs(content: string, appName: string, folderName: string): string {
  const stgConfig = `      {
        "name": "\u26AB\uFE0F\uD83E\uDDEA ${appName} STG",
        "cwd": "\${workspaceFolder:${folderName}}",
        "request": "launch",
        "type": "dart",
        "program": "lib/main.dart",
        "args": [
          "--flavor",
          "dev",
          "--dart-define-from-file",
          "env/development.env.json",
        ],
      },`;

  const prodConfig = `      {
        "name": "\u26AB\uFE0F\uD83D\uDE80 ${appName} PROD",
        "cwd": "\${workspaceFolder:${folderName}}",
        "request": "launch",
        "type": "dart",
        "program": "lib/main.dart",
        "args": [
          "--flavor",
          "prod",
          "--dart-define-from-file",
          "env/production.env.json",
        ],
      },`;

  const lines = content.split('\n');

  let widgetbookNameLine = -1;
  let foundCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"👨🏼\u200D🎨 widgetbook"')) {
      foundCount++;
      if (foundCount === 2) {
        widgetbookNameLine = i;
        break;
      }
    }
  }

  if (widgetbookNameLine === -1) return content;

  let widgetbookLaunchLine = widgetbookNameLine;
  for (let j = widgetbookNameLine; j >= 0; j--) {
    const trimmed = lines[j].trim();
    if (trimmed === '{') {
      widgetbookLaunchLine = j;
      break;
    }
  }

  lines.splice(widgetbookLaunchLine, 0, prodConfig, stgConfig);

  return lines.join('\n');
}
