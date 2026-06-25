import type { PiMarketNaming } from './market-types.js';

export function documentSelectorInputTemplate(
  naming: PiMarketNaming,
): string {
  return `import 'package:formz/formz.dart';
import 'package:personal_information/personal_information.dart';

enum ${naming.countryPrefix}DocumentValidationError {
  empty,
  invalid,
}

class ${naming.countryPrefix}DocumentInput
    extends FormzInput<DocumentValue?, ${naming.countryPrefix}DocumentValidationError> {
  const ${naming.countryPrefix}DocumentInput.pure([super.value]) : super.pure();

  const ${naming.countryPrefix}DocumentInput.dirty([super.value]) : super.dirty();

  DocumentValue get documentValue => value ?? DocumentValue.empty;

  @override
  ${naming.countryPrefix}DocumentValidationError? validator(DocumentValue? value) {
    final doc = value ?? DocumentValue.empty;
    final number = doc.number.replaceAll(RegExp(r'[.\\-]'), '');
    if (number.isEmpty) return ${naming.countryPrefix}DocumentValidationError.empty;
    if (!doc.type.validation.hasMatch(number)) {
      return ${naming.countryPrefix}DocumentValidationError.invalid;
    }
    return null;
  }
}

extension ${naming.countryPrefix}DocumentValidationErrorX
    on ${naming.countryPrefix}DocumentValidationError {
  String get message => switch (this) {
        ${naming.countryPrefix}DocumentValidationError.empty => 'documentRequired',
        ${naming.countryPrefix}DocumentValidationError.invalid => 'documentInvalid',
      };
}
`;
}

export function customDocumentInputTemplate(
  naming: PiMarketNaming,
  inputName: string,
): string {
  const className = `${naming.countryPrefix}${inputName}Input`;
  return `import 'package:formz/formz.dart';

enum ${className}ValidationError {
  empty,
  invalid,
}

class ${className} extends FormzInput<String, ${className}ValidationError> {
  const ${className}.pure([super.value = '']) : super.pure();

  const ${className}.dirty([super.value = '']) : super.dirty();

  static final _pattern = RegExp(r'^[a-zA-Z0-9]+$');

  @override
  ${className}ValidationError? validator(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return ${className}ValidationError.empty;
    if (!_pattern.hasMatch(trimmed)) return ${className}ValidationError.invalid;
    return null;
  }
}

extension ${className}ValidationErrorX on ${className}ValidationError {
  String get message => switch (this) {
        ${className}ValidationError.empty => 'documentRequired',
        ${className}ValidationError.invalid => 'documentInvalid',
      };
}
`;
}

export function loyaltyIdInputTemplate(naming: PiMarketNaming): string {
  return `import 'package:formz/formz.dart';

enum ${naming.countryPrefix}LoyaltyIdValidationError {
  invalid,
  invalidPrefix,
}

class ${naming.countryPrefix}LoyaltyIdInput
    extends FormzInput<String, ${naming.countryPrefix}LoyaltyIdValidationError> {
  const ${naming.countryPrefix}LoyaltyIdInput.pure({
    String value = '',
    this.validPrefixes = const [],
  }) : super.pure(value);

  const ${naming.countryPrefix}LoyaltyIdInput.dirty({
    String value = '',
    this.validPrefixes = const [],
  }) : super.dirty(value);

  final List<String> validPrefixes;

  static final _loyaltyIdRegex = RegExp(r"^[a-zA-Z0-9\\s\\-']+\$");

  @override
  ${naming.countryPrefix}LoyaltyIdValidationError? validator(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return null;

    if (!_loyaltyIdRegex.hasMatch(trimmed)) {
      return ${naming.countryPrefix}LoyaltyIdValidationError.invalid;
    }

    if (validPrefixes.isNotEmpty) {
      final hasValidPrefix = validPrefixes.any(trimmed.startsWith);
      if (!hasValidPrefix) {
        return ${naming.countryPrefix}LoyaltyIdValidationError.invalidPrefix;
      }
    }

    return null;
  }

  ${naming.countryPrefix}LoyaltyIdInput copyWith({List<String>? validPrefixes}) {
    return ${naming.countryPrefix}LoyaltyIdInput.dirty(
      value: value,
      validPrefixes: validPrefixes ?? this.validPrefixes,
    );
  }
}

extension ${naming.countryPrefix}LoyaltyIdValidationErrorX
    on ${naming.countryPrefix}LoyaltyIdValidationError {
  String get message => switch (this) {
        ${naming.countryPrefix}LoyaltyIdValidationError.invalid => 'loyaltyIdInvalid',
        ${naming.countryPrefix}LoyaltyIdValidationError.invalidPrefix =>
          'loyaltyIdInvalidPrefix',
      };
}
`;
}

export function issueDateInputTemplate(naming: PiMarketNaming): string {
  return `import 'package:formz/formz.dart';

enum ${naming.countryPrefix}IssueDateValidationError {
  empty,
  futureDate,
}

class ${naming.countryPrefix}IssueDateInput
    extends FormzInput<DateTime?, ${naming.countryPrefix}IssueDateValidationError> {
  const ${naming.countryPrefix}IssueDateInput.pure([super.value]) : super.pure();

  const ${naming.countryPrefix}IssueDateInput.dirty([super.value]) : super.dirty();

  @override
  ${naming.countryPrefix}IssueDateValidationError? validator(DateTime? value) {
    if (value == null) return ${naming.countryPrefix}IssueDateValidationError.empty;
    if (value.isAfter(DateTime.now())) {
      return ${naming.countryPrefix}IssueDateValidationError.futureDate;
    }
    return null;
  }
}

extension ${naming.countryPrefix}IssueDateValidationErrorX
    on ${naming.countryPrefix}IssueDateValidationError {
  String get message => switch (this) {
        ${naming.countryPrefix}IssueDateValidationError.empty => 'issueDateRequired',
        ${naming.countryPrefix}IssueDateValidationError.futureDate => 'issueDateFuture',
      };
}
`;
}

