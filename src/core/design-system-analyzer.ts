import * as fs from 'fs';
import * as path from 'path';
import { findMonorepoRoot } from './project-analyzer.js';
import { type Tier, VALID_TIERS, tierPlural } from './tier.js';

export interface DesignSystemInfo {
  componentsDir: string;
  widgetbookDir?: string;
  availableTiers: string[];
}

export function detectDesignSystem(
  projectRoot: string,
): DesignSystemInfo | null {
  // 1. Monorepo: look for packages/design_system/lib/wl_design_system/
  const monorepoRoot = findMonorepoRoot(projectRoot);
  if (monorepoRoot) {
    const dsDir = path.join(
      monorepoRoot,
      'packages',
      'design_system',
      'lib',
      'wl_design_system',
    );
    if (fs.existsSync(dsDir)) {
      const widgetbookDir = path.join(monorepoRoot, 'apps', 'widgetbook');
      return {
        componentsDir: dsDir,
        widgetbookDir: fs.existsSync(widgetbookDir) ? widgetbookDir : undefined,
        availableTiers: discoverTiers(dsDir),
      };
    }
  }

  // 2. Standalone: look for lib/wl_design_system/ in the project
  const standaloneDir = path.join(projectRoot, 'lib', 'wl_design_system');
  if (fs.existsSync(standaloneDir)) {
    const widgetbookDir = path.join(
      path.dirname(projectRoot),
      'widgetbook',
    );
    return {
      componentsDir: standaloneDir,
      widgetbookDir: fs.existsSync(widgetbookDir) ? widgetbookDir : undefined,
      availableTiers: discoverTiers(standaloneDir),
    };
  }

  return null;
}

function discoverTiers(componentsDir: string): string[] {
  const tiers: string[] = [];
  const tierSet = new Set(VALID_TIERS.map((t) => tierPlural(t)));

  try {
    const entries = fs.readdirSync(componentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && tierSet.has(entry.name)) {
        tiers.push(entry.name);
      }
    }
  } catch {
    // ignore read errors
  }

  return tiers;
}

export function widgetExists(
  componentsDir: string,
  tierPluralName: string,
  widgetName: string,
): boolean {
  const tierDir = path.join(componentsDir, tierPluralName);
  // Check flat file
  const flatFile = path.join(tierDir, `${widgetName}.dart`);
  if (fs.existsSync(flatFile)) return true;
  // Check subdirectory (wl_ prefixed)
  const subDir = path.join(tierDir, widgetName);
  if (fs.existsSync(subDir)) return true;
  // Check subdirectory (without wl_ prefix, e.g. templates use bare name)
  const bareName = widgetName.startsWith('wl_') ? widgetName.slice(3) : widgetName;
  if (bareName !== widgetName) {
    const bareSubDir = path.join(tierDir, bareName);
    if (fs.existsSync(bareSubDir)) return true;
  }
  return false;
}

export function resolveWidgetExportPath(
  tier: Tier,
  name: string,
): string {
  const plural = tierPlural(tier);
  // Templates export the _template.dart file
  if (tier === 'template') {
    return `export '${name}/wl_${name}_template.dart';`;
  }
  // For subdirectory patterns, export from subdirectory
  // For flat patterns, export the file directly
  return `export 'wl_${name}.dart';`;
}
