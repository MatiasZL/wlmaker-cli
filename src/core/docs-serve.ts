import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { findMonorepoRoot } from './project-analyzer.js';

/**
 * Walk upward from startDir looking for a book/ directory that contains
 * a Docusaurus config file (docusaurus.config.js / docusaurus.config.ts).
 */
export function detectBookDir(startDir: string): string | undefined {
  const root = findMonorepoRoot(startDir) ?? startDir;

  // Check book/ under monorepo root
  const bookDir = path.join(root, 'book');
  if (
    fs.existsSync(bookDir) &&
    (fs.existsSync(path.join(bookDir, 'docusaurus.config.js')) ||
      fs.existsSync(path.join(bookDir, 'docusaurus.config.ts')) ||
      fs.existsSync(path.join(bookDir, 'docusaurus.config.mjs')))
  ) {
    return bookDir;
  }

  return undefined;
}

/**
 * Run `npm install` if node_modules is missing, then start the
 * Docusaurus dev server via `npm run start`.
 */
export function serveBook(bookDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const nodeModules = path.join(bookDir, 'node_modules');

    // Install dependencies if needed
    if (!fs.existsSync(nodeModules)) {
      console.log(chalk.cyan('Installing book dependencies...'));
      const install = spawn('npm', ['install'], {
        cwd: bookDir,
        stdio: 'inherit',
      });

      install.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`npm install failed with code ${code}`));
          return;
        }
        startDevServer(bookDir, resolve);
      });

      install.on('error', (err) => {
        reject(err);
      });
    } else {
      startDevServer(bookDir, resolve);
    }
  });
}

function startDevServer(bookDir: string, done: () => void): void {
  const child = spawn('npm', ['run', 'start'], {
    cwd: bookDir,
    stdio: 'inherit',
  });

  child.on('close', () => {
    done();
  });

  child.on('error', () => {
    done();
  });
}
