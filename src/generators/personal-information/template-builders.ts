import {
  documentInputClass,
  hasField,
  sortFields,
  type PiFormField,
} from './field-catalog.js';
import type { PiMarketNaming, PiMarketOptions } from './market-types.js';

function fieldsLabel(options: PiMarketOptions): string {
  return sortFields(options.fields).join(', ');
}

function dartSet(values: string[]): string {
  if (values.length === 0) return 'const {}';
  return `const {${values.map((v) => `'${v}'`).join(', ')}}`;
}

export function piConfigTemplate(
  naming: PiMarketNaming,
  options: PiMarketOptions,
): string {
  return `part of '../../config/pi_config.dart';

final class ${naming.configClass} extends PiConfig {
  const ${naming.configClass}();

  @override
  bool get skipEmailVerification => ${options.skipEmailVerification};

  @override
  bool get shouldNavigateToAccountDeletion => ${options.shouldNavigateToAccountDeletion};

  @override
  bool get blockAllFieldsUntilDataIsPresent => ${options.blockAllFieldsUntilDataIsPresent};

  @override
  bool get showDocumentCard => ${options.showDocumentCard};

  @override
  bool get showDeleteAccountButtonIos => ${options.showDeleteAccountButtonIos};

  @override
  bool get showDeleteAccountButtonAndroid => ${options.showDeleteAccountButtonAndroid};

  @override
  bool get showInfoText => ${options.showInfoText};

  @override
  bool get showInfoAlert => ${options.showInfoAlert};

  @override
  String get birthDateFormat => '${options.birthDateFormat}';

  @override
  Locale get phoneLocale => AppType.${options.appTypeEnum}.defaultLocale;

  @override
  Set<String> get editableAfterSave => ${dartSet(options.editableAfterSave)};

  @override
  Set<String> get alwaysEditableFields => ${dartSet(options.alwaysEditableFields)};

  @override
  Set<String> get lockedFields => ${dartSet(options.lockedFields)};

  @override
  PiFieldValidation get fieldValidation => const ${naming.validationClass}();
}
`;
}

function phoneRulesDart(options: PiMarketOptions): string {
  const { phoneValidation } = options;
  if (phoneValidation.preset === 'default-full') {
    return 'PiSharedFieldRules.phone';
  }
  if (phoneValidation.preset === 'brazil-full') {
    return `const PiPhoneFieldRules(
    required: true,
    minLength: 12,
    maxLength: 13,
    pattern: PiFieldPatterns.phoneBr,
  )`;
  }
  const patternRef =
    phoneValidation.pattern === 'phoneBr'
      ? 'PiFieldPatterns.phoneBr'
      : 'PiFieldPatterns.phoneDigits';
  return `const PiPhoneFieldRules(
    required: true,
    minLength: ${phoneValidation.minLength},
    maxLength: ${phoneValidation.maxLength},
    pattern: ${patternRef},
    validateFullNumber: ${phoneValidation.validateFullNumber},
  )`;
}

export function piFieldValidationTemplate(
  naming: PiMarketNaming,
  options: PiMarketOptions,
): string {
  const birthDateRule = hasField(options, 'birthDate')
    ? 'PiSharedFieldRules.birthDateRequired'
    : 'PiSharedFieldRules.birthDateOptional';

  return `part of '../../config/pi_field_validation.dart';

final class ${naming.validationClass} extends PiFieldValidation {
  const ${naming.validationClass}();

  @override
  PiTextFieldRules get name => PiSharedFieldRules.name;

  @override
  PiTextFieldRules get surname => PiSharedFieldRules.surname;

  @override
  PiPhoneFieldRules get phone => ${hasField(options, 'phone') ? phoneRulesDart(options) : 'PiSharedFieldRules.phone'};

  @override
  PiDateFieldRules get birthDate => ${birthDateRule};
}
`;
}

