import i18next from 'i18next';

export type PluralNamespace = 'common' | 'chat' | 'settings';

export interface PluralCopy {
  one: string;
  other: string;
}

function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function translatePlural(
  namespace: PluralNamespace,
  key: string,
  count: number,
  english: PluralCopy,
  values: Record<string, unknown> = {},
): string {
  const options = { ...values, count };
  if (!i18next.isInitialized) {
    return interpolate(count === 1 ? english.one : english.other, options);
  }
  return i18next.t(key, {
    ...options,
    ns: namespace,
    defaultValue: english.other,
    defaultValue_one: english.one,
    defaultValue_other: english.other,
  }) as string;
}
