import type { PiMarketOptions } from './market-types.js';

export const ALL_PI_FIELDS = [
  { value: 'name', label: 'name' },
  { value: 'surname', label: 'surname' },
  { value: 'email', label: 'email' },
  { value: 'document', label: 'document' },
  { value: 'gender', label: 'gender' },
  { value: 'birthDate', label: 'birthDate' },
  { value: 'issueDate', label: 'issueDate' },
  { value: 'phone', label: 'phone' },
  { value: 'loyaltyId', label: 'loyaltyId' },
] as const;

export type PiFormField = (typeof ALL_PI_FIELDS)[number]['value'];

export const FIELD_DISPLAY_ORDER: PiFormField[] = [
  'name',
  'surname',
  'email',
  'document',
  'gender',
  'birthDate',
  'issueDate',
  'phone',
  'loyaltyId',
];

export type BlocFieldHandler =
  | 'name'
  | 'surname'
  | 'email'
  | 'phone'
  | 'birthDate'
  | 'document'
  | 'gender'
  | 'issueDate'
  | 'loyaltyId';

export function sortFields(fields: PiFormField[]): PiFormField[] {
  const set = new Set(fields);
  return FIELD_DISPLAY_ORDER.filter((f) => set.has(f));
}

export function hasField(options: PiMarketOptions, field: PiFormField): boolean {
  return options.fields.includes(field);
}

export function documentInputClass(options: PiMarketOptions, countryPrefix: string): string {
  if (options.documentMode === 'custom' && options.customDocumentInputName) {
    return `${countryPrefix}${options.customDocumentInputName}Input`;
  }
  return `${countryPrefix}DocumentInput`;
}

export function resolveBlocHandlers(options: PiMarketOptions): BlocFieldHandler[] {
  return sortFields(options.fields) as BlocFieldHandler[];
}

export function fieldOptionsForMultiselect(fields: PiFormField[]) {
  return ALL_PI_FIELDS.filter((f) => fields.includes(f.value as PiFormField));
}