function formFieldDeclaration(
  field: PiFormField,
  naming: PiMarketNaming,
  options: PiMarketOptions,
): string {
  switch (field) {
    case 'name':
      return 'final NameInput name;';
    case 'surname':
      return 'final SurnameInput surname;';
    case 'email':
      return 'final EmailInput email;';
    case 'phone':
      return 'final PhoneInput phone;';
    case 'birthDate':
      return 'final BirthDateInput birthDate;';
    case 'gender':
      return 'final GenderInput gender;';
    case 'document':
      return `final ${documentInputClass(options, naming.countryPrefix)} document;`;
    case 'issueDate':
      return `final ${naming.countryPrefix}IssueDateInput issueDate;`;
    case 'loyaltyId':
      return `final ${naming.countryPrefix}LoyaltyIdInput loyaltyId;`;
  }
}

function formInitialField(field: PiFormField, naming: PiMarketNaming, options: PiMarketOptions): string {
  switch (field) {
    case 'name':
      return 'name: NameInput.pure(),';
    case 'surname':
      return 'surname: SurnameInput.pure(),';
    case 'email':
      return 'email: const EmailInput.pure(),';
    case 'phone':
      return 'phone: PhoneInput.pure(),';
    case 'birthDate':
      return 'birthDate: const BirthDateInput.pure(),';
    case 'gender':
      return 'gender: const GenderInput.pure(),';
    case 'document':
      return `document: const ${documentInputClass(options, naming.countryPrefix)}.pure(),`;
    case 'issueDate':
      return `issueDate: const ${naming.countryPrefix}IssueDateInput.pure(),`;
    case 'loyaltyId':
      return `loyaltyId: ${naming.countryPrefix}LoyaltyIdInput.pure(validPrefixes: const []),`;
  }
}

function formFromCustomerField(
  field: PiFormField,
  naming: PiMarketNaming,
  options: PiMarketOptions,
): string {
  switch (field) {
    case 'name':
      return "name: NameInput.dirty(customer.firstName ?? '', rules: validation.name),";
    case 'surname':
      return "surname: SurnameInput.dirty(customer.lastName ?? '', rules: validation.surname),";
    case 'email':
      return 'email: EmailInput.dirty(customer.email),';
    case 'phone':
      return `phone: PhoneInput.dirty(
        PhoneValue.fromRaw(
          raw: customer.phone ?? '',
          availablePrefixes: phonePrefixes,
        ),
        rules: validation.phone,
      ),`;
    case 'birthDate':
      return 'birthDate: BirthDateInput.dirty(customer.birthDay, rules: validation.birthDate),';
    case 'gender':
      return 'gender: GenderInput.dirty(Gender.fromValue(customer.gender)),';
    case 'document':
      if (options.documentMode === 'custom') {
        return `document: ${documentInputClass(options, naming.countryPrefix)}.dirty(customer.document ?? ''),`;
      }
      return `document: ${documentInputClass(options, naming.countryPrefix)}.dirty(docValue),`;
    case 'issueDate':
      return `issueDate: ${naming.countryPrefix}IssueDateInput.dirty(customer.documentIssueDate),`;
    case 'loyaltyId':
      return `loyaltyId: ${naming.countryPrefix}LoyaltyIdInput.dirty(
        value: customer.loyaltyId ?? '',
        validPrefixes: loyaltyIdPrefixes,
      ),`;
  }
}

function formCopyWithParam(field: PiFormField, naming: PiMarketNaming, options: PiMarketOptions): string {
  const type = formFieldDeclaration(field, naming, options).replace('final ', '').replace(';', '?');
  const name = field === 'loyaltyId' ? 'loyaltyId' : field;
  return `${type}`;
}

function formHasChangeLine(field: PiFormField, options: PiMarketOptions): string {
  switch (field) {
    case 'phone':
      return '_phoneHasChanges(other) ||';
    case 'document':
      return options.documentMode === 'selector'
        ? '_documentHasChanges(other) ||'
        : 'document.value != other.document.value ||';
    case 'gender':
      return 'gender.value != other.gender.value ||';
    default:
      return `${field}.value != other.${field}.value ||`;
  }
}

