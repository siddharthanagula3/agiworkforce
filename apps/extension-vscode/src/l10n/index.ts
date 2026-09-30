import * as vscode from 'vscode';

import { VSCODE_CATALOGS as CATALOGS, type VsCodeMessageKey } from '@agiworkforce/i18n/vscode';

export const DEFAULT_LOCALE = 'en';

export type MessageKey = VsCodeMessageKey;

export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_other` ? Base : never;
}[MessageKey];

export interface PluralForms {
  locale: string;
  forms: Readonly<Partial<Record<PluralCategory, string>>>;
}

type MessageArgs = Readonly<Record<string, string | number>>;

export function resolveLocale(displayLanguage: string | undefined): string {
  const base = (displayLanguage ?? '').split(/[-_]/u)[0]?.toLowerCase() ?? '';
  return base in CATALOGS ? base : DEFAULT_LOCALE;
}

function activeLocale(): string {
  return resolveLocale(vscode.env.language);
}

function fill(template: string, args: MessageArgs | undefined): string {
  if (args === undefined) return template;
  return Object.entries(args).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    template,
  );
}

export function t(key: MessageKey, args?: MessageArgs): string {
  return fill(CATALOGS[activeLocale()]?.[key] ?? CATALOGS[DEFAULT_LOCALE]?.[key] ?? key, args);
}

export function pluralForms(key: PluralKey): PluralForms {
  const requested = activeLocale();
  const locale = CATALOGS[requested]?.[`${key}_other`] === undefined ? DEFAULT_LOCALE : requested;
  const catalog = CATALOGS[locale] ?? {};
  const forms: Partial<Record<PluralCategory, string>> = {};
  for (const category of PLURAL_CATEGORIES) {
    const template = catalog[`${key}_${category}`];
    if (template !== undefined) forms[category] = template;
  }
  return { locale, forms };
}

export function tPlural(key: PluralKey, count: number, args?: MessageArgs): string {
  const { locale, forms } = pluralForms(key);
  const category = new Intl.PluralRules(locale).select(count) as PluralCategory;
  return fill(forms[category] ?? forms.other ?? key, {
    count: new Intl.NumberFormat(locale).format(count),
    ...args,
  });
}

/** Language codes with a catalog. Exported for the parity test. */
export const SUPPORTED_LOCALES: readonly string[] = Object.keys(CATALOGS);

/** The catalog for `locale`, or `undefined`. Exported for the parity test. */
export function catalogFor(locale: string): Readonly<Record<string, string>> | undefined {
  return CATALOGS[locale];
}
