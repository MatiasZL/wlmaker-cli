import * as fs from 'fs';
import * as path from 'path';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { findMonorepoRoot } from '../analyzer/project.js';
import { parseAppTypes } from '../generators/app/type-manager.js';
import {
  ALL_PI_FIELDS,
  sortFields,
  type PiFormField,
} from '../generators/personal-information/field-catalog.js';
import {
  createPiMarket,
  personalInformationPackageDir,
} from '../generators/personal-information/generator.js';
import type {
  PiDocumentMode,
  PiPhonePreset,
} from '../generators/personal-information/market-types.js';

const COUNTRY_CODE_REGEX = /^[a-z]{2}$/;
const PASCAL_CASE_REGEX = /^[A-Z][a-zA-Z0-9]*$/;

const BIRTH_DATE_FORMAT_OPTIONS = [
  { value: 'dd/MM/yyyy', label: 'dd/MM/yyyy', hint: 'AR, BR, CO' },
  { value: 'MM/dd', label: 'MM/dd', hint: 'US' },
  { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy', hint: 'US (with year)' },
  { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd', hint: 'ISO 8601' },
] as const;

const PHONE_PRESET_OPTIONS = [
  { value: 'default-full', label: 'Default (full number)', hint: '6–15 digits, prefix + local' },
  { value: 'brazil-full', label: 'Brazil (full number)', hint: '12–13 digits with country code' },
  { value: 'local-only', label: 'Local only', hint: '6–15 digits, no prefix validation' },
  { value: 'custom', label: 'Custom', hint: 'Set min/max length and pattern' },
] as const;

function toPascalCase(value: string): string {
  return value
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function fieldMultiselectOptions(fields: PiFormField[]) {
  return ALL_PI_FIELDS.filter((f) => fields.includes(f.value as PiFormField));
}

function fieldOptionsExcluding(fields: PiFormField[], excluded: string[]) {
  const excludedSet = new Set(excluded);
  return fieldMultiselectOptions(fields).filter((opt) => !excludedSet.has(opt.value));
}

async function promptConfirm(
  message: string,
  initialValue = false,
): Promise<boolean | symbol> {
  return clack.confirm({ message, initialValue });
}

export async function personalInformationFlow(): Promise<void> {
  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (!monorepoRoot) {
    clack.outro(chalk.red('Not inside a monorepo. Run from within a Melos monorepo.'));
    return;
  }

  const piRoot = personalInformationPackageDir(monorepoRoot);
  if (!fs.existsSync(piRoot)) {
    clack.outro(chalk.red('packages/personal_information not found in this monorepo.'));
    return;
  }

  const appTypePath = path.join(
    monorepoRoot,
    'packages',
    'localization',
    'lib',
    'enum',
    'app_type.dart',
  );

  if (!fs.existsSync(appTypePath)) {
    clack.outro(chalk.red('packages/localization/lib/enum/app_type.dart not found.'));
    return;
  }

  const appTypes = parseAppTypes(appTypePath);
  if (appTypes.length === 0) {
    clack.outro(chalk.red('No AppTypes found. Create one first (wl → App → App Type).'));
    return;
  }

  const appTypeOption = await clack.select({
    message: 'AppType for this market',
    options: appTypes.map((t) => ({
      value: t.name,
      label: t.name,
      hint: t.defaultLocale,
    })),
  });
  if (clack.isCancel(appTypeOption)) {
    clack.cancel('Cancelled');
    return;
  }

  const countryCode = await clack.text({
    message: 'Market code (2 letters, folder name)',
    placeholder: 'su',
    validate: (v) => {
      if (v === undefined || !v.trim()) return 'Market code is required';
      if (!COUNTRY_CODE_REGEX.test(v.trim())) {
        return 'Must be exactly 2 lowercase letters (e.g. su)';
      }
      const countryDir = path.join(piRoot, 'lib', 'countries', v.trim());
      if (fs.existsSync(countryDir)) return `Market folder already exists: ${v.trim()}`;
    },
  });
  if (clack.isCancel(countryCode)) {
    clack.cancel('Cancelled');
    return;
  }

  const countryName = await clack.text({
    message: 'Market name (PascalCase suffix for PiConfig)',
    placeholder: 'Unión Soviética',
    validate: (v) => {
      if (v === undefined || !v.trim()) return 'Market name is required';
    },
  });
  if (clack.isCancel(countryName)) {
    clack.cancel('Cancelled');
    return;
  }

  const selectedFields = await clack.multiselect({
    message: 'Form fields',
    options: [...ALL_PI_FIELDS],
    initialValues: ['name', 'surname', 'phone', 'birthDate'],
    required: true,
  });
  if (clack.isCancel(selectedFields)) {
    clack.cancel('Cancelled');
    return;
  }

  const fields = sortFields(selectedFields as PiFormField[]);

  if (!fields.includes('name') || !fields.includes('surname')) {
    clack.outro(chalk.red('Form must include at least name and surname.'));
    return;
  }

  let documentMode: PiDocumentMode = 'none';
  let customDocumentInputName: string | undefined;

  if (fields.includes('document')) {
    const docMode = await clack.select({
      message: 'Document field mode',
      options: [
        { value: 'selector', label: 'Document selector', hint: 'Type + number (AR/CO style)' },
        { value: 'custom', label: 'Custom input', hint: 'Dedicated input class (e.g. TaxCode)' },
      ],
    });
    if (clack.isCancel(docMode)) {
      clack.cancel('Cancelled');
      return;
    }
    documentMode = docMode as PiDocumentMode;

    if (documentMode === 'custom') {
      const inputName = await clack.text({
        message: 'Custom input name (PascalCase, e.g. TaxCode)',
        placeholder: 'TaxCode',
        validate: (v) => {
          if (v === undefined || !v.trim()) return 'Input name is required';
          const pascal = toPascalCase(v.trim());
          if (!PASCAL_CASE_REGEX.test(pascal)) {
            return 'Must be PascalCase (e.g. TaxCode)';
          }
        },
      });
      if (clack.isCancel(inputName)) {
        clack.cancel('Cancelled');
        return;
      }
      customDocumentInputName = toPascalCase(inputName as string);
    }
  }

  const birthDateFormat = await clack.select({
    message: 'Birth date format',
    options: [...BIRTH_DATE_FORMAT_OPTIONS],
    initialValue: 'dd/MM/yyyy',
  });
  if (clack.isCancel(birthDateFormat)) {
    clack.cancel('Cancelled');
    return;
  }

  const phonePreset = await clack.select({
    message: 'Phone validation preset',
    options: [...PHONE_PRESET_OPTIONS],
    initialValue: 'default-full',
  });
  if (clack.isCancel(phonePreset)) {
    clack.cancel('Cancelled');
    return;
  }

  let phoneMin = 6;
  let phoneMax = 15;
  let phonePattern: 'phoneDigits' | 'phoneBr' = 'phoneDigits';
  let validateFullNumber = true;

  if (phonePreset === 'default-full') {
    phoneMin = 6;
    phoneMax = 15;
    phonePattern = 'phoneDigits';
    validateFullNumber = true;
  } else if (phonePreset === 'brazil-full') {
    phoneMin = 12;
    phoneMax = 13;
    phonePattern = 'phoneBr';
    validateFullNumber = true;
  } else if (phonePreset === 'local-only') {
    phoneMin = 6;
    phoneMax = 15;
    phonePattern = 'phoneDigits';
    validateFullNumber = false;
  } else {
    const minLength = await clack.text({
      message: 'Phone min length',
      placeholder: '6',
      initialValue: '6',
      validate: (v) => {
        if (v === undefined || !v.trim()) return 'Required';
        if (!/^\d+$/.test(v.trim())) return 'Must be a number';
      },
    });
    if (clack.isCancel(minLength)) {
      clack.cancel('Cancelled');
      return;
    }

    const maxLength = await clack.text({
      message: 'Phone max length',
      placeholder: '15',
      initialValue: '15',
      validate: (v) => {
        if (v === undefined || !v.trim()) return 'Required';
        if (!/^\d+$/.test(v.trim())) return 'Must be a number';
      },
    });
    if (clack.isCancel(maxLength)) {
      clack.cancel('Cancelled');
      return;
    }

    const pattern = await clack.select({
      message: 'Phone pattern',
      options: [
        { value: 'phoneDigits', label: 'phoneDigits', hint: 'Digits only' },
        { value: 'phoneBr', label: 'phoneBr', hint: 'Brazil pattern' },
      ],
    });
    if (clack.isCancel(pattern)) {
      clack.cancel('Cancelled');
      return;
    }

    const fullNumber = await promptConfirm(
      'Validate full phone number (prefix + local)?',
      true,
    );
    if (clack.isCancel(fullNumber)) {
      clack.cancel('Cancelled');
      return;
    }

    phoneMin = Number(minLength);
    phoneMax = Number(maxLength);
    phonePattern = pattern as 'phoneDigits' | 'phoneBr';
    validateFullNumber = fullNumber as boolean;
  }

  const fieldOpts = fieldMultiselectOptions(fields);

  const editableAfterSave = await clack.multiselect({
    message: 'Editable after save',
    options: fieldOpts,
    initialValues: fields.includes('phone') ? ['phone'] : [],
    required: false,
  });
  if (clack.isCancel(editableAfterSave)) {
    clack.cancel('Cancelled');
    return;
  }

  const editableList = editableAfterSave as string[];
  const lockedFieldOpts = fieldOptionsExcluding(fields, editableList);

  let lockedList: string[] = [];
  if (lockedFieldOpts.length > 0) {
    const lockedFields = await clack.multiselect({
      message: 'Locked fields (never editable)',
      options: lockedFieldOpts,
      required: false,
    });
    if (clack.isCancel(lockedFields)) {
      clack.cancel('Cancelled');
      return;
    }
    lockedList = lockedFields as string[];
  } else {
    clack.log.info('Locked fields: no remaining fields to choose, skipping.');
  }

  const alwaysEditableFieldOpts = fieldOptionsExcluding(fields, [
    ...editableList,
    ...lockedList,
  ]);

  let alwaysEditableList: string[] = [];
  if (alwaysEditableFieldOpts.length > 0) {
    const alwaysEditableFields = await clack.multiselect({
      message: 'Always editable fields',
      options: alwaysEditableFieldOpts,
      required: false,
    });
    if (clack.isCancel(alwaysEditableFields)) {
      clack.cancel('Cancelled');
      return;
    }
    alwaysEditableList = alwaysEditableFields as string[];
  } else {
    clack.log.info('Always editable fields: no remaining fields to choose, skipping.');
  }

  const skipEmailVerification = await promptConfirm(
    'Skip email verification after submit?',
    true,
  );
  if (clack.isCancel(skipEmailVerification)) {
    clack.cancel('Cancelled');
    return;
  }

  const shouldNavigateToAccountDeletion = await promptConfirm(
    'Navigate to account deletion on save?',
    false,
  );
  if (clack.isCancel(shouldNavigateToAccountDeletion)) {
    clack.cancel('Cancelled');
    return;
  }

  const blockAllFieldsUntilDataIsPresent = await promptConfirm(
    'Block all fields until customer data is present?',
    false,
  );
  if (clack.isCancel(blockAllFieldsUntilDataIsPresent)) {
    clack.cancel('Cancelled');
    return;
  }

  const showDocumentCard = await promptConfirm(
    'Show document card section?',
    fields.includes('document'),
  );
  if (clack.isCancel(showDocumentCard)) {
    clack.cancel('Cancelled');
    return;
  }

  const showInfoAlert = await promptConfirm(
    'Show info alert on submit (PATCH flow)?',
    false,
  );
  if (clack.isCancel(showInfoAlert)) {
    clack.cancel('Cancelled');
    return;
  }

  const showInfoText = await promptConfirm(
    'Load and display legal personal-data message?',
    false,
  );
  if (clack.isCancel(showInfoText)) {
    clack.cancel('Cancelled');
    return;
  }

  const showDeleteAccountButtonIos = await promptConfirm(
    'Show delete account button on iOS?',
    true,
  );
  if (clack.isCancel(showDeleteAccountButtonIos)) {
    clack.cancel('Cancelled');
    return;
  }

  const showDeleteAccountButtonAndroid = await promptConfirm(
    'Show delete account button on Android?',
    false,
  );
  if (clack.isCancel(showDeleteAccountButtonAndroid)) {
    clack.cancel('Cancelled');
    return;
  }

  const pascalCountry = toPascalCase(countryName as string);
  const code = (countryCode as string).trim().toLowerCase();

  clack.log.info(`AppType:     ${chalk.cyan(appTypeOption as string)}`);
  clack.log.info(`Folder:      ${chalk.cyan(`countries/${code}/`)}`);
  clack.log.info(`Config:      ${chalk.cyan(`PiConfig${pascalCountry}`)}`);
  clack.log.info(`Fields:      ${chalk.cyan(fields.join(', '))}`);

  const confirmed = await promptConfirm(
    'Generate personal information market scaffold?',
    true,
  );
  if (clack.isCancel(confirmed) || !confirmed) {
    clack.cancel('Cancelled');
    return;
  }

  const spinner = clack.spinner();
  spinner.start('Scaffolding market...');

  try {
    await createPiMarket({
      monorepoRoot,
      countryCode: code,
      countryName: pascalCountry,
      appTypeEnum: appTypeOption as string,
      fields,
      documentMode,
      customDocumentInputName,
      birthDateFormat: birthDateFormat as string,
      editableAfterSave: editableList,
      lockedFields: lockedList,
      alwaysEditableFields: alwaysEditableList,
      phoneValidation: {
        preset: phonePreset as PiPhonePreset,
        minLength: phoneMin,
        maxLength: phoneMax,
        pattern: phonePattern,
        validateFullNumber,
      },
      skipEmailVerification: skipEmailVerification as boolean,
      shouldNavigateToAccountDeletion: shouldNavigateToAccountDeletion as boolean,
      blockAllFieldsUntilDataIsPresent: blockAllFieldsUntilDataIsPresent as boolean,
      showDocumentCard: showDocumentCard as boolean,
      showInfoText: showInfoText as boolean,
      showInfoAlert: showInfoAlert as boolean,
      showDeleteAccountButtonIos: showDeleteAccountButtonIos as boolean,
      showDeleteAccountButtonAndroid: showDeleteAccountButtonAndroid as boolean,
    });
    spinner.stop('Market scaffolded');
    clack.outro(chalk.green('Done! Review generated files and run PI tests.'));
  } catch (error) {
    spinner.stop('Failed');
    clack.outro(chalk.red(`Error: ${error}`));
  }
}