function bodyWidgetBlock(
  field: PiFormField,
  naming: PiMarketNaming,
  options: PiMarketOptions,
): string {
  const spacer = 'SizedBox(height: context.theme.spacing.spacing3xl),';
  switch (field) {
    case 'name':
      return `${spacer}
        NameField(
          value: form.name.value,
          label: i18n.nameLabel,
          rules: form.name.rules,
          i18n: i18n,
          submitted: showErrors,
          enabled: editability.name,
          onChanged: (v) => bloc.add(PersonalInformationEvent.nameChanged(v)),
        ),`;
    case 'surname':
      return `${spacer}
        SurnameField(
          value: form.surname.value,
          label: i18n.surnameLabel,
          rules: form.surname.rules,
          i18n: i18n,
          submitted: showErrors,
          enabled: editability.surname,
          onChanged: (v) =>
              bloc.add(PersonalInformationEvent.surnameChanged(v)),
        ),`;
    case 'email':
      return `${spacer}
        EmailField(
          value: form.email.value,
          label: i18n.emailLabel,
          enabled: editability.email,
          showError: showErrors,
          errorMessage: showErrors
              ? PiValidationMessages.email(form.email.error, i18n)
              : null,
          onChanged: (v) => bloc.add(PersonalInformationEvent.emailChanged(v)),
        ),`;
    case 'document':
      if (options.documentMode === 'custom') {
        return `${spacer}
        ${naming.countryPrefix}CustomDocumentField(
          value: form.document.value,
          label: i18n.defaultDocumentTypeLabel,
          enabled: editability.document,
          showError: showErrors,
          error: form.document.error,
          errorMessage: showErrors
              ? PiValidationMessages.arDocument(form.document.error, i18n)
              : null,
          onChanged: (v) => bloc.add(
            PersonalInformationEvent.documentChanged(
              DocumentValue(
                type: documentTypes.isNotEmpty
                    ? documentTypes.first
                    : DocumentTypeConfig(
                        key: 'doc',
                        displayName: 'Document',
                        code: 'DOC',
                        validation: RegExp('.*'),
                      ),
                number: v,
              ),
            ),
          ),
        ),`;
      }
      return `${spacer}
        DocumentField(
          value: form.document.documentValue,
          fallbackLabel: i18n.defaultDocumentTypeLabel,
          enabled: editability.document,
          showError: showErrors,
          errorMessage: showErrors
              ? PiValidationMessages.arDocument(form.document.error, i18n)
              : null,
          documentTypes: docTypeOptions,
          onChanged: (v) {
            final cur = form.document.documentValue;
            bloc.add(
              PersonalInformationEvent.documentChanged(
                DocumentValue(type: cur.type, number: v),
              ),
            );
          },
          onTypeChanged: (t) {
            final dt = documentTypes.firstWhere(
              (d) => d.key == t.key,
              orElse: () => documentTypes.first,
            );
            final cur = form.document.documentValue;
            bloc.add(
              PersonalInformationEvent.documentChanged(
                DocumentValue(type: dt, number: cur.number),
              ),
            );
          },
        ),`;
    case 'gender':
      return `${spacer}
        GenderField(
          value: form.gender.value,
          label: i18n.genderLabel,
          maleLabel: i18n.genderMale,
          femaleLabel: i18n.genderFemale,
          enabled: editability.gender,
          showError: showErrors,
          errorMessage: showErrors
              ? PiValidationMessages.gender(form.gender.error, i18n)
              : null,
          onChanged: (v) => bloc.add(PersonalInformationEvent.genderChanged(v)),
        ),`;
    case 'birthDate':
      return `${spacer}
        BirthDateField(
          value: form.birthDate.value,
          label: i18n.birthDateLabel,
          rules: form.birthDate.rules,
          i18n: i18n,
          submitted: showErrors,
          dateFormat: birthDateFormat,
          enabled: editability.birthDate,
          onChanged: (v) =>
              bloc.add(PersonalInformationEvent.birthDateChanged(v)),
        ),`;
    case 'issueDate':
      return `${spacer}
        ${naming.countryPrefix}IssueDateField(
          value: form.issueDate.value,
          label: i18n.issueDateLabel,
          dateFormat: birthDateFormat,
          enabled: editability.issueDate,
          showError: showErrors,
          error: form.issueDate.error,
          errorMessage: showErrors
              ? PiValidationMessages.issueDate(form.issueDate.error, i18n)
              : null,
          onChanged: (v) =>
              bloc.add(PersonalInformationEvent.issueDateChanged(v)),
        ),`;
    case 'phone':
      return `${spacer}
        PhoneField(
          value: form.phone.phoneValue,
          label: i18n.phoneNumberLabel,
          rules: form.phone.rules,
          i18n: i18n,
          locale: phoneLocale,
          submitted: showErrors,
          prefixes: phonePrefixes,
          enabled: editability.phone,
          onChanged: (v) => bloc.add(
            PersonalInformationEvent.phoneChanged(
              PhoneValue(prefix: form.phone.phoneValue.prefix, local: v),
            ),
          ),
          onPrefixChanged: (prefix) => bloc.add(
            PersonalInformationEvent.phoneChanged(
              PhoneValue(prefix: prefix, local: form.phone.phoneValue.local),
            ),
          ),
        ),`;
    case 'loyaltyId':
      return `${spacer}
        ${naming.countryPrefix}LoyaltyIdField(
          value: form.loyaltyId.value,
          label: i18n.loyaltyIdLabel,
          enabled: editability.loyaltyId,
          showError: showErrors,
          error: form.loyaltyId.error,
          errorMessage: showErrors
              ? PiValidationMessages.loyaltyId(form.loyaltyId.error, i18n)
              : null,
          onChanged: (v) =>
              bloc.add(PersonalInformationEvent.loyaltyIdChanged(v)),
        ),`;
  }
}

