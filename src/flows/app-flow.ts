import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { escapeRegex } from '../shared/fs-helpers.js';
import { findMonorepoRoot } from '../analyzer/project.js';
import { createApp, type CreateAppOptions } from '../generators/app/generator.js';
import { createAppType, editAppType, parseAppTypes, discoverExistingLocales, countryToEnumName } from '../generators/app/type-manager.js';
import { SUPPORTED_COUNTRIES } from '../generators/app/type-constants.js';

type AppAction = 'new-app' | 'app-type' | 'change-splash' | 'change-firebase' | 'change-app-name' | 'change-bundle-id' | 'manage-entitlements';

function getAppsList(monorepoRoot: string): string[] {
  const appsDir = path.join(monorepoRoot, 'apps');
  if (!fs.existsSync(appsDir)) return [];
  return fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .filter(d => d.name !== 'widgetbook')
    .filter(d => fs.existsSync(path.join(appsDir, d.name, 'pubspec.yaml')))
    .map(d => d.name)
    .sort();
}

export async function changeFirebaseProjectFlow(monorepoRoot: string): Promise<void> {
  const appsDir = path.join(monorepoRoot, 'apps');
  const apps = getAppsList(monorepoRoot);

  if (apps.length === 0) {
    clack.outro(chalk.red('No apps found in the monorepo.'));
    return;
  }

  const selectedApp = await clack.select({
    message: 'Select app',
    options: apps.map(a => ({ value: a, label: a })),
  });
  if (clack.isCancel(selectedApp)) { clack.cancel('Cancelled'); return; }

  const makefilePath = path.join(appsDir, selectedApp as string, 'Makefile');
  if (!fs.existsSync(makefilePath)) {
    clack.outro(chalk.red('No Makefile found for this app.'));
    return;
  }

  const makefileContent = fs.readFileSync(makefilePath, 'utf-8');

  const stgMatch = makefileContent.match(/fire-stg:\s*\n\tflutterfire configure[^]*?--project=([^\s]+)/);
  const prodMatch = makefileContent.match(/fire-prod:\s*\n\tflutterfire configure[^]*?--project=([^\s]+)/);

  if (!stgMatch && !prodMatch) {
    clack.outro(chalk.red('No fire-stg or fire-prod targets found in Makefile.'));
    return;
  }

  const stgProject = stgMatch ? stgMatch[1] : 'N/A';
  const prodProject = prodMatch ? prodMatch[1] : 'N/A';

  const selectedEnv = await clack.select({
    message: 'Select environment',
    options: [
      { value: 'stg', label: 'STG', hint: `project: ${stgProject}` },
      { value: 'prod', label: 'PROD', hint: `project: ${prodProject}` },
    ],
  });
  if (clack.isCancel(selectedEnv)) { clack.cancel('Cancelled'); return; }

  const env = selectedEnv as 'stg' | 'prod';
  const currentProject = env === 'stg' ? stgProject : prodProject;

  if (currentProject === 'N/A') {
    clack.outro(chalk.red(`No fire-${env} target found in Makefile.`));
    return;
  }

  clack.log.info(`Current Firebase project (${env.toUpperCase()}): ${chalk.cyan(currentProject)}`);

  const newProject = await clack.text({
    message: 'New Firebase project ID',
    placeholder: currentProject,
    validate: (v) => {
      const val = (v ?? '').trim();
      if (!val) return 'Project ID is required';
      if (/\s/.test(val)) return 'Project ID cannot contain spaces';
    },
  });
  if (clack.isCancel(newProject)) { clack.cancel('Cancelled'); return; }

  const projectId = (newProject as string).trim();

  console.log('');
  clack.log.info(`App:        ${chalk.cyan(selectedApp)}`);
  clack.log.info(`Env:        ${chalk.cyan(env.toUpperCase())}`);
  clack.log.info(`Project:    ${chalk.cyan(currentProject)} → ${chalk.cyan(projectId)}`);
  console.log('');

  const confirmChange = await clack.confirm({
    message: 'Update Firebase project?',
    initialValue: true,
  });
  if (clack.isCancel(confirmChange) || !confirmChange) {
    clack.cancel('Cancelled');
    return;
  }

  const targetName = `fire-${env}`;
  const targetRegex = new RegExp(
    `(${targetName}:\\s*\\n\\tflutterfire configure[^]*?--project=)${escapeRegex(currentProject)}`
  );
  const updated = makefileContent.replace(targetRegex, `$1${projectId}`);

  if (updated === makefileContent) {
    clack.outro(chalk.yellow('No changes made. Target not found or project ID unchanged.'));
    return;
  }

  fs.writeFileSync(makefilePath, updated);
  clack.log.success(chalk.green('Makefile updated!'));
  clack.log.info(`Run: ${chalk.cyan(`cd apps/${selectedApp} && make ${targetName}`)}`);
  clack.outro('Done!');
}

