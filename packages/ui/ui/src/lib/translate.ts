import i18next from 'i18next';

export type UiNamespace =
  'common' | 'chat' | 'settings' | 'auth' | 'errors' | 'models' | 'pricing' | 'v3';

export interface PluralCopy {
  one: string;
  other: string;
}

export function interpolate(template: string, values: Record<string, unknown> | undefined): string {
  if (!values) return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function pluralOptions(
  count: number,
  english: PluralCopy,
  values: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...values,
    count,
    defaultValue: english.other,
    defaultValue_one: english.one,
    defaultValue_other: english.other,
  };
}

export function englishPlural(
  count: number,
  english: PluralCopy,
  values: Record<string, unknown> | undefined,
): string {
  return interpolate(count === 1 ? english.one : english.other, { ...values, count });
}

export function translateUi(
  namespace: UiNamespace,
  key: string,
  english: string,
  values?: Record<string, unknown>,
): string {
  if (!i18next.isInitialized) return interpolate(english, values);
  return i18next.t(key, { ...values, ns: namespace, defaultValue: english }) as string;
}

export function translateUiPlural(
  namespace: UiNamespace,
  key: string,
  count: number,
  english: PluralCopy,
  values?: Record<string, unknown>,
): string {
  if (!i18next.isInitialized) return englishPlural(count, english, values);
  return i18next.t(key, { ...pluralOptions(count, english, values), ns: namespace }) as string;
}
