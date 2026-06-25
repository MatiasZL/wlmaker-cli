import * as fs from 'fs';
import { injectExport } from '../../dart/injector.js';
import type { BlocFieldHandler } from './field-catalog.js';
import type { PiMarketOptions } from './market-types.js';
import { blocFieldCase } from './template-builders.js';

export function insertLineBefore(
  content: string,
  anchor: string,
  line: string,
): string {
  if (content.includes(line.trim())) return content;
  const index = content.indexOf(anchor);
  if (index === -1) {
    throw new Error(`Anchor not found: ${anchor}`);
  }
  return content.slice(0, index) + line + '\n' + content.slice(index);
}

export function insertAfterAnchor(
  content: string,
  anchor: string,
  insertion: string,
): string {
  const dedupKey = insertion.trim().split('\n')[0]?.trim();
  if (dedupKey && content.includes(dedupKey)) return content;

  const index = content.indexOf(anchor);
  if (index === -1) {
    throw new Error(`Anchor not found: ${anchor}`);
  }

  const insertAt = index + anchor.length;
  return (
    content.slice(0, insertAt) +
    '\n' +
    insertion +
    content.slice(insertAt)
  );
}

export function appendBeforeFileEnd(content: string, block: string): string {
  const marker = block.trim().split('\n')[0]?.trim();
  if (marker && content.includes(marker)) return content;
  return content.trimEnd() + '\n\n' + block + '\n';
}

export function patchPartDirective(
  filePath: string,
  partLine: string,
): void {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(partLine)) return;

  const partRegex = /^part\s+'[^']+';$/gm;
  const parts = [...content.matchAll(partRegex)];
  if (parts.length === 0) {
    throw new Error(`No part directives found in ${filePath}`);
  }

  const lastPart = parts[parts.length - 1];
  const insertAt = lastPart.index! + lastPart[0].length;
  content =
    content.slice(0, insertAt) + '\n' + partLine + content.slice(insertAt);
  fs.writeFileSync(filePath, content);
}

export function patchPiConfigFactory(
  filePath: string,
  appTypeEnum: string,
  configClass: string,
): void {
  let content = fs.readFileSync(filePath, 'utf8');
  const branch = `    AppType.${appTypeEnum} => const ${configClass}(),`;
  if (content.includes(branch)) return;

  content = insertLineBefore(
    content,
    '    AppType.us => const PiConfigUs(),',
    branch,
  );
  fs.writeFileSync(filePath, content);
}

export function patchBarrelExport(filePath: string, exportLine: string): void {
  injectExport(filePath, exportLine);
}

const BLOC_FIELD_ANCHORS: Record<BlocFieldHandler, string> = {
  name: `        UsPiFormState(:final form) => UsPiFormState(
          form: form.copyWith(name: _piConfig.dirtyName(event.value)),
        ),`,
  surname: `        UsPiFormState(:final form) => UsPiFormState(
          form: form.copyWith(surname: _piConfig.dirtySurname(event.value)),
        ),`,
  phone: `        UsPiFormState(:final form) => UsPiFormState(
          form: form.copyWith(phone: phone),
        ),`,
  birthDate: `        UsPiFormState(:final form) => UsPiFormState(
          form: form.copyWith(birthDate: bd),
        ),`,
  email: `        BrPiFormState(:final form) => BrPiFormState(
          form: form.copyWith(email: EmailInput.dirty(event.value)),
        ),`,
  gender: `        ArPiFormState(:final form) => ArPiFormState(
          form: form.copyWith(gender: GenderInput.dirty(event.value)),
        ),`,
  document: `        CoPiFormState(:final form) => CoPiFormState(
          form: form.copyWith(document: coDoc),
        ),`,
  issueDate: `        CoPiFormState(:final form) => CoPiFormState(
          form: form.copyWith(
            issueDate: CoIssueDateInput.dirty(event.value),
          ),
        ),`,
  loyaltyId: `        UsPiFormState(:final form) => UsPiFormState(
          form: form.copyWith(
            loyaltyId: UsLoyaltyIdInput.dirty(value: event.value),
          ),
        ),`,
};

export function patchBlocSwitchCases(
  filePath: string,
  naming: { formStateClass: string },
  fields: BlocFieldHandler[],
  initialFormCase: string,
  options: PiMarketOptions,
): void {
  let content = fs.readFileSync(filePath, 'utf8');

  const initialAnchor = `      PiConfigUs() => UsPiFormState(
        form: UsPersonalInformationForm.fromCustomer(
          customer,
          _phonePrefixesList(),
          validation: _piConfig.fieldValidation,
        ),
      ),`;
  content = insertAfterAnchor(content, initialAnchor, '\n' + initialFormCase);

  for (const field of fields) {
    const anchor = BLOC_FIELD_ANCHORS[field];
    const caseLine = blocFieldCase(naming, field, options);
    if (caseLine) {
      content = insertAfterAnchor(content, anchor, '\n' + caseLine);
    }
  }

  fs.writeFileSync(filePath, content);
}

export function patchViewBodyCase(
  filePath: string,
  viewCase: string,
): void {
  let content = fs.readFileSync(filePath, 'utf8');
  const anchor = `                  UsPiFormState(:final form) => UsPersonalInformationBody(
                    form: form,
                    editability: FieldEditability.forConfig(
                      customer: customer,
                      config: widget.piConfig,
                    ),
                    showErrors: showErrors,
                    phonePrefixes: widget.phonePrefixes,
                    bloc: bloc,
                    i18n: i18n,
                    birthDateFormat: birthDateFormat,
                    phoneLocale: phoneLocale,
                  ),`;
  content = insertAfterAnchor(content, anchor, '\n' + viewCase);
  fs.writeFileSync(filePath, content);
}

export function patchPiFormState(
  filePath: string,
  formStateClass: string,
  block: string,
): void {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(`final class ${formStateClass}`)) return;
  content = appendBeforeFileEnd(content, block);
  fs.writeFileSync(filePath, content);
}

export function patchPiConfigShellEmailInForm(
  filePath: string,
  configClass: string,
): void {
  let content = fs.readFileSync(filePath, 'utf8');
  const anchor = 'emailInForm: this is PiConfigBrazil,';
  const addition = ` || this is ${configClass}`;
  if (content.includes(addition)) return;

  const index = content.indexOf(anchor);
  if (index === -1) return;

  const insertAt = index + anchor.length;
  content =
    content.slice(0, insertAt) + addition + content.slice(insertAt);
  fs.writeFileSync(filePath, content);
}
