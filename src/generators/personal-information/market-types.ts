import type { PiFormField } from './field-catalog.js';

export type PiDocumentMode = 'none' | 'selector' | 'custom';

export type PiPhonePattern = 'phoneDigits' | 'phoneBr';

export type PiPhonePreset = 'default-full' | 'brazil-full' | 'local-only' | 'custom';

export interface PiPhoneValidation {
  preset: PiPhonePreset;
  minLength: number;
  maxLength: number;
  pattern: PiPhonePattern;
  validateFullNumber: boolean;
}

export interface PiMarketOptions {
  monorepoRoot: string;
  countryCode: string;
  countryName: string;
  appTypeEnum: string;
  fields: PiFormField[];
  documentMode: PiDocumentMode;
  customDocumentInputName?: string;
  birthDateFormat: string;
  editableAfterSave: string[];
  lockedFields: string[];
  alwaysEditableFields: string[];
  phoneValidation: PiPhoneValidation;
  skipEmailVerification: boolean;
  shouldNavigateToAccountDeletion: boolean;
  blockAllFieldsUntilDataIsPresent: boolean;
  showDocumentCard: boolean;
  showInfoText: boolean;
  showInfoAlert: boolean;
  showDeleteAccountButtonIos: boolean;
  showDeleteAccountButtonAndroid: boolean;
}

export interface PiMarketNaming {
  countryDir: string;
  countryPrefix: string;
  configClass: string;
  validationClass: string;
  formClass: string;
  bodyClass: string;
  formStateClass: string;
  configFile: string;
  validationFile: string;
}

export function resolvePiMarketNaming(
  countryCode: string,
  countryName: string,
): PiMarketNaming {
  const countryDir = countryCode.toLowerCase();
  const countryPrefix =
    countryDir.charAt(0).toUpperCase() + countryDir.charAt(1);

  return {
    countryDir,
    countryPrefix,
    configClass: `PiConfig${countryName}`,
    validationClass: `PiFieldValidation${countryName}`,
    formClass: `${countryPrefix}PersonalInformationForm`,
    bodyClass: `${countryPrefix}PersonalInformationBody`,
    formStateClass: `${countryPrefix}PiFormState`,
    configFile: `pi_config_${countryName.toLowerCase()}.dart`,
    validationFile: `pi_field_validation_${countryName.toLowerCase()}.dart`,
  };
}
