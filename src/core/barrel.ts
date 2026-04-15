import * as fs from 'fs';
import * as path from 'path';

export function updateBarrelFile(parentDir: string, name: string): void {
  const barrelPath = path.join(parentDir, 'bloc.dart');
  const exportLine = `export '${name}/${name}_bloc.dart';`;

  if (fs.existsSync(barrelPath)) {
    const content = fs.readFileSync(barrelPath, 'utf8');
    if (content.includes(exportLine)) {
      return;
    }
    fs.writeFileSync(barrelPath, content.trimEnd() + '\n' + exportLine + '\n');
  } else {
    fs.writeFileSync(barrelPath, exportLine + '\n');
  }
}

export function updateSortedBarrelFile(
  tierDir: string,
  barrelFileName: string,
  exportLine: string,
): void {
  const barrelPath = path.join(tierDir, barrelFileName);

  let lines: string[] = [];

  if (fs.existsSync(barrelPath)) {
    const content = fs.readFileSync(barrelPath, 'utf8');
    lines = content.split('\n').filter((l) => l.trim().length > 0);
  }

  if (lines.includes(exportLine)) {
    return;
  }

  lines.push(exportLine);
  lines.sort();

  fs.writeFileSync(barrelPath, lines.join('\n') + '\n');
}
