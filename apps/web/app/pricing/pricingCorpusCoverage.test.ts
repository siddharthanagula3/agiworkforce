import { describe, expect, it } from 'vitest';
import { resources, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '@agiworkforce/i18n';

type Corpus = Record<string, Record<string, unknown>>;

function flatten(node: unknown, prefix = ''): Array<[string, string]> {
  if (typeof node !== 'object' || node === null) return [[prefix, String(node)]];
  return Object.entries(node).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key),
  );
}

function placeholders(value: string, key: string): string[] {
  const found = value.match(/{{[^}]+}}/g) ?? [];
  // A singular plural form may spell the number out ("one seat"), so {{count}}
  // is the one placeholder a `_one` translation is allowed to drop.
  return found.filter((token) => !(key.endsWith('_one') && token === '{{count}}')).sort();
}

const corpus = resources as Corpus;
const english = new Map(flatten(corpus[DEFAULT_LANGUAGE]?.['pricing'] ?? {}));
const translated = SUPPORTED_LANGUAGES.filter((lang) => lang.code !== DEFAULT_LANGUAGE);

describe('pricing corpus coverage · /pricing must not render half-translated', () => {
  it.each(translated.map((lang) => lang.code))('translates every pricing key for %s', (code) => {
    const locale = new Map(flatten(corpus[code]?.['pricing'] ?? {}));

    const missing = [...english.keys()].filter((key) => !(locale.get(key) ?? '').trim());
    const brokenInterpolation = [...english.entries()]
      .filter(([key]) => locale.has(key))
      .filter(
        ([key, value]) =>
          placeholders(locale.get(key) as string, key).join() !== placeholders(value, key).join(),
      )
      .map(([key]) => key);

    expect(missing).toEqual([]);
    expect(brokenInterpolation).toEqual([]);
  });
});