export function loyaltyIdFieldWidgetTemplate(naming: PiMarketNaming): string {
  return `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:personal_information/personal_information.dart';

class ${naming.countryPrefix}LoyaltyIdField extends StatefulWidget {
  const ${naming.countryPrefix}LoyaltyIdField({
    required this.value,
    required this.label,
    required this.onChanged,
    this.error,
    this.errorMessage,
    this.enabled = true,
    this.showError = false,
    super.key,
  });

  final String value;
  final String label;
  final ValueChanged<String> onChanged;
  final ${naming.countryPrefix}LoyaltyIdValidationError? error;
  final String? errorMessage;
  final bool enabled;
  final bool showError;

  @override
  State<${naming.countryPrefix}LoyaltyIdField> createState() =>
      _${naming.countryPrefix}LoyaltyIdFieldState();
}

class _${naming.countryPrefix}LoyaltyIdFieldState
    extends State<${naming.countryPrefix}LoyaltyIdField> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.value);
  }

  @override
  void didUpdateWidget(${naming.countryPrefix}LoyaltyIdField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != _controller.text) {
      _controller.text = widget.value;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return WlInputText(
      controller: _controller,
      label: widget.label,
      enabled: widget.enabled,
      shouldShowError: widget.showError,
      validator: (_) => widget.showError
          ? (widget.errorMessage ?? widget.error?.message)
          : null,
      onChanged: (value, _) => widget.onChanged(value),
    );
  }
}
`;
}

export function issueDateFieldWidgetTemplate(naming: PiMarketNaming): string {
  return `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:personal_information/personal_information.dart';

class ${naming.countryPrefix}IssueDateField extends StatefulWidget {
  const ${naming.countryPrefix}IssueDateField({
    required this.value,
    required this.label,
    required this.onChanged,
    required this.dateFormat,
    this.error,
    this.errorMessage,
    this.enabled = true,
    this.showError = false,
    super.key,
  });

  final DateTime? value;
  final String label;
  final ValueChanged<DateTime?> onChanged;
  final String dateFormat;
  final ${naming.countryPrefix}IssueDateValidationError? error;
  final String? errorMessage;
  final bool enabled;
  final bool showError;

  @override
  State<${naming.countryPrefix}IssueDateField> createState() =>
      _${naming.countryPrefix}IssueDateFieldState();
}

class _${naming.countryPrefix}IssueDateFieldState
    extends State<${naming.countryPrefix}IssueDateField> {
  late final TextEditingController _controller;
  late DateFormat _dateFormatter;

  @override
  void initState() {
    super.initState();
    _dateFormatter = DateFormat(widget.dateFormat);
    _controller = TextEditingController(
      text: widget.value != null ? _dateFormatter.format(widget.value!) : '',
    );
  }

  @override
  void didUpdateWidget(${naming.countryPrefix}IssueDateField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.dateFormat != oldWidget.dateFormat) {
      _dateFormatter = DateFormat(widget.dateFormat);
    }
    if (widget.value != oldWidget.value) {
      _controller.text = widget.value != null
          ? _dateFormatter.format(widget.value!)
          : '';
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return WlInputDate(
      controller: _controller,
      label: widget.label,
      enabled: widget.enabled,
      selectedDate: widget.value,
      dateFormatter: _dateFormatter,
      validator: (_) => widget.showError
          ? (widget.errorMessage ?? widget.error?.message)
          : null,
      onDateChanged: widget.onChanged,
    );
  }
}
`;
}

export function inputsBarrelTemplate(exports: string[]): string {
  return exports.map((e) => `export '${e}';`).join('\n') + '\n';
}

export function widgetsBarrelTemplate(exports: string[]): string {
  return exports.map((e) => `export '${e}';`).join('\n') + '\n';
}

export function fieldsBarrelTemplate(exports: string[]): string {
  return exports.map((e) => `export '${e}';`).join('\n') + '\n';
}

export function customDocumentFieldWidgetTemplate(
  naming: PiMarketNaming,
  inputName: string,
): string {
  const className = `${naming.countryPrefix}${inputName}Input`;
  const fieldClass = `${naming.countryPrefix}CustomDocumentField`;
  const errorEnum = `${className}ValidationError`;
  return `import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:personal_information/personal_information.dart';

class ${fieldClass} extends StatefulWidget {
  const ${fieldClass}({
    required this.value,
    required this.label,
    required this.onChanged,
    this.error,
    this.errorMessage,
    this.enabled = true,
    this.showError = false,
    super.key,
  });

  final String value;
  final String label;
  final ValueChanged<String> onChanged;
  final ${errorEnum}? error;
  final String? errorMessage;
  final bool enabled;
  final bool showError;

  @override
  State<${fieldClass}> createState() => _${fieldClass}State();
}

class _${fieldClass}State extends State<${fieldClass}> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.value);
  }

  @override
  void didUpdateWidget(${fieldClass} oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != _controller.text) {
      _controller.text = widget.value;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return WlInputText(
      controller: _controller,
      label: widget.label,
      enabled: widget.enabled,
      shouldShowError: widget.showError,
      validator: (_) => widget.showError
          ? (widget.errorMessage ?? widget.error?.message)
          : null,
      onChanged: (value, _) => widget.onChanged(value),
    );
  }
}
`;
}
