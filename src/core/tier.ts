export const VALID_TIERS = ['atom', 'molecule', 'organism', 'template'] as const;
export type Tier = (typeof VALID_TIERS)[number];

export const TIER_PATTERNS: Record<Tier, string[]> = {
  atom: ['single-public', 'single-factory'],
  molecule: ['single', 'subdirectory-parts', 'subdirectory-widgets'],
  organism: ['subdirectory-show', 'single'],
  template: ['simple', 'config-data-callbacks'],
};

const TIER_PLURAL: Record<Tier, string> = {
  atom: 'atoms',
  molecule: 'molecules',
  organism: 'organisms',
  template: 'templates',
};

const TIER_LABELS: Record<Tier, string> = {
  atom: 'Atom',
  molecule: 'Molecule',
  organism: 'Organism',
  template: 'Template',
};

const PATTERN_LABELS: Record<string, string> = {
  'single-public': 'Single file, public constructor',
  'single-factory': 'Single file, private constructor + factories',
  'subdirectory-parts': 'Subdirectory with part files',
  single: 'Single file',
  'subdirectory-widgets': 'Subdirectory with widgets/ and utils/',
  'subdirectory-show': 'Subdirectory with static show() + parts',
  simple: 'Template simple (i18n + body + skeleton)',
  'config-data-callbacks': 'Template with Config/Data/Callbacks',
};

export function normalizeTier(input: string): Tier {
  const normalized = input.toLowerCase().replace(/s$/, '');
  if (VALID_TIERS.includes(normalized as Tier)) {
    return normalized as Tier;
  }
  throw new Error(
    `Invalid tier "${input}". Valid tiers: ${VALID_TIERS.join(', ')}`,
  );
}

export function tierPlural(tier: Tier): string {
  return TIER_PLURAL[tier];
}

export function tierLabel(tier: Tier): string {
  return TIER_LABELS[tier];
}

export function getValidPatterns(tier: Tier): string[] {
  return TIER_PATTERNS[tier];
}

export function getDefaultPattern(tier: Tier): string {
  return TIER_PATTERNS[tier][0];
}

export function patternLabel(pattern: string): string {
  return PATTERN_LABELS[pattern] ?? pattern;
}
