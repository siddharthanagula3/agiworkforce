import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
