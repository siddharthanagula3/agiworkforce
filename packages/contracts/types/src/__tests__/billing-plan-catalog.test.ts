import { describe, expect, it } from 'vitest';

import { BILLING_PLAN_PRICING, SELF_SERVE_PAID_PLAN_TIERS } from '../billing-catalog';
import {
  BILLING_PLAN_CATALOG_VERSION,
  SPEND_CAP_UNLIMITED,
  WITHDRAWN_BILLING_PLANS,
  isGrandfatheredSubscriber,
  isPlanOnSale,
  isUnlimitedSpendCap,
  listPlanCatalog,
  normalizeSpendCap,
  planCatalogEntry,
  remainingSpendCents,
  resolveGrandfatheredPlan,
  resolvePurchasablePlan,
  spendCapExceeded,
} from '../billing-plan-catalog';

describe('plan catalog versioning', () => {
  it('covers every plan in the pricing catalog and nothing else', () => {
    expect(
      listPlanCatalog()
        .map((entry) => entry.tier)
        .sort(),
    ).toEqual(Object.keys(BILLING_PLAN_PRICING).sort());
  });

  it('stamps every entry with the catalog version a subscription can record', () => {
    expect(listPlanCatalog().every((e) => e.catalogVersion === BILLING_PLAN_CATALOG_VERSION)).toBe(
      true,
    );
  });

  it('classifies sellability from the catalog rather than restating it', () => {
    for (const tier of SELF_SERVE_PAID_PLAN_TIERS) {
      expect(planCatalogEntry(tier).sellability).toBe('self_serve');
    }
    expect(planCatalogEntry('enterprise').sellability).toBe('contract_only');
    expect(planCatalogEntry('free').sellability).toBe('free_of_charge');
  });

  it('sells the self-serve and free plans and not the contract-priced one', () => {
    expect(isPlanOnSale('pro')).toBe(true);
    expect(isPlanOnSale('free')).toBe(true);
    expect(isPlanOnSale('enterprise')).toBe(false);
  });

  it('records no withdrawal today, so nothing is grandfathered yet', () => {
    expect(Object.keys(WITHDRAWN_BILLING_PLANS)).toEqual([]);
    expect(listPlanCatalog().some((entry) => entry.sellability === 'withdrawn')).toBe(false);
    expect(isGrandfatheredSubscriber('pro')).toBe(false);
  });

  it('sends a new buyer to the plan itself while it is on sale', () => {
    expect(resolvePurchasablePlan('pro')).toBe('pro');
    expect(resolvePurchasablePlan('enterprise')).toBeNull();
  });

  it('keeps an existing subscriber on the plan they bought', () => {
    expect(resolveGrandfatheredPlan('max_15x')).toBe('max_15x');
    expect(resolveGrandfatheredPlan('legacy-nonsense')).toBe('free');
  });
});

describe('spend cap', () => {
  it('tells an explicit unlimited cap apart from a number', () => {
    expect(isUnlimitedSpendCap(SPEND_CAP_UNLIMITED)).toBe(true);
    expect(isUnlimitedSpendCap(0)).toBe(false);
  });

  it('never reports an unlimited cap as exceeded and reports no remaining figure', () => {
    expect(spendCapExceeded(SPEND_CAP_UNLIMITED, 1_000_000)).toBe(false);
    expect(remainingSpendCents(SPEND_CAP_UNLIMITED, 1_000_000)).toBeNull();
  });

  it('treats a numeric cap as reached at the cap, not past it', () => {
    expect(spendCapExceeded(5_000, 4_999)).toBe(false);
    expect(spendCapExceeded(5_000, 5_000)).toBe(true);
    expect(remainingSpendCents(5_000, 4_000)).toBe(1_000);
    expect(remainingSpendCents(5_000, 9_000)).toBe(0);
  });

  it('refuses a cap that is not an integer count of cents or the unlimited value', () => {
    expect(normalizeSpendCap(SPEND_CAP_UNLIMITED)).toBe(SPEND_CAP_UNLIMITED);
    expect(normalizeSpendCap(1_000)).toBe(1_000);
    expect(normalizeSpendCap(0)).toBe(0);
    expect(normalizeSpendCap(-1)).toBeNull();
    expect(normalizeSpendCap(10.5)).toBeNull();
    expect(normalizeSpendCap('off')).toBeNull();
    expect(normalizeSpendCap(null)).toBeNull();
  });
});
