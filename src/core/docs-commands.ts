import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import YAML from 'yaml';
import { findMonorepoRoot } from './project-analyzer.js';

export interface CommandEntry {
  name: string;
  description: string;
  source: 'Makefile' | 'melos';
  file: string;
}

/**
 * Parse a Makefile and extract .PHONY targets with their preceding comments
 * as descriptions. Handles comment blocks directly above a target.
 */
export function parseMakefile(filePath: string): CommandEntry[] {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const commands: CommandEntry[] = [];
  const source = path.basename(filePath);

  let pendingComments: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Collect comment lines
    if (line.startsWith('#')) {
      const commentText = line.replace(/^#+\s?/, '').trim();
      if (commentText) pendingComments.push(commentText);
      continue;
    }

    // Match a target definition: `name:` or `name: ...`
    const targetMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/);
    if (targetMatch) {
      const name = targetMatch[1];
      // Skip internal / pattern targets
      if (name.startsWith('.') || name === 'Makefile') {
        pendingComments = [];
        continue;
      }
      commands.push({
        name,
        description: pendingComments.join(' ').trim() || '',
        source: 'Makefile',
        file: source,
      });
      pendingComments = [];
    } else if (line.trim() !== '') {
      // Non-comment, non-target, non-blank line resets comments
      pendingComments = [];
    }
  }

  return commands;
}

/**
 * Parse melos.yaml scripts section.
 */
export function parseMelosScripts(filePath: string): CommandEntry[] {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = YAML.parse(content);
  const scripts = parsed?.scripts;
  if (!scripts || typeof scripts !== 'object') return [];

  const commands: CommandEntry[] = [];
  const source = path.basename(filePath);

  for (const [name, value] of Object.entries(scripts)) {
    let description = '';
    let command = '';

    if (typeof value === 'string') {
      command = value;
    } else if (typeof value === 'object' && value !== null) {
      description = (value as Record<string, unknown>).description as string ?? '';
      command = ((value as Record<string, unknown>).run as string) ??
        ((value as Record<string, unknown>).exec as string) ?? '';
    }

    commands.push({
      name,
      description: description || command,
      source: 'melos',
      file: source,
    });
  }

  return commands;
}

/**
 * Discover commands from Makefile, melos.yaml, and book/Makefile.
 */
export function discoverCommands(startDir: string): CommandEntry[] {
  const root = findMonorepoRoot(startDir) ?? startDir;
  const commands: CommandEntry[] = [];

  // Root Makefile
  const rootMakefile = path.join(root, 'Makefile');
  commands.push(...parseMakefile(rootMakefile));

  // melos.yaml
  const melosFile = path.join(root, 'melos.yaml');
  commands.push(...parseMelosScripts(melosFile));

  // book/Makefile (Docusaurus commands)
  const bookMakefile = path.join(root, 'book', 'Makefile');
  commands.push(...parseMakefile(bookMakefile));

  return commands;
}

/**
 * Print commands grouped by source with formatted output.
 */
export function displayCommands(commands: CommandEntry[]): void {
  if (commands.length === 0) {
    console.log(chalk.yellow('No commands found.'));
    return;
  }

  // Group by source
  const groups = new Map<string, CommandEntry[]>();
  for (const cmd of commands) {
    const key = `${cmd.source} (${cmd.file})`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(cmd);
  }

  for (const [group, entries] of groups) {
    console.log(chalk.bold(chalk.cyan(`\n${group}`)));
    console.log(chalk.cyan('─'.repeat(group.length)));

    const maxNameLen = Math.max(...entries.map((e) => e.name.length));

    for (const entry of entries) {
      const name = chalk.white(entry.name.padEnd(maxNameLen + 2));
      const desc = entry.description
        ? chalk.gray(entry.description)
        : chalk.dim('(no description)');
      console.log(`  ${name} ${desc}`);
    }
  }

  console.log(); // trailing newline
}