function toPiFormDataLines(options: PiMarketOptions): string {
  const lines: string[] = [];
  if (hasField(options, 'name')) lines.push('name: form.name.value,');
  if (hasField(options, 'surname')) lines.push('surname: form.surname.value,');
  if (hasField(options, 'email')) {
    lines.push('email: form.email.value,');
  } else {
    lines.push('email: customer.email,');
  }
  if (hasField(options, 'phone')) {
    lines.push('phone: form.phone.phoneValue.fullNumber,');
  } else {
    lines.push("phone: customer.phone ?? '',");
  }
  if (hasField(options, 'birthDate')) {
    lines.push('birthDate: form.birthDate.value,');
  }
  if (hasField(options, 'document')) {
    if (options.documentMode === 'custom') {
      lines.push('document: form.document.value,');
      lines.push(`documentType: DocumentTypeConfig(
            key: 'doc',
            displayName: 'Document',
            code: 'DOC',
            validation: RegExp('.*'),
          ),`);
    } else {
      lines.push('document: form.document.documentValue.number,');
      lines.push('documentType: form.document.documentValue.type,');
    }
  } else {
    lines.push("document: customer.document ?? '',");
    lines.push(`documentType: customer.documentType != null
        ? DocumentTypeConfig(
            key: customer.documentType!.value,
            displayName: customer.documentType!.value,
            code: customer.documentType!.value,
            validation: RegExp('.*'),
          )
        : DocumentTypeConfig(
            key: 'dni',
            displayName: 'DNI',
            code: 'DNI',
            validation: RegExp('.*'),
          ),`);
  }
  if (hasField(options, 'gender')) {
    lines.push('gender: form.gender.value?.value,');
  }
  if (hasField(options, 'issueDate')) {
    lines.push('issueDate: form.issueDate.value,');
  }
  if (hasField(options, 'loyaltyId')) {
    lines.push('loyaltyId: form.loyaltyId.value,');
  }
  lines.push('groups: customer.groups,');
  return lines.join('\n    ');
}

