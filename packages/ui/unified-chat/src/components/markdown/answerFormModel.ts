import type { FormField, FormSpec } from './answerSurfaces';

export type FormValue = string | string[];

export function initialFormValue(field: FormField): FormValue {
  if (field.kind === 'checks')
    return field.options.filter((option) => option.selected).map((option) => option.label);
  if (field.kind === 'select' || field.kind === 'radio')
    return field.options.find((option) => option.selected)?.label ?? '';
  return 'value' in field ? String(field.value) : '';
}

export function formFieldError(field: FormField, value: FormValue): boolean {
  if (field.required && (Array.isArray(value) ? value.length === 0 : value.trim() === ''))
    return true;
  if (field.kind === 'checks')
    return (
      !Array.isArray(value) ||
      value.some((choice) => !field.options.some((option) => option.label === choice))
    );
  if (Array.isArray(value)) return true;
  if (field.kind === 'select' || field.kind === 'radio')
    return value !== '' && !field.options.some((option) => option.label === value);
  if (field.kind === 'slider')
    return (
      !Number.isFinite(Number(value)) || Number(value) < field.min || Number(value) > field.max
    );
  if (field.kind === 'date' && value !== '') {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    );
  }
  return false;
}

export function formFieldErrors(spec: FormSpec, values: readonly FormValue[]): number[] {
  return spec.fields.flatMap((field, index) =>
    formFieldError(field, values[index] ?? '') ? [index] : [],
  );
}

export function formValueText(field: FormField, value: FormValue): string {
  const rendered = Array.isArray(value) ? value.join(', ') : value;
  return `${rendered}${field.kind === 'slider' && field.unit ? ` ${field.unit}` : ''}`;
}

export function formSubmissionText(spec: FormSpec, values: readonly FormValue[]): string {
  const lines = spec.fields.map(
    (field, index) => `${field.label}: ${formValueText(field, values[index] ?? '')}`,
  );
  return [spec.title, ...lines].join('\n');
}
