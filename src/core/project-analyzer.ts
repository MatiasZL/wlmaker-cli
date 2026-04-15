import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

export interface ProjectInfo {
  projectRoot: string;
  projectName: string;
  hasFreezed: boolean;
  hasBloc: boolean;
  hasBuildRunner: boolean;
  features: string[];
}

export function analyzeProject(startDir: string): ProjectInfo | null {
  const projectRoot = findPubspecDir(startDir);
  if (!projectRoot) return null;

  const pubspecPath = path.join(projectRoot, 'pubspec.yaml');
  const content = fs.readFileSync(pubspecPath, 'utf8');
  const pubspec = YAML.parse(content);

  const deps = {
    ...pubspec?.dependencies,
    ...pubspec?.dev_dependencies,
  };

  const features = discoverFeatures(projectRoot);

  return {
    projectRoot,
    projectName: pubspec?.name ?? path.basename(projectRoot),
    hasFreezed: 'freezed' in deps || 'freezed_annotation' in deps,
    hasBloc: 'flutter_bloc' in deps || 'bloc' in deps,
    hasBuildRunner: 'build_runner' in deps,
    features,
  };
}

function findPubspecDir(startDir: string): string | undefined {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return undefined;
}

function discoverFeatures(projectRoot: string): string[] {
  const featuresDir = path.join(projectRoot, 'lib', 'features');
  if (!fs.existsSync(featuresDir)) return [];

  return fs
    .readdirSync(featuresDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}