export function personalInformationFormTemplate(
  naming: PiMarketNaming,
  options: PiMarketOptions,
): string {
  const fields = sortFields(options.fields);
  const needsDocumentTypes = hasField(options, 'document') && options.documentMode === 'selector';
  const needsLoyaltyPrefixes = hasField(options, 'loyaltyId');

  const constructorParams = fields
    .map((f) => `required this.${f},`)
    .join('\n    ');

  const fieldDecls = fields.map((f) => formFieldDeclaration(f, naming, options)).join('\n  ');
  const initialFields = fields.map((f) => formInitialField(f, naming, options)).join('\n      ');
  const inputsList = `[${fields.join(', ')}]`;

  const fromCustomerParams = [
    'Customer customer,',
    ...(needsDocumentTypes ? ['List<DocumentTypeConfig> documentTypes,'] : []),
    'List<String> phonePrefixes,',
    ...(needsLoyaltyPrefixes ? ['List<String> loyaltyIdPrefixes = const [],'] : []),
    'PiFieldValidation validation,',
  ].join('\n    ');

  const docSetup = needsDocumentTypes
    ? `final docType =
        documentTypes.findByKey(customer.documentType?.value) ??
        (documentTypes.isNotEmpty ? documentTypes.first : null);
    final docValue = DocumentValue(
      type: docType ?? documentTypes.first,
      number: customer.document ?? '',
    );
`
    : '';

  const fromCustomerFields = fields
    .map((f) => formFromCustomerField(f, naming, options))
    .join('\n      ');

  const hasChangesLines = fields
    .map((f) => formHasChangeLine(f, options))
    .join('\n        ');
  const hasChangesBody = `return ${hasChangesLines.slice(0, -2)};`;

  const copyWithParams = fields
    .map((f) => formCopyWithParam(f, naming, options))
    .join('\n    ');
  const copyWithBody = fields
    .map((f) => `${f}: ${f} ?? this.${f},`)
    .join('\n      ');

  const documentHasChanges = needsDocumentTypes
    ? `
  bool _documentHasChanges(${naming.formClass} other) {
    final a = document.documentValue;
    final b = other.document.documentValue;
    if (a.type.key != b.type.key) return true;
    final aNumber = a.number.replaceAll(RegExp(r'[.\\-]'), '');
    final bNumber = b.number.replaceAll(RegExp(r'[.\\-]'), '');
    return aNumber != bNumber;
  }
`
    : '';

  const phoneHasChanges = hasField(options, 'phone')
    ? `
  bool _phoneHasChanges(${naming.formClass} other) {
    final aDigits = phone.phoneValue.fullNumber.replaceAll(RegExp(r'\\D'), '');
    final bDigits = other.phone.phoneValue.fullNumber.replaceAll(
      RegExp(r'\\D'),
      '',
    );
    return aDigits != bDigits;
  }
`
    : '';

  return `import 'package:core/core.dart';
import 'package:formz/formz.dart';
import 'package:personal_information/personal_information.dart';

/// ${options.countryName}-specific Formz form.
///
/// Fields: ${fieldsLabel(options)}.
class ${naming.formClass} with FormzMixin {
  const ${naming.formClass}({
    ${constructorParams}
  });

  factory ${naming.formClass}.fromCustomer(
    ${fromCustomerParams}
  ) {
    ${docSetup}    return ${naming.formClass}(
      ${fromCustomerFields}
    );
  }

  factory ${naming.formClass}.initial() {
    // ignore: prefer_const_constructors
    return ${naming.formClass}(
      ${initialFields}
    );
  }

  ${fieldDecls}

  @override
  List<FormzInput<dynamic, dynamic>> get inputs => ${inputsList};

  bool hasChanges(${naming.formClass} other) {
    ${hasChangesBody}
  }
${documentHasChanges}${phoneHasChanges}
  ${naming.formClass} copyWith({
    ${copyWithParams}
  }) {
    return ${naming.formClass}(
      ${copyWithBody}
    );
  }
}
`;
}

