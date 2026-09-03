import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  BILLING_PLAN_PRICING,
  BILLING_PLAN_PRODUCT_LIMITS,
  normalizeUIPlanTier,
} from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

/**
 * Claim guard for the published pricing bundles (ledger BILL-49, F-7).
 *
 * `proFeature2` shipped as "Priority routing across providers" while no router
 * reads the billing tier: `apps/web/app/sla/page.tsx` states outright that
 * "There is no plan-derived priority routing implemented". A paid-tier feature
 * bullet is a product-capability claim, so it has to name something the catalog
 * actually grants. The bullet now states Pro's concurrency and connector-tool
 * ceilings, and this suite pins it to `BILLING_PLAN_PRODUCT_LIMITS` so a limit
 * change cannot quietly leave the marketing copy behind.
 */

const LOCALES_DIR = path.resolve(__dirname, '../../../../../packages/ui/i18n/locales');

function pricingBundles(): Array<[string, Record<string, string>]> {
  return readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(
      (entry) =>
        [
          entry.name,
          JSON.parse(
            readFileSync(path.join(LOCALES_DIR, entry.name, 'pricing.json'), 'utf8'),
          ) as Record<string, string>,
        ] as [string, Record<string, string>],
    );
}

const ROUTING_PRIORITY_CLAIMS = [
  /priority\s+routing/iu,
  /routing\s+priority/iu,
  /enrutamiento\s+prioritario/iu,
  /prioritäre[sr]?\s+routing/iu,
  /routage\s+prioritaire/iu,
];

describe('pricing locale bundles, plan feature claims', () => {
  it('ships at least the English bundle, so an empty glob cannot pass this suite', () => {
    const bundles = pricingBundles();
    expect(bundles.length).toBeGreaterThan(0);
    expect(bundles.map(([locale]) => locale)).toContain('en');
  });

  it('never promises tier-derived priority routing, which no router implements', () => {
    for (const [locale, bundle] of pricingBundles()) {
      for (const [key, value] of Object.entries(bundle)) {
        if (typeof value !== 'string') continue;
        for (const claim of ROUTING_PRIORITY_CLAIMS) {
          expect(
            claim.test(value),
            `${locale}/pricing.json ${key} claims priority routing: ${value}`,
          ).toBe(false);
        }
      }
    }
  });

  it('names no plan tier the billing catalog stopped selling', () => {
    const catalogKeys = new Set(
      Object.keys(BILLING_PLAN_PRICING).flatMap((id) => [
        id,
        id.replace(/[-_](\w)/gu, (_match, char: string) => char.toUpperCase()),
      ]),
    );
    const unrelated = 'byok';

    for (const [locale, bundle] of pricingBundles()) {
      for (const key of Object.keys(bundle)) {
        if (catalogKeys.has(key)) continue;
        const resolved = normalizeUIPlanTier(key, unrelated);
        expect(
          resolved === unrelated || resolved === key,
          `${locale}/pricing.json ships retired tier key "${key}" (now sold as "${resolved}")`,
        ).toBe(true);
      }
    }
  });

  it('states Pro concurrency and connector ceilings the billing catalog grants', () => {
    const { maxConcurrentTurns, maxConnectorTools } = BILLING_PLAN_PRODUCT_LIMITS.pro;
    expect(typeof maxConcurrentTurns).toBe('number');
    expect(typeof maxConnectorTools).toBe('number');

    const bundles = pricingBundles().filter(([, bundle]) => 'proFeature2' in bundle);
    expect(bundles.length).toBeGreaterThan(0);

    for (const [locale, bundle] of bundles) {
      const copy = bundle['proFeature2'];
      expect(copy, `${locale}/pricing.json proFeature2 omits ${maxConcurrentTurns}`).toMatch(
        new RegExp(`\\b${maxConcurrentTurns}\\b`, 'u'),
      );
      expect(copy, `${locale}/pricing.json proFeature2 omits ${maxConnectorTools}`).toMatch(
        new RegExp(`\\b${maxConnectorTools}\\b`, 'u'),
      );
    }
  });
});
