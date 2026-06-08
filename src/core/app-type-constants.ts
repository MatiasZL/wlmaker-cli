export interface CountryConfig {
  name: string;
  code: string;
  language: string;
  locale: string;
  timezone: string;
}

export const SUPPORTED_COUNTRIES: CountryConfig[] = [
  { name: 'Colombia', code: 'CO', language: 'es', locale: 'es_CO', timezone: 'America/Bogota' },
  { name: 'Argentina', code: 'AR', language: 'es', locale: 'es_AR', timezone: 'America/Argentina/Buenos_Aires' },
  { name: 'Chile', code: 'CL', language: 'es', locale: 'es_CL', timezone: 'America/Santiago' },
  { name: 'Peru', code: 'PE', language: 'es', locale: 'es_PE', timezone: 'America/Lima' },
  { name: 'Ecuador', code: 'EC', language: 'es', locale: 'es_EC', timezone: 'America/Guayaquil' },
  { name: 'Uruguay', code: 'UY', language: 'es', locale: 'es_UY', timezone: 'America/Montevideo' },
  { name: 'Brasil', code: 'BR', language: 'pt', locale: 'pt_BR', timezone: 'America/Sao_Paulo' },
  { name: 'United States', code: 'US', language: 'en', locale: 'en_US', timezone: 'America/New_York' },
];

export const SUPPORTED_LANGUAGES = ['es', 'pt', 'en'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