export function personalInformationBodyTemplate(
  naming: PiMarketNaming,
  options: PiMarketOptions,
): string {
  const fields = sortFields(options.fields);
  const needsDocumentParams =
    hasField(options, 'document') &&
    (options.documentMode === 'selector' || options.documentMode === 'custom');

  const bodyBlocks = fields.map((f, i) => {
    const block = bodyWidgetBlock(f, naming, options);
    if (i === 0) return block.replace('SizedBox(height: context.theme.spacing.spacing3xl),', '');
    return block;
  });

  const extraParams = needsDocumentParams
    ? `required this.docTypeOptions,
    required this.documentTypes,`
    : '';

  const extraFields = needsDocumentParams
    ? `final List<DocumentTypeOption> docTypeOptions;
  final List<core.DocumentTypeConfig> documentTypes;`
    : '';

  const extraCtorArgs = needsDocumentParams
    ? `docTypeOptions: docTypeOptions,
    documentTypes: documentTypes,`
    : '';

  const imports = needsDocumentParams
    ? `import 'package:core/core.dart' as core;
import 'package:design_system/design_system.dart';`
    : `import 'package:design_system/design_system.dart';`;

  return `${imports}
import 'package:flutter/material.dart';
import 'package:personal_information/personal_information.dart';

/// ${options.countryName} personal-information body.
///
/// Fields: ${fieldsLabel(options)}.
class ${naming.bodyClass} extends StatelessWidget {
  const ${naming.bodyClass}({
    required this.form,
    required this.editability,
    required this.showErrors,
    required this.phonePrefixes,
    required this.bloc,
    required this.i18n,
    required this.birthDateFormat,
    required this.phoneLocale,
    ${extraParams}
    super.key,
  });

  final ${naming.formClass} form;
  final FieldEditability editability;
  final bool showErrors;
  final List<String> phonePrefixes;
  final PersonalInformationBloc bloc;
  final WlPersonalInformationI18n i18n;
  final String birthDateFormat;
  final Locale phoneLocale;
  ${extraFields}

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ${bodyBlocks.join('\n        ')}
      ],
    );
  }
}
`;
}

export function piFormStateTemplate(
  naming: PiMarketNaming,
  options: PiMarketOptions,
): string {
  return `// ---------------------------------------------------------------------------
// ${options.countryName}
// ---------------------------------------------------------------------------

final class ${naming.formStateClass} extends PiFormState {
  // ignore: prefer_const_constructors
  ${naming.formStateClass}({required this.form});

  final ${naming.formClass} form;

  @override
  List<FormzInput<dynamic, dynamic>> get inputs => form.inputs;

  @override
  PiFormData toPiFormData({required Customer customer}) => PiFormData(
    ${toPiFormDataLines(options)}
  );

  @override
  bool hasChanges(PiFormState initial) =>
      initial is ${naming.formStateClass} && form.hasChanges(initial.form);
}
`;
}

export function blocInitialFormCase(
  naming: PiMarketNaming,
  options: PiMarketOptions,
): string {
  const needsDocumentTypes = hasField(options, 'document') && options.documentMode === 'selector';
  const args = [
    'customer,',
    ...(needsDocumentTypes ? ['_documentTypesFor(customer),'] : []),
    '_phonePrefixesList(),',
    '_piConfig.fieldValidation,',
  ].join('\n          ');

  return `      ${naming.configClass}() => ${naming.formStateClass}(
        form: ${naming.formClass}.fromCustomer(
          ${args}
        ),
      ),`;
}

