import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BILLING_PLAN_PRICING,
  getPlanPriceInr,
  getPublishedPlanPriceUsd,
  listPlansForProduct,
  type BillingPlanTier,
} from '@agiworkforce/types';

/**
 * The published price has to be the catalog price. Nothing enforced that: the
 * page could render a number typed into JSX or a locale bundle and no test
 * would notice, so a reprice would ship to customers on one surface and not the
 * other.
 */

const PRICING_PAGE = path.resolve(__dirname, '../../app/pricing/page.tsx');
const LOCALES_DIR = path.resolve(__dirname, '../../../../packages/ui/i18n/locales');

const CURRENCY_LITERAL = /(?:[$₹€£]\s?\d)|(?:\d+(?:[.,]\d+)?\s*(?:USD|EUR|GBP|INR)\b)/u;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

function pricingBundles(): Array<[string, Record<string, unknown>]> {
  return readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const file = path.join(LOCALES_DIR, entry.name, 'pricing.json');
      return [entry.name, JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>] as [
        string,
        Record<string, unknown>,
      ];
    });
}

describe('the published pricing page cannot state a price the catalog does not', () => {
  it('reads the page it is guarding, so a moved file fails loudly', () => {
    expect(readFileSync(PRICING_PAGE, 'utf8').length).toBeGreaterThan(0);
  });

  it('writes no currency amount into the page itself', () => {
    const lines = withoutComments(readFileSync(PRICING_PAGE, 'utf8')).split('\n');
    const offenders = lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter((entry) => CURRENCY_LITERAL.test(entry.line));

    expect(
      offenders.map((entry) => `page.tsx:${entry.number} ${entry.line.trim()}`),
      'a price belongs in BILLING_PLAN_PRICING, not in the page',
    ).toEqual([]);
  });

  it('takes every rendered plan price from the catalog', () => {
    const source = readFileSync(PRICING_PAGE, 'utf8');
    expect(source).toMatch(/BILLING_PLAN_PRICING/);
    for (const field of ['monthlyPriceUsd', 'yearlyPriceUsd'] as const) {
      expect(source).toMatch(new RegExp(`\\.${field}\\b`));
    }
  });

  it('writes no currency amount into any pricing locale bundle', () => {
    for (const [locale, bundle] of pricingBundles()) {
      for (const [key, value] of Object.entries(bundle)) {
        if (typeof value !== 'string') continue;
        expect(
          CURRENCY_LITERAL.test(value),
          `${locale}/pricing.json ${key} states a price: ${value}`,
        ).toBe(false);
      }
    }
  });

  it('agrees with the canonical Plan objects on every published price', () => {
    for (const tier of Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]) {
      if (tier === 'enterprise') continue;
      for (const plan of listPlansForProduct(tier)) {
        const expected =
          plan.currency === 'inr'
            ? Math.round((getPlanPriceInr(tier) ?? 0) * 100)
            : Math.round(getPublishedPlanPriceUsd(tier, plan.interval) * 100);
        expect(plan.priceMinorUnits, `${tier} ${plan.interval} ${plan.currency}`).toBe(expected);
      }
    }
  });
});
