
import * as vscode from 'vscode';

import ar from './locales/ar';
import de from './locales/de';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import hi from './locales/hi';
import it from './locales/it';
import ja from './locales/ja';
import ko from './locales/ko';
import pt from './locales/pt';
import ru from './locales/ru';
import zh from './locales/zh';

export const DEFAULT_LOCALE = 'en';

const CATALOGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ar,
  de,
  en,
  es,
  fr,
  hi,
  it,
  ja,
  ko,
  pt,
  ru,
  zh,
};

export type MessageKey = keyof typeof en;

export function resolveLocale(displayLanguage: string | undefined): string {
  const base = (displayLanguage ?? '').split(/[-_]/u)[0]?.toLowerCase() ?? '';
  return base in CATALOGS ? base : DEFAULT_LOCALE;
}

function activeLocale(): string {
  return resolveLocale(vscode.env.language);
}

export function t(key: MessageKey, args?: Readonly<Record<string, string | number>>): string {
  const template = CATALOGS[activeLocale()]?.[key] ?? CATALOGS[DEFAULT_LOCALE]?.[key] ?? key;
  if (args === undefined) {
    return template;
  }
  return Object.entries(args).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    template,
  );
}

/** Language codes with a catalog. Exported for the parity test. */
export const SUPPORTED_LOCALES: readonly string[] = Object.keys(CATALOGS);

/** The catalog for `locale`, or `undefined`. Exported for the parity test. */
export function catalogFor(locale: string): Readonly<Record<string, string>> | undefined {
  return CATALOGS[locale];
}
