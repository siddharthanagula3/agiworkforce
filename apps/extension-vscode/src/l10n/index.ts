/**
 * l10n/index.ts — Translated strings for extension-host UI.
 *
 * The extension had no localization at all: every notification, button and
 * quick-pick title was an English literal at its call site, so a VS Code
 * running in Japanese still spoke English back. Catalogs are imported (not read
 * from disk) because esbuild inlines them into `out/extension.js`, which is the
 * only runtime file the VSIX allowlist ships. They are `.ts` rather than `.json`
 * because `tsconfig.build.json` is a composite project and its `include` covers
 * only `src/**\/*.ts` — JSON catalogs fail `pnpm --filter agi-workforce check:refs`.
 *
 * Keys are typed against the English catalog, so a typo or a key deleted from
 * `locales/en.ts` fails `pnpm --filter agi-workforce typecheck` rather than
 * surfacing to a user as a raw key.
 */

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

/** The language every key is authored in, and the fallback for the rest. */
export const DEFAULT_LOCALE = 'en';

/**
 * One catalog per language in `packages/ui/i18n`'s `SUPPORTED_LANGUAGES` at the
 * time of writing. Nothing mechanically ties the two lists: the extension does
 * not depend on that package, and no check compares them, so a language added
 * upstream has to be added here by hand.
 */
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

/**
 * Base language of a VS Code display language (`pt-br` → `pt`), or the default
 * when no catalog covers it.
 */
export function resolveLocale(displayLanguage: string | undefined): string {
  const base = (displayLanguage ?? '').split(/[-_]/u)[0]?.toLowerCase() ?? '';
  return base in CATALOGS ? base : DEFAULT_LOCALE;
}

/**
 * Read on every call rather than cached at activation: the mocked `vscode`
 * module tests run against has no stable module lifetime, and the lookup is a
 * property read plus an object index.
 */
function activeLocale(): string {
  return resolveLocale(vscode.env.language);
}

/**
 * Translated message for `key`, with `{name}` placeholders substituted.
 * Falls back to English and then to the key itself, so a gap in a catalog
 * degrades to something a bug report can quote rather than to an empty
 * notification.
 */
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
