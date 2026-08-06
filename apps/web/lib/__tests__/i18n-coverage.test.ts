import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Translation coverage guard for the shared locale bundles.
 *
 * The product ships a 12-language picker, and 10 of the 11 non-English locales
 * are only partly translated — overwhelmingly in `pricing.json`, where 115 of
 * 178 keys are English-only everywhere except Spanish.
 *
 * That is a TRANSLATION BACKLOG, not a rendering defect, and the distinction
 * matters: `baseInitOptions.fallbackLng` is `en`, so a missing key renders the
 * English string rather than a raw `pricing.freeTierBody` identifier. A user
 * sees a half-translated page, not a broken one. Machine-filling those keys
 * would be worse than the gap — wrong prices or wrong plan names in a language
 * nobody on the team reads is a billing problem, not a polish problem.
 *
 * So this file does the two things that ARE engineering's job:
 *   1. pin the fallback, because that is the guarantee separating
 *      "half-translated" from "broken";
 *   2. ratchet coverage, so a locale can gain keys but never silently lose them.
 *
 * When you translate a namespace, raise that locale's number here. The test
 * tells you what to change.
 */

const localesDir = resolve(import.meta.dirname, '../../../../packages/ui/i18n/locales');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

const namespaces = readdirSync(resolve(localesDir, 'en')).filter((f) => f.endsWith('.json'));
const locales = readdirSync(localesDir).filter((l) => l !== 'en');

function coverageFor(locale: string): { translated: number; total: number } {
  let translated = 0;
  let total = 0;
  for (const ns of namespaces) {
    const en = readJson(resolve(localesDir, 'en', ns));
    let target: Record<string, unknown> = {};
    try {
      target = readJson(resolve(localesDir, locale, ns));
    } catch {
      target = {};
    }
    total += Object.keys(en).length;
    translated += Object.keys(en).filter((k) => k in target).length;
  }
  return { translated, total };
}

/**
 * Current translated-key counts, measured 2026-08-05. RATCHET ONLY — raise a
 * number when you add translations; never lower one to make the suite pass.
 */
const COVERAGE_FLOOR: Record<string, number> = {
  ar: 350,
  de: 350,
  es: 512,
  fr: 350,
  hi: 373,
  it: 350,
  ja: 350,
  ko: 350,
  pt: 350,
  ru: 350,
  zh: 350,
};

describe('shared i18n bundles', () => {
  it('falls back to English, so a missing key never renders as a raw key', () => {
    // This is the guarantee that makes partial translation acceptable. Without
    // it every untranslated string becomes a visible identifier.
    const source = readFileSync(resolve(localesDir, '../src/index.ts'), 'utf8');
    expect(source).toMatch(/fallbackLng:\s*DEFAULT_LANGUAGE/);
    expect(source).toMatch(/DEFAULT_LANGUAGE\s*=\s*'en'/);
  });

  it('covers every locale in the ratchet, so a new language cannot skip the guard', () => {
    expect(new Set(Object.keys(COVERAGE_FLOOR))).toEqual(new Set(locales));
  });

  it.each(locales)('%s never loses translated keys', (locale) => {
    const { translated, total } = coverageFor(locale);
    const floor = COVERAGE_FLOOR[locale] ?? 0;

    expect(
      translated,
      `${locale} dropped from ${floor} to ${translated} translated keys of ${total}. ` +
        'Translations were removed or English gained keys this locale did not. ' +
        'Add the missing translations rather than lowering the floor.',
    ).toBeGreaterThanOrEqual(floor);
  });

  it('has no locale key that English does not define', () => {
    // An orphan key is either a typo or a string English dropped; either way it
    // is dead weight that never renders.
    for (const locale of locales) {
      for (const ns of namespaces) {
        const en = Object.keys(readJson(resolve(localesDir, 'en', ns)));
        let target: string[] = [];
        try {
          target = Object.keys(readJson(resolve(localesDir, locale, ns)));
        } catch {
          continue;
        }
        const orphans = target.filter((k) => !en.includes(k));
        expect(orphans, `${locale}/${ns} defines keys English does not`).toEqual([]);
      }
    }
  });
});
