import * as fs from 'fs';

export function injectMethod(
  filePath: string,
  className: string,
  methodCode: string,
  dedupKey?: string,
): void {
  const content = fs.readFileSync(filePath, 'utf8');

  // Check if method already exists (by dedupKey or first non-annotation line)
  const dedup = dedupKey ?? findSignature(methodCode);
  if (dedup && content.includes(dedup)) {
    return; // Already exists
  }

  // Find the class declaration
  const classRegex = new RegExp(`class\\s+${className}\\s*[^{]*\\{`);
  const classMatch = content.match(classRegex);
  if (!classMatch) {
    throw new Error(`Class "${className}" not found in ${filePath}`);
  }

  const classStart = content.indexOf(classMatch[0]);

  // Track braces to find the end of the class
  let braceCount = 0;
  let classEnd = -1;
  let foundOpen = false;

  for (let i = classStart; i < content.length; i++) {
    if (content[i] === '{') {
      braceCount++;
      foundOpen = true;
    } else if (content[i] === '}') {
      braceCount--;
      if (foundOpen && braceCount === 0) {
        classEnd = i;
        break;
      }
    }
  }

  if (classEnd === -1) {
    throw new Error(`Could not find closing brace for class "${className}" in ${filePath}`);
  }

  // Insert method before the closing brace with proper indentation
  const indentedMethod = methodCode
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}` : ''))
    .join('\n');

  const newContent =
    content.slice(0, classEnd) +
    '\n' +
    indentedMethod +
    '\n' +
    content.slice(classEnd);

  fs.writeFileSync(filePath, newContent);
}

export function injectImport(filePath: string, importLine: string): void {
  const content = fs.readFileSync(filePath, 'utf8');

  // Already has this import
  if (content.includes(importLine.trim())) {
    return;
  }

  // Find all import lines
  const importRegex = /^import\s+[^;]+;/gm;
  const imports = [...content.matchAll(importRegex)];

  if (imports.length > 0) {
    // Insert after the last import
    const lastImport = imports[imports.length - 1];
    const insertPos = lastImport.index! + lastImport[0].length;
    const newContent =
      content.slice(0, insertPos) +
      '\n' +
      importLine +
      content.slice(insertPos);
    fs.writeFileSync(filePath, newContent);
  } else {
    // No imports found, prepend
    fs.writeFileSync(filePath, importLine + '\n\n' + content);
  }
}

export function injectExport(filePath: string, exportLine: string): void {
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }

  if (content.includes(exportLine)) {
    return;
  }

  const lines = content
    .split('\n')
    .filter((l) => l.trim().length > 0);

  lines.push(exportLine);
  lines.sort();

  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

/**
 * Finds the first non-annotation line in methodCode to use as dedup key.
 * Skips lines that start with @ (like @override, @lazySingleton).
 */
function findSignature(methodCode: string): string | null {
  const lines = methodCode.trim().split('\n');
  for (const line of lines) {
    const stripped = line.trim();
    if (stripped && !stripped.startsWith('@')) {
      return stripped;
    }
  }
  return null;
}
