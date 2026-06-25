import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { hasField, resolveBlocHandlers } from './field-catalog.js';
import {
  resolvePiMarketNaming,
  type PiMarketOptions,
} from './market-types.js';
import {
  customDocumentFieldWidgetTemplate,
  customDocumentInputTemplate,
  documentSelectorInputTemplate,
  inputsBarrelTemplate,
  issueDateFieldWidgetTemplate,
  issueDateInputTemplate,
  loyaltyIdFieldWidgetTemplate,
  loyaltyIdInputTemplate,
  widgetsBarrelTemplate,
  fieldsBarrelTemplate,
} from './input-templates.js';
import {
  blocInitialFormCase,
  countryBarrelTemplate,
  personalInformationBodyTemplate,
  personalInformationFormTemplate,
  piConfigTemplate,
  piFieldValidationTemplate,
  piFormStateTemplate,
  viewBodyCase,
} from './templates.js';
import {
  patchBarrelExport,
  patchBlocSwitchCases,
  patchPartDirective,
  patchPiConfigFactory,
  patchPiConfigShellEmailInForm,
  patchPiFormState,
  patchViewBodyCase,
} from './patcher.js';

function dartFormat(files: string[]): void {
  const existing = files.filter((f) => fs.existsSync(f));
  if (existing.length === 0) return;
  try {
    execSync(`dart format ${existing.map((f) => `"${f}"`).join(' ')}`, {
      stdio: 'pipe',
    });
  } catch {
    // Non-fatal if dart is unavailable
  }
}

export function personalInformationPackageDir(monorepoRoot: string): string {
  return path.join(monorepoRoot, 'packages', 'personal_information');
}

function writeAuxiliaryFiles(
  countryDir: string,
  naming: ReturnType<typeof resolvePiMarketNaming>,
  options: PiMarketOptions,
): string[] {
  const written: string[] = [];

  if (hasField(options, 'document') || hasField(options, 'loyaltyId') || hasField(options, 'issueDate')) {
    fs.mkdirSync(path.join(countryDir, 'inputs'), { recursive: true });
  }
  if (hasField(options, 'loyaltyId')) {
    fs.mkdirSync(path.join(countryDir, 'widgets'), { recursive: true });
  }
  if (hasField(options, 'issueDate') || (hasField(options, 'document') && options.documentMode === 'custom')) {
    fs.mkdirSync(path.join(countryDir, 'fields'), { recursive: true });
  }

  const inputExports: string[] = [];

  if (hasField(options, 'document')) {
    if (options.documentMode === 'selector') {
      const file = path.join(countryDir, 'inputs', `${naming.countryDir}_document_input.dart`);
      fs.writeFileSync(file, documentSelectorInputTemplate(naming));
      inputExports.push(`${naming.countryDir}_document_input.dart`);
      written.push(file);
    } else if (options.documentMode === 'custom' && options.customDocumentInputName) {
      const file = path.join(
        countryDir,
        'inputs',
        `${naming.countryDir}_${options.customDocumentInputName.toLowerCase()}_input.dart`,
      );
      fs.writeFileSync(file, customDocumentInputTemplate(naming, options.customDocumentInputName));
      inputExports.push(path.basename(file));
      written.push(file);

      const fieldFile = path.join(countryDir, 'fields', `${naming.countryDir}_custom_document_field.dart`);
      fs.writeFileSync(
        fieldFile,
        customDocumentFieldWidgetTemplate(naming, options.customDocumentInputName),
      );
      const fieldsBarrel = path.join(countryDir, 'fields', 'fields.dart');
      fs.writeFileSync(fieldsBarrel, fieldsBarrelTemplate([`${naming.countryDir}_custom_document_field.dart`]));
      written.push(fieldFile, fieldsBarrel);
    }
  }

  if (hasField(options, 'loyaltyId')) {
    const inputFile = path.join(countryDir, 'inputs', `${naming.countryDir}_loyalty_id_input.dart`);
    fs.writeFileSync(inputFile, loyaltyIdInputTemplate(naming));
    inputExports.push(`${naming.countryDir}_loyalty_id_input.dart`);
    written.push(inputFile);

    const widgetFile = path.join(countryDir, 'widgets', `${naming.countryDir}_loyalty_id_field.dart`);
    fs.writeFileSync(widgetFile, loyaltyIdFieldWidgetTemplate(naming));
    const widgetsBarrel = path.join(countryDir, 'widgets', 'widgets.dart');
    fs.writeFileSync(widgetsBarrel, widgetsBarrelTemplate([`${naming.countryDir}_loyalty_id_field.dart`]));
    written.push(widgetFile, widgetsBarrel);
  }

  if (hasField(options, 'issueDate')) {
    const inputFile = path.join(countryDir, 'inputs', `${naming.countryDir}_issue_date_input.dart`);
    fs.writeFileSync(inputFile, issueDateInputTemplate(naming));
    inputExports.push(`${naming.countryDir}_issue_date_input.dart`);
    written.push(inputFile);

    const fieldFile = path.join(countryDir, 'fields', `${naming.countryDir}_issue_date_field.dart`);
    fs.writeFileSync(fieldFile, issueDateFieldWidgetTemplate(naming));
    const fieldsBarrel = path.join(countryDir, 'fields', 'fields.dart');
    const fieldExports = [path.basename(fieldFile)];
    if (hasField(options, 'document') && options.documentMode === 'custom') {
      fieldExports.unshift(`${naming.countryDir}_custom_document_field.dart`);
    }
    fs.writeFileSync(fieldsBarrel, fieldsBarrelTemplate(fieldExports));
    written.push(fieldFile, fieldsBarrel);
  }

  if (inputExports.length > 0) {
    const inputsBarrel = path.join(countryDir, 'inputs', 'inputs.dart');
    fs.writeFileSync(inputsBarrel, inputsBarrelTemplate(inputExports));
    written.push(inputsBarrel);
  }

  return written;
}