export function blocFieldCase(
  naming: PiMarketNaming,
  field: string,
  options: PiMarketOptions,
): string {
  switch (field) {
    case 'name':
      return `        ${naming.formStateClass}(:final form) => ${naming.formStateClass}(
          form: form.copyWith(name: _piConfig.dirtyName(event.value)),
        ),`;
    case 'surname':
      return `        ${naming.formStateClass}(:final form) => ${naming.formStateClass}(
          form: form.copyWith(surname: _piConfig.dirtySurname(event.value)),
        ),`;
    case 'email':
      return `        ${naming.formStateClass}(:final form) => ${naming.formStateClass}(
          form: form.copyWith(email: EmailInput.dirty(event.value)),
        ),`;
    case 'phone':
      return `        ${naming.formStateClass}(:final form) => ${naming.formStateClass}(
          form: form.copyWith(phone: phone),
        ),`;
    case 'birthDate':
      return `        ${naming.formStateClass}(:final form) => ${naming.formStateClass}(
          form: form.copyWith(birthDate: bd),
        ),`;
    case 'gender':
      return `        ${naming.formStateClass}(:final form) => ${naming.formStateClass}(
          form: form.copyWith(gender: GenderInput.dirty(event.value)),
        ),`;
    case 'document':
      if (options.documentMode === 'custom') {
        return `        ${naming.formStateClass}(:final form) => ${naming.formStateClass}(
          form: form.copyWith(
            document: ${documentInputClass(options, naming.countryPrefix)}.dirty(event.value.number),
          ),
        ),`;
      }
      return `        ${naming.formStateClass}(:final form) => ${naming.formStateClass}(
          form: form.copyWith(
            document: ${documentInputClass(options, naming.countryPrefix)}.dirty(event.value),
          ),
        ),`;
    case 'issueDate':
      return `        ${naming.formStateClass}(:final form) => ${naming.formStateClass}(
          form: form.copyWith(
            issueDate: ${naming.countryPrefix}IssueDateInput.dirty(event.value),
          ),
        ),`;
    case 'loyaltyId':
      return `        ${naming.formStateClass}(:final form) => ${naming.formStateClass}(
          form: form.copyWith(
            loyaltyId: ${naming.countryPrefix}LoyaltyIdInput.dirty(value: event.value),
          ),
        ),`;
    default:
      return '';
  }
}

export function viewBodyCase(
  naming: PiMarketNaming,
  options: PiMarketOptions,
): string {
  const needsDocumentParams =
    hasField(options, 'document') &&
    (options.documentMode === 'selector' || options.documentMode === 'custom');

  const docArgs = needsDocumentParams
    ? `docTypeOptions: docTypeOptions,
                documentTypes: widget.documentTypes,`
    : '';

  return `              ${naming.formStateClass}(:final form) => ${naming.bodyClass}(
                form: form,
                editability: FieldEditability.forConfig(
                  customer: customer,
                  config: widget.piConfig,
                ),
                showErrors: showErrors,
                ${docArgs}
                phonePrefixes: widget.phonePrefixes,
                bloc: bloc,
                i18n: i18n,
                birthDateFormat: birthDateFormat,
                phoneLocale: phoneLocale,
              ),`;
}

export function countryBarrelTemplate(
  naming: PiMarketNaming,
  options: PiMarketOptions,
): string {
  const exports = [
    `export '${naming.countryDir}_personal_information_body.dart';`,
    `export '${naming.countryDir}_personal_information_form.dart';`,
  ];
  const needsFieldsBarrel =
    hasField(options, 'issueDate') ||
    (hasField(options, 'document') && options.documentMode === 'custom');
  if (hasField(options, 'loyaltyId')) {
    exports.push("export 'widgets/widgets.dart';");
  }
  if (needsFieldsBarrel) {
    exports.push("export 'fields/fields.dart';");
  }
  if (
    hasField(options, 'document') ||
    hasField(options, 'loyaltyId') ||
    hasField(options, 'issueDate')
  ) {
    exports.push("export 'inputs/inputs.dart';");
  }
  return exports.join('\n') + '\n';
}
