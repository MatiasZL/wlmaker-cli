import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function findPubspecDir(startDir: string): string | undefined {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return undefined;
}

export function hasBuildRunner(projectRoot: string): boolean {
  const pubspec = fs.readFileSync(path.join(projectRoot, 'pubspec.yaml'), 'utf8');
  return /build_runner/.test(pubspec);
}

export function runBuildRunner(projectRoot: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(
      'dart',
      ['run', 'build_runner', 'build', '--delete-conflicting-outputs'],
      { cwd: projectRoot, stdio: 'inherit' },
    );

    child.on('close', (code) => {
      resolve();
    });

    child.on('error', () => {
      resolve();
    });
  });
}
