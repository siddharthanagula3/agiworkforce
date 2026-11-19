import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SUPPORTED_LANGUAGES } from '@agiworkforce/i18n';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = path.resolve(__dirname, '../../../../../packages/ui/i18n/locales');
const FREE_PLAN_KEYS = ['compareFreeUsage', 'freeTierBody'] as const;

const SMALL_ALLOWANCE_CLAIMS = [
  /\bsmall\b|\blimited\b/iu,
  /pequeñ|pequen/iu,
  /\bklein/iu,
  /\bpetit/iu,
  /piccol/iu,
  /небольш|маленьк/iu,
  /少量|少しの/u,
  /소량|적은/u,
  /صغير/u,
  /छोटा|छोटी|थोड़ा/u,
];

function pricingBundles(): Array<[string, Record<string, string>]> {
  return readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry): [string, Record<string, string>] => [
      entry.name,
      JSON.parse(
        readFileSync(path.join(LOCALES_DIR, entry.name, 'pricing.json'), 'utf8'),
      ) as Record<string, string>,
    ]);
}

describe('pricing locale bundles, the Free plan lines', () => {
  it('carries both Free plan lines in every supported language', () => {
    const bundles = pricingBundles();
    expect(bundles.map(([locale]) => locale).sort()).toEqual(
      SUPPORTED_LANGUAGES.map((language) => language.code).sort(),
    );
    for (const [locale, bundle] of bundles) {
      for (const key of FREE_PLAN_KEYS) {
        expect(bundle[key], `${locale}/pricing.json ${key}`).toEqual(expect.any(String));
      }
    }
  });

  it('never calls the Free allowance small, and states no figure for it', () => {
    for (const [locale, bundle] of pricingBundles()) {
      for (const key of FREE_PLAN_KEYS) {
        const copy = bundle[key] ?? '';
        for (const claim of SMALL_ALLOWANCE_CLAIMS) {
          expect(copy, `${locale}/pricing.json ${key}`).not.toMatch(claim);
        }
        expect(copy, `${locale}/pricing.json ${key}`).not.toMatch(/\p{N}/u);
      }
    }
  });
});
