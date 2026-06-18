/** Snake case: lowercase letters, digits, underscores, must start with a letter. */
export const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

/** SCREAMING_SNAKE_CASE: uppercase letters, digits, underscores. */
export const SCREAMING_SNAKE_REGEX = /^[A-Z][A-Z0-9_]*$/;

/** Validates that a value is non-empty snake_case. */
export function validateSnakeCase(value: unknown): string | undefined {
  const v = (value as string | undefined) ?? '';
  if (!v.trim()) return 'Name is required';
  if (!SNAKE_CASE_REGEX.test(v)) return 'Must be snake_case (lowercase letters, digits, underscores)';
  return undefined;
}

/** Validates a SCREAMING_SNAKE_CASE variable name. */
export function validateScreamingSnake(value: unknown): string | undefined {
  const v = (value as string | undefined) ?? '';
  if (!v.trim()) return 'Name is required';
  if (!SCREAMING_SNAKE_REGEX.test(v)) return 'Must be SCREAMING_SNAKE_CASE (uppercase, numbers, underscores)';
  return undefined;
}
