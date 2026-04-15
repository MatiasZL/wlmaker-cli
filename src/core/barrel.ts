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