export async function createPiMarket(options: PiMarketOptions): Promise<void> {
  const piRoot = personalInformationPackageDir(options.monorepoRoot);
  const lib = path.join(piRoot, 'lib');

  if (!fs.existsSync(lib)) {
    throw new Error(
      'packages/personal_information not found. Run from a monorepo with the PI package.',
    );
  }

  if (options.fields.length === 0) {
    throw new Error('At least one form field must be selected.');
  }

  if (!options.fields.includes('name') || !options.fields.includes('surname')) {
    throw new Error('Form must include at least name and surname.');
  }

  if (hasField(options, 'document') && options.documentMode === 'custom' && !options.customDocumentInputName) {
    throw new Error('Custom document mode requires customDocumentInputName.');
  }

  const naming = resolvePiMarketNaming(
    options.countryCode,
    options.countryName,
  );

  const countryDir = path.join(lib, 'countries', naming.countryDir);
  if (fs.existsSync(countryDir)) {
    throw new Error(`Country "${naming.countryDir}" already exists at ${countryDir}`);
  }

  const appTypePath = path.join(
    options.monorepoRoot,
    'packages',
    'localization',
    'lib',
    'enum',
    'app_type.dart',
  );
  if (fs.existsSync(appTypePath)) {
    const appTypeContent = fs.readFileSync(appTypePath, 'utf8');
    if (!appTypeContent.includes(`${options.appTypeEnum}(`)) {
      throw new Error(
        `AppType.${options.appTypeEnum} not found in app_type.dart. Create it first (wl → App → App Type).`,
      );
    }
  }

  console.log(
    chalk.bold(
      `\nScaffolding personal information market: ${chalk.cyan(options.countryName)} (${naming.countryDir})\n`,
    ),
  );

  fs.mkdirSync(countryDir, { recursive: true });

  const configPath = path.join(countryDir, naming.configFile);
  const validationPath = path.join(countryDir, naming.validationFile);
  const formPath = path.join(
    countryDir,
    `${naming.countryDir}_personal_information_form.dart`,
  );
  const bodyPath = path.join(
    countryDir,
    `${naming.countryDir}_personal_information_body.dart`,
  );
  const barrelPath = path.join(countryDir, `${naming.countryDir}.dart`);

  fs.writeFileSync(configPath, piConfigTemplate(naming, options));
  fs.writeFileSync(validationPath, piFieldValidationTemplate(naming, options));
  fs.writeFileSync(formPath, personalInformationFormTemplate(naming, options));
  fs.writeFileSync(bodyPath, personalInformationBodyTemplate(naming, options));
  fs.writeFileSync(barrelPath, countryBarrelTemplate(naming, options));

  const auxiliaryFiles = writeAuxiliaryFiles(countryDir, naming, options);

  console.log(chalk.green(`  Created ${path.relative(piRoot, countryDir)}/`));

  const piConfigPath = path.join(lib, 'config', 'pi_config.dart');
  const piValidationPath = path.join(lib, 'config', 'pi_field_validation.dart');
  const piFormStatePath = path.join(lib, 'form', 'pi_form_state.dart');
  const countriesBarrel = path.join(lib, 'countries', 'countries.dart');
  const formBarrel = path.join(lib, 'form', 'form.dart');
  const blocPath = path.join(lib, 'bloc', 'personal_information_bloc.dart');
  const viewPath = path.join(
    lib,
    'pages',
    'views',
    'personal_information_view.dart',
  );
  const configShellPath = path.join(lib, 'config', 'pi_config_shell.dart');

  patchPartDirective(
    piConfigPath,
    `part '../countries/${naming.countryDir}/${naming.configFile}';`,
  );
  patchPartDirective(
    piValidationPath,
    `part '../countries/${naming.countryDir}/${naming.validationFile}';`,
  );
  patchPiConfigFactory(piConfigPath, options.appTypeEnum, naming.configClass);
  patchPiFormState(
    piFormStatePath,
    naming.formStateClass,
    piFormStateTemplate(naming, options),
  );
  patchBarrelExport(countriesBarrel, `export '${naming.countryDir}/${naming.countryDir}.dart';`);
  patchBarrelExport(
    formBarrel,
    `export '../countries/${naming.countryDir}/${naming.countryDir}_personal_information_form.dart';`,
  );

  const blocFields = resolveBlocHandlers(options);

  patchBlocSwitchCases(
    blocPath,
    naming,
    blocFields,
    blocInitialFormCase(naming, options),
    options,
  );
  patchViewBodyCase(viewPath, viewBodyCase(naming, options));

  if (hasField(options, 'email') && fs.existsSync(configShellPath)) {
    patchPiConfigShellEmailInForm(configShellPath, naming.configClass);
  }

  const formatted = [
    configPath,
    validationPath,
    formPath,
    bodyPath,
    barrelPath,
    ...auxiliaryFiles,
    piConfigPath,
    piValidationPath,
    piFormStatePath,
    countriesBarrel,
    formBarrel,
    blocPath,
    viewPath,
  ];
  dartFormat(formatted);

  console.log(chalk.green('\nMarket scaffold complete.'));
  console.log(chalk.yellow('\nManual follow-ups:'));
  console.log(chalk.gray('  • App env: DOCUMENT_TYPES_CONFIG / phonePrefixes if needed'));
  console.log(chalk.gray('  • Localization labels for new copy'));
  console.log(chalk.gray('  • Run tests: melos run test --scope=personal_information'));
}