export async function changeBundleIdFlow(monorepoRoot: string): Promise<void> {
  const appsDir = path.join(monorepoRoot, 'apps');
  const apps = getAppsList(monorepoRoot);

  if (apps.length === 0) {
    clack.outro(chalk.red('No apps found in the monorepo.'));
    return;
  }

  const selectedApp = await clack.select({
    message: 'Select app',
    options: apps.map(a => ({ value: a, label: a })),
  });
  if (clack.isCancel(selectedApp)) { clack.cancel('Cancelled'); return; }

  const appDir = path.join(appsDir, selectedApp as string);
  const flavorizrPath = path.join(appDir, 'flavorizr.yaml');
  if (!fs.existsSync(flavorizrPath)) {
    clack.outro(chalk.red('No flavorizr.yaml found for this app.'));
    return;
  }

  const flavorizrContent = fs.readFileSync(flavorizrPath, 'utf-8');

  const devAppId = flavorizrContent.match(/dev:[\s\S]*?android:\s*\n\s+applicationId:\s*["'](.+?)["']/);
  const prodAppId = flavorizrContent.match(/prod:[\s\S]*?android:\s*\n\s+applicationId:\s*["'](.+?)["']/);

  if (!devAppId && !prodAppId) {
    clack.outro(chalk.red('Could not parse bundle IDs from flavorizr.yaml.'));
    return;
  }

  const devBundleId = devAppId ? devAppId[1] : 'N/A';
  const prodBundleId = prodAppId ? prodAppId[1] : 'N/A';

  const selectedEnv = await clack.select({
    message: 'Select environment',
    options: [
      { value: 'dev', label: 'STG (dev)', hint: devBundleId },
      { value: 'prod', label: 'PROD', hint: prodBundleId },
    ],
  });
  if (clack.isCancel(selectedEnv)) { clack.cancel('Cancelled'); return; }

  const env = selectedEnv as 'dev' | 'prod';
  const currentBundleId = env === 'dev' ? devBundleId : prodBundleId;

  if (currentBundleId === 'N/A') {
    clack.outro(chalk.red(`No ${env} flavor found in flavorizr.yaml.`));
    return;
  }

  clack.log.info(`Current bundle ID (${env === 'dev' ? 'STG' : 'PROD'}): ${chalk.cyan(currentBundleId)}`);

  const newBundleId = await clack.text({
    message: 'New bundle ID',
    placeholder: currentBundleId,
    validate: (v) => {
      const val = (v ?? '').trim();
      if (!val) return 'Bundle ID is required';
      if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(val)) return 'Must be a valid reverse-domain identifier (e.g. com.example.app)';
    },
  });
  if (clack.isCancel(newBundleId)) { clack.cancel('Cancelled'); return; }

  const bundleId = (newBundleId as string).trim();

  console.log('');
  clack.log.info(`App:      ${chalk.cyan(selectedApp)}`);
  clack.log.info(`Env:      ${chalk.cyan(env === 'dev' ? 'STG' : 'PROD')}`);
  clack.log.info(`Bundle:   ${chalk.cyan(currentBundleId)} → ${chalk.cyan(bundleId)}`);
  console.log('');

  const confirmChange = await clack.confirm({
    message: 'Update bundle ID?',
    initialValue: true,
  });
  if (clack.isCancel(confirmChange) || !confirmChange) { clack.cancel('Cancelled'); return; }

  const escapedCurrent = escapeRegex(currentBundleId);
  let updatedFlavorizr = flavorizrContent;

  const flavorizrAppIdRegex = new RegExp(`(android:\\s*\\n\\s+applicationId:\\s*["'])${escapedCurrent}(["'])`);
  updatedFlavorizr = updatedFlavorizr.replace(flavorizrAppIdRegex, `$1${bundleId}$2`);

  const flavorizrIosRegex = new RegExp(`(ios:\\s*\\n\\s+bundleId:\\s*["'])${escapedCurrent}(["'])`);
  updatedFlavorizr = updatedFlavorizr.replace(flavorizrIosRegex, `$1${bundleId}$2`);

  if (updatedFlavorizr !== flavorizrContent) {
    fs.writeFileSync(flavorizrPath, updatedFlavorizr);
    clack.log.success('flavorizr.yaml updated');
  }

  const makefilePath = path.join(appDir, 'Makefile');
  if (fs.existsSync(makefilePath)) {
    let makefileContent = fs.readFileSync(makefilePath, 'utf-8');
    let makefileUpdated = false;

    const targets = env === 'dev' ? ['firebase', 'fire-stg'] : ['fire-prod'];
    for (const target of targets) {
      const targetRegex = new RegExp(
        `(${target}:\\s*\\n(?:\\s*#[^\\n]*\\n)*\\s*flutterfire configure[^]*?)(--ios-bundle-id=)${escapedCurrent}(\\s+--android-package-name=)${escapedCurrent}`
      );
      const newContent = makefileContent.replace(targetRegex, `$1$2${bundleId}$3${bundleId}`);
      if (newContent !== makefileContent) {
        makefileContent = newContent;
        makefileUpdated = true;
      }
    }

    if (makefileUpdated) {
      fs.writeFileSync(makefilePath, makefileContent);
      clack.log.success('Makefile updated');
    }
  }

  const exportOptionsPath = path.join(appDir, 'ExportOptions.plist');
  if (fs.existsSync(exportOptionsPath)) {
    let exportContent = fs.readFileSync(exportOptionsPath, 'utf-8');
    const exportRegex = new RegExp(`(<key>)${escapedCurrent}(</key>)`, 'g');
    const newExportContent = exportContent.replace(exportRegex, `$1${bundleId}$2`);
    if (newExportContent !== exportContent) {
      fs.writeFileSync(exportOptionsPath, newExportContent);
      clack.log.success('ExportOptions.plist updated');
    }
  }

  const envFile = env === 'dev' ? 'development.env.json' : 'production.env.json';
  const envPath = path.join(appDir, 'env', envFile);
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf-8');
    const envJson = JSON.parse(envContent);
    if (envJson.ANDROID_STORE_URL && envJson.ANDROID_STORE_URL.includes(currentBundleId)) {
      envJson.ANDROID_STORE_URL = envJson.ANDROID_STORE_URL.replace(currentBundleId, bundleId);
      fs.writeFileSync(envPath, JSON.stringify(envJson, null, 2) + '\n');
      clack.log.success(`${envFile} updated (ANDROID_STORE_URL)`);
    }
  }

  console.log('');
  clack.log.info(chalk.bold('Next steps:'));
  clack.log.info(`  1. Run flavors:   ${chalk.cyan(`cd apps/${selectedApp} && make flavors`)}`);
  clack.log.info(`  2. Run Firebase:  ${chalk.cyan(`cd apps/${selectedApp} && make ${env === 'dev' ? 'fire-stg' : 'fire-prod'}`)}`);

  const spinner = clack.spinner();
  spinner.start('Running flutter_flavorizr...');

  try {
    execSync('dart run flutter_flavorizr', { cwd: appDir, stdio: 'pipe' });
    spinner.stop('Flavors regenerated!');
  } catch {
    spinner.stop('Failed to run flutter_flavorizr');
    clack.log.warn(chalk.yellow('Run manually: make flavors'));
  }

  clack.outro(chalk.green('Done!'));
}

export async function changeAppNameFlow(monorepoRoot: string): Promise<void> {
  const appsDir = path.join(monorepoRoot, 'apps');
  const apps = getAppsList(monorepoRoot);

  if (apps.length === 0) {
    clack.outro(chalk.red('No apps found in the monorepo.'));
    return;
  }

  const selectedApp = await clack.select({
    message: 'Select app',
    options: apps.map(a => ({ value: a, label: a })),
  });
  if (clack.isCancel(selectedApp)) { clack.cancel('Cancelled'); return; }

  const flavorizrPath = path.join(appsDir, selectedApp as string, 'flavorizr.yaml');
  if (!fs.existsSync(flavorizrPath)) {
    clack.outro(chalk.red('No flavorizr.yaml found for this app.'));
    return;
  }

  const flavorizrContent = fs.readFileSync(flavorizrPath, 'utf-8');

  const devNameMatch = flavorizrContent.match(/dev:\s*\n\s+app:\s*\n\s+name:\s*["'](.+?)["']/);
  const prodNameMatch = flavorizrContent.match(/prod:\s*\n\s+app:\s*\n\s+name:\s*["'](.+?)["']/);

  if (!devNameMatch && !prodNameMatch) {
    clack.outro(chalk.red('Could not parse app names from flavorizr.yaml.'));
    return;
  }

  const devName = devNameMatch ? devNameMatch[1] : 'N/A';
  const prodName = prodNameMatch ? prodNameMatch[1] : 'N/A';

  const selectedEnv = await clack.select({
    message: 'Select environment',
    options: [
      { value: 'dev', label: 'STG (dev)', hint: devName },
      { value: 'prod', label: 'PROD', hint: prodName },
    ],
  });
  if (clack.isCancel(selectedEnv)) { clack.cancel('Cancelled'); return; }

  const env = selectedEnv as 'dev' | 'prod';
  const currentName = env === 'dev' ? devName : prodName;

  if (currentName === 'N/A') {
    clack.outro(chalk.red(`No ${env} flavor found in flavorizr.yaml.`));
    return;
  }

  clack.log.info(`Current app name (${env === 'dev' ? 'STG' : 'PROD'}): ${chalk.cyan(currentName)}`);

  const newName = await clack.text({
    message: 'New app name',
    placeholder: currentName,
    validate: (v) => {
      const val = (v ?? '').trim();
      if (!val) return 'App name is required';
    },
  });
  if (clack.isCancel(newName)) { clack.cancel('Cancelled'); return; }

  const appName = (newName as string).trim();

  console.log('');
  clack.log.info(`App:   ${chalk.cyan(selectedApp)}`);
  clack.log.info(`Env:   ${chalk.cyan(env === 'dev' ? 'STG' : 'PROD')}`);
  clack.log.info(`Name:  ${chalk.cyan(currentName)} → ${chalk.cyan(appName)}`);
  console.log('');

  const confirmChange = await clack.confirm({
    message: 'Update app name?',
    initialValue: true,
  });
  if (clack.isCancel(confirmChange) || !confirmChange) { clack.cancel('Cancelled'); return; }

  const escapedCurrent = escapeRegex(currentName);
  const flavorRegex = new RegExp(`(${env}:\\s*\\n\\s+app:\\s*\\n\\s+name:\\s*["'])${escapedCurrent}(["'])`);
  const updated = flavorizrContent.replace(flavorRegex, `$1${appName}$2`);

  if (updated === flavorizrContent) {
    clack.outro(chalk.yellow('No changes made. Name not found or unchanged.'));
    return;
  }

  fs.writeFileSync(flavorizrPath, updated);

  const spinner = clack.spinner();
  spinner.start('Running flutter_flavorizr...');

  try {
    execSync('dart run flutter_flavorizr', { cwd: path.join(appsDir, selectedApp as string), stdio: 'pipe' });
    spinner.stop('App name updated and flavors generated!');
    clack.outro(chalk.green('Done!'));
  } catch {
    spinner.stop('Failed to run flutter_flavorizr');
    clack.log.warn(chalk.yellow('flavorizr.yaml updated but flavor generation failed.'));
    clack.log.info(`Run manually: ${chalk.cyan(`cd apps/${selectedApp} && make flavors`)}`);
  }
}

export async function changeSplashColorFlow(monorepoRoot: string): Promise<void> {
  const appsDir = path.join(monorepoRoot, 'apps');
  const apps = getAppsList(monorepoRoot);

  if (apps.length === 0) {
    clack.outro(chalk.red('No apps found in the monorepo.'));
    return;
  }

  const selectedApp = await clack.select({
    message: 'Select app',
    options: apps.map(a => ({ value: a, label: a })),
  });
  if (clack.isCancel(selectedApp)) { clack.cancel('Cancelled'); return; }

  const pubspecPath = path.join(appsDir, selectedApp as string, 'pubspec.yaml');
  const pubspecContent = fs.readFileSync(pubspecPath, 'utf-8');

  const colorMatch = pubspecContent.match(/flutter_native_splash:\s*\n\s*color:\s*["']?(#[0-9A-Fa-f]{6})["']?/);
  const currentColor = colorMatch ? colorMatch[1] : '#000000';

  clack.log.info(`Current splash color: ${chalk.cyan(currentColor)}`);

  const newColor = await clack.text({
    message: 'New splash color (hex)',
    placeholder: currentColor,
    validate: (v) => {
      const val = (v ?? '').trim();
      if (!val) return 'Color is required';
      if (!/^#[0-9A-Fa-f]{6}$/.test(val)) return 'Must be a valid hex color (e.g. #FF0000)';
    },
  });
  if (clack.isCancel(newColor)) { clack.cancel('Cancelled'); return; }

  const color = (newColor as string).trim().toUpperCase();

  console.log('');
  clack.log.info(`App:   ${chalk.cyan(selectedApp)}`);
  clack.log.info(`Color: ${chalk.cyan(currentColor)} → ${chalk.cyan(color)}`);
  console.log('');

  const confirmChange = await clack.confirm({
    message: 'Update splash color?',
    initialValue: true,
  });
  if (clack.isCancel(confirmChange) || !confirmChange) { clack.cancel('Cancelled'); return; }

  let updated = pubspecContent;
  const splashRegex = /(flutter_native_splash:\s*\n(?:.*\n)*?\s*color:\s*["']?)#[0-9A-Fa-f]{6}(["']?)/g;
  updated = updated.replace(splashRegex, `$1${color}$2`);

  fs.writeFileSync(pubspecPath, updated);

  const spinner = clack.spinner();
  spinner.start('Generating splash screens...');

  try {
    execSync('dart run flutter_native_splash:create', { cwd: path.join(appsDir, selectedApp as string), stdio: 'pipe' });
    spinner.stop('Splash screens generated!');
    clack.outro(chalk.green('Done!'));
  } catch {
    spinner.stop('Failed to generate splash screens');
    clack.log.warn(chalk.yellow('Color updated in pubspec.yaml but splash generation failed.'));
    clack.log.info(`Run manually: ${chalk.cyan(`cd apps/${selectedApp} && make splash`)}`);
  }
}

export async function manageEntitlementsFlow(monorepoRoot: string): Promise<void> {
  const appsDir = path.join(monorepoRoot, 'apps');
  const apps = getAppsList(monorepoRoot);

  if (apps.length === 0) {
    clack.outro(chalk.red('No apps found in the monorepo.'));
    return;
  }

  const selectedApp = await clack.select({
    message: 'Select app',
    options: apps.map(a => ({ value: a, label: a })),
  });
  if (clack.isCancel(selectedApp)) { clack.cancel('Cancelled'); return; }

  const appDir = path.join(appsDir, selectedApp as string);
  const entitlementsPath = path.join(appDir, 'ios', 'Runner', 'Runner.entitlements');

  const EMPTY_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
`;

  if (!fs.existsSync(entitlementsPath)) {
    const runnerDir = path.dirname(entitlementsPath);
    if (!fs.existsSync(runnerDir)) {
      fs.mkdirSync(runnerDir, { recursive: true });
    }
    fs.writeFileSync(entitlementsPath, EMPTY_ENTITLEMENTS);
    clack.log.success('Created Runner.entitlements');
  }

  let content = fs.readFileSync(entitlementsPath, 'utf-8');

  const hasPush = /<key>aps-environment<\/key>/.test(content);
  const associatedDomainsMatch = content.match(/<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/);
  const hasAssociatedDomains = !!associatedDomainsMatch;
  const currentDomains: string[] = [];
  if (hasAssociatedDomains) {
    const domainMatches = associatedDomainsMatch![1].matchAll(/<string>([^<]+)<\/string>/g);
    for (const dm of domainMatches) {
      currentDomains.push(dm[1]);
    }
  }

  clack.log.info('Entitlements configure iOS app capabilities.');
  clack.log.info(`Push Notifications: ${hasPush ? chalk.green('enabled') : chalk.gray('disabled')}`);
  if (hasAssociatedDomains && currentDomains.length > 0) {
    clack.log.info(`Associated Domains: ${chalk.cyan(currentDomains.join(', '))}`);
  } else {
    clack.log.info(`Associated Domains: ${chalk.gray('none')}`);
  }

  async function showMenu(): Promise<void> {
    const currentContent = fs.readFileSync(entitlementsPath, 'utf-8');
    const pushEnabled = /<key>aps-environment<\/key>/.test(content);
    const adMatch = currentContent.match(/<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/);
    const domains: string[] = [];
    if (adMatch) {
      for (const dm of adMatch[1].matchAll(/<string>([^<]+)<\/string>/g)) {
        domains.push(dm[1]);
      }
    }

    const action = await clack.select({
      message: 'Entitlements configuration',
      options: [
        {
          value: 'toggle-push',
          label: pushEnabled ? 'Disable Push Notifications' : 'Enable Push Notifications',
          hint: pushEnabled ? 'Remove aps-environment' : 'Add aps-environment (production)',
        },
        {
          value: 'add-domains',
          label: 'Configure Associated Domains',
          hint: hasAssociatedDomains ? `Current: ${domains.filter(d => d.startsWith('applinks:')).map(d => d.replace('applinks:', '')).join(', ') || 'none'}` : 'No domains configured',
        },
        {
          value: 'remove-domains',
          label: 'Remove Associated Domains',
          hint: hasAssociatedDomains ? 'Remove all applinks + webcredentials' : 'No domains to remove',
        },
        { value: 'done', label: 'Done', hint: 'Go back' },
      ],
    });
    if (clack.isCancel(action)) { clack.cancel('Cancelled'); return; }

    let updated = currentContent;

    switch (action) {
      case 'toggle-push': {
        if (pushEnabled) {
          updated = updated.replace(/\s*<key>aps-environment<\/key>\s*\n\s*<string>production<\/string>/, '');
        } else {
          updated = updated.replace('</dict>', `\t<key>aps-environment</key>\n\t<string>production</string>\n</dict>`);
        }
        fs.writeFileSync(entitlementsPath, updated);
        content = updated;
        clack.log.success(pushEnabled ? 'Push notifications disabled' : 'Push notifications enabled (production)');
        await showMenu();
        break;
      }

      case 'add-domains': {
        const domain = await clack.text({
          message: 'Domain (e.g., www.jumbo.com.ar)',
          placeholder: 'www.example.com',
          validate: (v) => {
            const val = (v ?? '').trim();
            if (!val) return 'Domain is required';
            if (!/^[\w.-]+$/.test(val)) return 'Invalid domain format';
          },
        });
        if (clack.isCancel(domain)) { await showMenu(); return; }

        const domainStr = (domain as string).trim();
        const applink = `applinks:${domainStr}`;
        const webcred = `webcredentials:${domainStr}`;

        if (updated.includes(applink) && updated.includes(webcred)) {
          clack.log.info(chalk.yellow('Domain already configured'));
          await showMenu();
          return;
        }

        const existingAdMatch = updated.match(/<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/);
        if (existingAdMatch) {
          let arrayContent = existingAdMatch[1];
          if (!arrayContent.includes(applink)) {
            arrayContent += `\n\t\t<string>${applink}</string>`;
          }
          if (!arrayContent.includes(webcred)) {
            arrayContent += `\n\t\t<string>${webcred}</string>`;
          }
          updated = updated.replace(
            /(<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>)([\s\S]*?)(<\/array>)/,
            `$1${arrayContent}\n\t$3`,
          );
        } else {
          const block = `\t<key>com.apple.developer.associated-domains</key>\n\t<array>\n\t\t<string>${applink}</string>\n\t\t<string>${webcred}</string>\n\t</array>`;
          updated = updated.replace('</dict>', `${block}\n</dict>`);
        }

        fs.writeFileSync(entitlementsPath, updated);
        content = updated;
        clack.log.success(`Associated domains configured for ${chalk.cyan(domainStr)}`);
        await showMenu();
        break;
      }

      case 'remove-domains': {
        if (!hasAssociatedDomains) {
          clack.log.info(chalk.yellow('No associated domains to remove'));
          await showMenu();
          return;
        }
        updated = updated.replace(/\s*<key>com\.apple\.developer\.associated-domains<\/key>\s*\n\s*<array>[\s\S]*?<\/array>/, '');
        fs.writeFileSync(entitlementsPath, updated);
        content = updated;
        clack.log.success('Associated domains removed');
        await showMenu();
        break;
      }

      case 'done':
        clack.outro(chalk.green('Done!'));
        break;
    }
  }

  await showMenu();
}

export async function appFlow(): Promise<void> {
  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (!monorepoRoot) {
    clack.outro(chalk.red('Not inside a monorepo. Run from within a Melos monorepo.'));
    return;
  }

  clack.log.info(`Monorepo: ${chalk.cyan(path.relative(os.homedir(), monorepoRoot))}`);

  const action = await clack.select({
    message: 'What do you want to do in App?',
    options: [
      { value: 'new-app', label: 'New App', hint: 'Create a new app in the monorepo' },
      { value: 'app-type', label: 'App Type', hint: 'Manage AppType countries in localization' },
      { value: 'change-splash', label: 'Change Splash Color', hint: 'Update native splash screen color' },
      { value: 'change-firebase', label: 'Change Firebase Project', hint: 'Update Firebase project in Makefile' },
      { value: 'change-app-name', label: 'Change App Name', hint: 'Update app display name (Android & iOS)' },
      { value: 'change-bundle-id', label: 'Change Bundle ID', hint: 'Update bundle ID / application ID (Android & iOS)' },
      { value: 'manage-entitlements', label: 'Manage Entitlements', hint: 'Configure iOS capabilities (push notifications, universal links)' },
    ],
  });

  if (clack.isCancel(action)) { clack.cancel('Cancelled'); return; }

  switch (action as AppAction) {
    case 'new-app':
      await newAppFlow(monorepoRoot);
      break;
    case 'app-type':
      await appTypeFlow(monorepoRoot);
      break;
    case 'change-splash':
      await changeSplashColorFlow(monorepoRoot);
      break;
    case 'change-firebase':
      await changeFirebaseProjectFlow(monorepoRoot);
      break;
    case 'change-app-name':
      await changeAppNameFlow(monorepoRoot);
      break;
    case 'change-bundle-id':
      await changeBundleIdFlow(monorepoRoot);
      break;
    case 'manage-entitlements':
      await manageEntitlementsFlow(monorepoRoot);
      break;
  }
}

async function newAppFlow(monorepoRoot: string): Promise<void> {
  const appName = await clack.text({
    message: 'App name (cc_brand, e.g., co_jumbo)',
    placeholder: 'co_jumbo',
    validate: (v) => {
      const val = v ?? '';
      if (!val.trim()) return 'App name is required';
      if (!/^[a-z]{2}_[a-z][a-z0-9]*$/.test(val.trim())) return 'Must follow pattern: cc_brand (e.g., co_jumbo, ar_disco, br_prezunic)';
    },
  });
  if (clack.isCancel(appName)) { clack.cancel('Cancelled'); return; }

  const appNameStr = (appName as string).trim();
  const underscoreIdx = appNameStr.indexOf('_');
  const countryCodeLower = appNameStr.substring(0, underscoreIdx);
  const brand = appNameStr.substring(underscoreIdx + 1);
  const countryCode = countryCodeLower.toUpperCase();

  const brandDisplayName = await clack.text({
    message: 'Brand display name (e.g., Jumbo)',
    placeholder: brand.charAt(0).toUpperCase() + brand.slice(1),
    validate: (v) => {
      const val = v ?? '';
      if (!val.trim()) return 'Brand display name is required';
      if (!/^[a-zA-ZÀ-ÿ\s]+$/.test(val.trim())) return 'Only letters and spaces allowed';
    },
  });
  if (clack.isCancel(brandDisplayName)) { clack.cancel('Cancelled'); return; }

  const appTypePath = path.join(monorepoRoot, 'packages', 'localization', 'lib', 'enum', 'app_type.dart');

  let appType: string | undefined;
  while (!appType) {
    const existingTypes = parseAppTypes(appTypePath);

    const appTypeOption = await clack.select({
      message: 'AppType (from localization package)',
      options: [
        ...existingTypes.map(t => ({
          value: t.name,
          label: t.name.charAt(0).toUpperCase() + t.name.slice(1),
          hint: t.defaultLocale,
        })),
        { value: '__create_new__', label: '+ Crear nuevo AppType', hint: 'No encuentras tu país?' },
      ],
    });
    if (clack.isCancel(appTypeOption)) { clack.cancel('Cancelled'); return; }

    if (appTypeOption === '__create_new__') {
      await newAppTypeFlow(monorepoRoot);
      continue;
    }

    appType = appTypeOption as string;
  }

  const splashColor = '#000000';
  const parsedTypes = parseAppTypes(appTypePath);
  const selectedType = parsedTypes.find(t => t.name === appType);
  const countryDisplayName = selectedType
    ? selectedType.name.charAt(0).toUpperCase() + selectedType.name.slice(1)
    : countryCode;
  const themePath = `${brand}/${brand}-${countryCode}`;
  const devBundleId = `com.cencosud.${countryCodeLower}.${brand}.test`;
  const prodBundleId = `com.cencosud.${countryCodeLower}.${brand}`;
  const firebaseProjectTest = `${countryCodeLower}-${brand}-appwl-test`;
  const firebaseProjectProd = `${countryCodeLower}-${brand}-appwl-prod`;

  console.log('');
  clack.log.info(`App:          ${chalk.cyan(appNameStr)}`);
  clack.log.info(`Brand:        ${chalk.cyan(brand)}`);
  clack.log.info(`Country:      ${chalk.cyan(countryCode)} (${countryDisplayName})`);
  clack.log.info(`AppType:      ${chalk.cyan(appType)}`);
  clack.log.info(`Splash color: ${chalk.cyan(splashColor)}`);
  clack.log.info(`Theme:        ${chalk.cyan(themePath)}`);
  clack.log.info(`Dev bundle:   ${chalk.cyan(devBundleId)}`);
  clack.log.info(`Prod bundle:  ${chalk.cyan(prodBundleId)}`);
  clack.log.info(`Firebase:     ${chalk.cyan(firebaseProjectTest)} / ${chalk.cyan(firebaseProjectProd)}`);
  console.log('');

  const confirmCreate = await clack.confirm({
    message: 'Create this app?',
    initialValue: true,
  });
  if (clack.isCancel(confirmCreate) || !confirmCreate) { clack.cancel('Cancelled'); return; }

  const spinner = clack.spinner();
  spinner.start('Creating app...');

  try {
    await createApp({
      monorepoRoot,
      appName: appNameStr,
      brand,
      brandDisplayName: (brandDisplayName as string).trim(),
      countryCode,
      countryDisplayName,
      appType: appType as string,
      splashColor: (splashColor as string).trim(),
      themePath,
      devBundleId,
      prodBundleId,
      androidNamespace: prodBundleId,
      firebaseProjectTest,
      firebaseProjectProd,
    });
    spinner.stop('App created');
    clack.outro(chalk.green('Done! App created successfully.'));
  } catch (error) {
    spinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

async function appTypeFlow(monorepoRoot: string): Promise<void> {
  const action = await clack.select({
    message: 'App Type management',
    options: [
      { value: 'new', label: 'New App Type', hint: 'Add a new country AppType to localization' },
      { value: 'edit', label: 'Edit App Type', hint: 'Edit an existing AppType locale configuration' },
    ],
  });

  if (clack.isCancel(action)) { clack.cancel('Cancelled'); return; }

  switch (action as 'new' | 'edit') {
    case 'new':
      await newAppTypeFlow(monorepoRoot);
      break;
    case 'edit':
      await editAppTypeFlow(monorepoRoot);
      break;
  }
}

async function newAppTypeFlow(monorepoRoot: string): Promise<void> {
  const appTypePath = path.join(monorepoRoot, 'packages', 'localization', 'lib', 'enum', 'app_type.dart');

  if (!fs.existsSync(appTypePath)) {
    clack.outro(chalk.red('app_type.dart not found in packages/localization'));
    return;
  }

  const existingTypes = parseAppTypes(appTypePath);

  const country = await clack.select({
    message: 'Select the country for the new AppType',
    options: SUPPORTED_COUNTRIES.map(c => ({
      value: c,
      label: c.name,
      hint: `${c.locale} (${c.language})`,
    })),
  });
  if (clack.isCancel(country)) { clack.cancel('Cancelled'); return; }

  const selectedCountry = country as typeof SUPPORTED_COUNTRIES[number];
  const enumName = countryToEnumName(selectedCountry.name);

  if (existingTypes.some(t => t.name === enumName)) {
    const shouldEdit = await clack.confirm({
      message: `AppType "${enumName}" already exists. Do you want to edit it instead?`,
      initialValue: true,
    });
    if (clack.isCancel(shouldEdit) || !shouldEdit) { clack.cancel('Cancelled'); return; }
    await editAppTypeFlow(monorepoRoot, enumName);
    return;
  }

  console.log('');
  clack.log.info(`Country:       ${chalk.cyan(selectedCountry.name)}`);
  clack.log.info(`Enum name:     ${chalk.cyan(enumName)}`);
  clack.log.info(`Locale:        ${chalk.cyan(selectedCountry.locale)}`);
  clack.log.info(`Language:      ${chalk.cyan(selectedCountry.language)}`);
  clack.log.info(`Timezone:      ${chalk.cyan(selectedCountry.timezone)}`);
  console.log('');

  const confirmCreate = await clack.confirm({
    message: 'Create this AppType?',
    initialValue: true,
  });
  if (clack.isCancel(confirmCreate) || !confirmCreate) { clack.cancel('Cancelled'); return; }

  const spinner = clack.spinner();
  spinner.start('Creating AppType...');

  try {
    await createAppType(monorepoRoot, selectedCountry);
    spinner.stop('AppType created');
    clack.outro(chalk.green('Done! AppType created successfully.'));
  } catch (error) {
    spinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}

async function editAppTypeFlow(monorepoRoot: string, preselectedType?: string): Promise<void> {
  const appTypePath = path.join(monorepoRoot, 'packages', 'localization', 'lib', 'enum', 'app_type.dart');
  const i18nDir = path.join(monorepoRoot, 'packages', 'localization', 'lib', 'i18n');

  if (!fs.existsSync(appTypePath)) {
    clack.outro(chalk.red('app_type.dart not found in packages/localization'));
    return;
  }

  const existingTypes = parseAppTypes(appTypePath);
  if (existingTypes.length === 0) {
    clack.outro(chalk.red('No AppTypes found in app_type.dart'));
    return;
  }

  let selectedTypeName: string;

  if (preselectedType) {
    selectedTypeName = preselectedType;
  } else {
    const appTypeOption = await clack.select({
      message: 'Select AppType to edit',
      options: existingTypes.map(t => ({
        value: t.name,
        label: t.name.charAt(0).toUpperCase() + t.name.slice(1),
        hint: `default: ${t.defaultLocale}, supported: ${t.supportedLocales.join(', ')}`,
      })),
    });
    if (clack.isCancel(appTypeOption)) { clack.cancel('Cancelled'); return; }
    selectedTypeName = appTypeOption as string;
  }

  const target = existingTypes.find(t => t.name === selectedTypeName);
  if (!target) {
    clack.outro(chalk.red(`AppType "${selectedTypeName}" not found`));
    return;
  }

  const existingLocales = discoverExistingLocales(i18nDir);
  if (existingLocales.length === 0) {
    clack.outro(chalk.red('No i18n locale files found'));
    return;
  }

  const defaultLocale = await clack.select({
    message: 'Select default locale',
    options: existingLocales.map(loc => ({
      value: loc,
      label: loc,
      hint: loc === target.defaultLocale ? 'current' : undefined,
    })),
    initialValue: target.defaultLocale,
  });
  if (clack.isCancel(defaultLocale)) { clack.cancel('Cancelled'); return; }

  const supportedLocales = await clack.multiselect({
    message: 'Select supported locales (space to toggle)',
    options: existingLocales.map(loc => ({
      value: loc,
      label: loc,
      selected: target.supportedLocales.includes(loc),
    })),
    required: true,
  });
  if (clack.isCancel(supportedLocales) || (supportedLocales as string[]).length === 0) {
    clack.cancel('Cancelled');
    return;
  }

  const newDefault = defaultLocale as string;
  const newSupported = supportedLocales as string[];

  if (!newSupported.includes(newDefault)) {
    newSupported.push(newDefault);
  }

  console.log('');
  clack.log.info(`AppType:           ${chalk.cyan(selectedTypeName)}`);
  clack.log.info(`Default locale:    ${chalk.cyan(newDefault)}`);
  clack.log.info(`Supported locales: ${chalk.cyan(newSupported.join(', '))}`);
  console.log('');

  const confirmEdit = await clack.confirm({
    message: 'Save changes?',
    initialValue: true,
  });
  if (clack.isCancel(confirmEdit) || !confirmEdit) { clack.cancel('Cancelled'); return; }

  const spinner = clack.spinner();
  spinner.start('Updating AppType...');

  try {
    await editAppType(monorepoRoot, selectedTypeName, newDefault, newSupported);
    spinner.stop('AppType updated');
    clack.outro(chalk.green('Done! AppType updated successfully.'));
  } catch (error) {
    spinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}
