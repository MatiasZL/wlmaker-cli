/**
 * Generic Dart class manipulation utilities.
 * Injects fields, constructor params, props, and super() calls into Dart classes.
 */

/**
 * Insert a line of code right before the closing brace of a class.
 * Uses brace counting to find the end of the class body.
 */
export function injectBeforeClassClose(
  content: string,
  className: string,
  line: string,
): string {
  const classRegex = new RegExp(`class\\s+${className}\\s*[^{]*\\{`);
  const classMatch = content.match(classRegex);
  if (!classMatch) {
    throw new Error(`Class "${className}" not found`);
  }

  const classStart = content.indexOf(classMatch[0]);
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
    throw new Error(`Could not find closing brace for class "${className}"`);
  }

  return content.slice(0, classEnd) + line + '\n' + content.slice(classEnd);
}

/**
 * Inject a constructor parameter into a Dart class constructor.
 * Handles both named params ({...}) and positional params (...).
 * @param defaultValueExpr - the default value expression (e.g. "''", 'false', 'const []')
 */
export function injectConstructorParam(
  content: string,
  className: string,
  paramName: string,
  defaultValueExpr: string,
): string {
  const classRegex = new RegExp(`class\\s+${className}\\s*[^{]*\\{`);
  const classMatch = content.match(classRegex);
  if (!classMatch) return content;

  const classStart = content.indexOf(classMatch[0]);

  const constructorPattern = new RegExp(
    `(?:const\\s+)?${className}\\s*\\(`,
  );
  const searchFrom = classStart;
  const constructorMatch = content.slice(searchFrom).match(constructorPattern);
  if (!constructorMatch) return content;

  const constructorAbsStart = searchFrom + constructorMatch.index!;
  const parenStart = content.indexOf('(', constructorAbsStart);
  const afterParen = content.slice(parenStart + 1).trimStart();

  if (afterParen.startsWith('{')) {
    // Named params — inject inside the { ... } block
    const braceOffset = content.slice(parenStart + 1).indexOf('{');
    const braceStart = parenStart + 1 + braceOffset;
    let braceCount = 1;
    let braceEnd = -1;

    for (let i = braceStart + 1; i < content.length; i++) {
      if (content[i] === '{') braceCount++;
      else if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          braceEnd = i;
          break;
        }
      }
    }

    if (braceEnd === -1) return content;

    // Detect indentation from existing params
    const beforeClose = content.slice(0, braceEnd);
    const paramLines = beforeClose.split('\n');
    let lastParamIndent = '    ';
    for (let i = paramLines.length - 1; i >= 0; i--) {
      const trimmed = paramLines[i].trim();
      if (trimmed.startsWith('this.') || trimmed.startsWith('required')) {
        const leadingSpaces = paramLines[i].match(/^(\s*)/)?.[1] ?? '';
        lastParamIndent = leadingSpaces;
        break;
      }
    }

    const insertion = `${lastParamIndent}this.${paramName} = ${defaultValueExpr},\n`;
    return content.slice(0, braceEnd) + insertion + content.slice(braceEnd);
  } else {
    // Positional params — inject before the closing ')'
    let parenCount = 1;
    let parenEnd = -1;

    for (let i = parenStart + 1; i < content.length; i++) {
      if (content[i] === '(') parenCount++;
      else if (content[i] === ')') {
        parenCount--;
        if (parenCount === 0) {
          parenEnd = i;
          break;
        }
      }
    }

    if (parenEnd === -1) return content;

    const beforeClose = content.slice(0, parenEnd);
    const paramLines = beforeClose.split('\n');
    let lastParamIndent = '    ';
    for (let i = paramLines.length - 1; i >= 0; i--) {
      const trimmed = paramLines[i].trim();
      if (trimmed.length > 0) {
        const leadingSpaces = paramLines[i].match(/^(\s*)/)?.[1] ?? '';
        lastParamIndent = leadingSpaces;
        break;
      }
    }

    const insertion = `${lastParamIndent}this.${paramName} = ${defaultValueExpr},\n`;
    return content.slice(0, parenEnd) + insertion + content.slice(parenEnd);
  }
}

/**
 * Inject an entry into a Dart props getter list: `List<Object?> get props => [...]`.
 */
export function injectIntoPropsList(content: string, propName: string): string {
  const propsRegex = /List<Object\?>\s+get\s+props\s*=>\s*\[/;
  const match = content.match(propsRegex);
  if (!match) return content;

  const propsStart = content.indexOf(match[0]) + match[0].length;

  let bracketCount = 1;
  let bracketEnd = -1;
  for (let i = propsStart; i < content.length; i++) {
    if (content[i] === '[') bracketCount++;
    else if (content[i] === ']') {
      bracketCount--;
      if (bracketCount === 0) {
        bracketEnd = i;
        break;
      }
    }
  }

  if (bracketEnd === -1) return content;

  const beforeClose = content.slice(0, bracketEnd);
  const propLines = beforeClose.split('\n');
  let lastPropIndent = '    ';
  for (let i = propLines.length - 1; i >= 0; i--) {
    const trimmed = propLines[i].trim();
    if (trimmed.length > 0 && trimmed !== '[') {
      const leadingSpaces = propLines[i].match(/^(\s*)/)?.[1] ?? '';
      lastPropIndent = leadingSpaces;
      break;
    }
  }

  const insertion = `${lastPropIndent}${propName},\n`;
  return content.slice(0, bracketEnd) + insertion + content.slice(bracketEnd);
}

/**
 * Inject a parameter into a super() call inside a constructor.
 */
export function injectIntoSuperCall(content: string, paramName: string): string {
  const superRegex = /super\s*\(\s*/;
  const match = content.match(superRegex);
  if (!match) return content;

  const superStart = content.indexOf(match[0]) + match[0].length;

  let parenCount = 1;
  let parenEnd = -1;
  for (let i = superStart; i < content.length; i++) {
    if (content[i] === '(') parenCount++;
    else if (content[i] === ')') {
      parenCount--;
      if (parenCount === 0) {
        parenEnd = i;
        break;
      }
    }
  }

  if (parenEnd === -1) return content;

  const beforeClose = content.slice(0, parenEnd);
  const superLines = beforeClose.split('\n');
  let lastEntryIndent = '         ';
  for (let i = superLines.length - 1; i >= 0; i--) {
    const trimmed = superLines[i].trim();
    if (trimmed.length > 0 && trimmed.includes(':')) {
      const leadingSpaces = superLines[i].match(/^(\s*)/)?.[1] ?? '';
      lastEntryIndent = leadingSpaces;
      break;
    }
  }

  const insertion = `${lastEntryIndent}${paramName}: ${paramName},\n`;
  return content.slice(0, parenEnd) + insertion + content.slice(parenEnd);
}
