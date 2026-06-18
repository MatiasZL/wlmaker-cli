import * as fs from 'fs';
import * as path from 'path';

/** Write a file, creating parent directories if needed. */
export function write(filePath: string, content: string | Buffer): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
}

/** Ensure a directory exists (recursive). */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/** Recursively search a directory for a file by name. */
export function findFileRecursive(dir: string, fileName: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const result = findFileRecursive(fullPath, fileName);
      if (result) return result;
    } else if (entry.name === fileName) {
      return fullPath;
    }
  }
  return null;
}

/** Search all immediate packages/ subdirs for a given file name (recursively). */
export function findFileInPackages(packagesDir: string, fileName: string): string | null {
  if (!fs.existsSync(packagesDir)) return null;
  const packages = fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(packagesDir, d.name));

  for (const pkgDir of packages) {
    const found = findFileRecursive(pkgDir, fileName);
    if (found) return found;
  }
  return null;
}

/**
 * Recursively search a directory for a .dart file that declares `class ClassName`.
 * Uses word-boundary regex so 'class AppConfig' does NOT match 'class AppConfigModel'.
 */
export function findClassFileRecursive(dir: string, className: string): string | null {
  const classRegex = new RegExp(`\\bclass\\s+${className}\\b`);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const result = findClassFileRecursive(fullPath, className);
      if (result) return result;
    } else if (entry.name.endsWith('.dart') && !entry.name.endsWith('.g.dart')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (classRegex.test(content)) {
        return fullPath;
      }
    }
  }
  return null;
}

/**
 * Search all packages/ subdirs for a .dart file that declares a given class.
 */
export function findClassInPackages(packagesDir: string, className: string): string | null {
  if (!fs.existsSync(packagesDir)) return null;
  const packages = fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(packagesDir, d.name));

  for (const pkgDir of packages) {
    const found = findClassFileRecursive(pkgDir, className);
    if (found) return found;
  }
  return null;
}

/** Find a .code-workspace file in the given directory. */
export function findWorkspaceFile(monorepoRoot: string): string | null {
  const files = fs.readdirSync(monorepoRoot);
  return files.find((f) => f.endsWith('.code-workspace')) ?? null;
}

/** Capitalize the first letter of each word. */
export function capitalize(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Escape a string for use in a regex pattern. */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
