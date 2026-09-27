import { describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  type BillingPlanPricing,
  type BillingPlanTier,
} from '../billing-catalog';
import { BILLING_PLAN_CATALOG_VERSION } from '../billing-plan-catalog';
import { usdFromCredits } from '../credits';
import {
  MANAGED_USAGE_LIMITS,
  managedUsageComparisonLabel,
  managedUsageLimitsForCatalogVersion,
  managedUsageMultiplier,
} from '../managed-usage-limits';

const PLAN_COST_CEILING_OF_PRICE = 0.5;

const pricedTiers = (Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]).filter((tier) => {
  const pricing: BillingPlanPricing = BILLING_PLAN_PRICING[tier];
  return (pricing.monthlyPriceUsd ?? 0) > 0;
});

describe('plan economics', () => {
  it('prices every paid plan so its full monthly allowance costs at most half its price', () => {
    expect(pricedTiers.length).toBeGreaterThan(0);
    for (const tier of pricedTiers) {
      const pricing: BillingPlanPricing = BILLING_PLAN_PRICING[tier];
      const worstCaseUsd = usdFromCredits(MANAGED_USAGE_LIMITS[tier].monthlyCredits);
      expect(worstCaseUsd).toBeLessThanOrEqual(
        (pricing.monthlyPriceUsd ?? 0) * PLAN_COST_CEILING_OF_PRICE,
      );
    }
  });

  it('prices every yearly plan so a month of it covers twice the monthly allowance', () => {
    for (const tier of pricedTiers) {
      const pricing: BillingPlanPricing = BILLING_PLAN_PRICING[tier];
      if (pricing.yearlyPriceUsd === undefined) continue;
      const worstCaseUsd = usdFromCredits(MANAGED_USAGE_LIMITS[tier].monthlyCredits);
      expect(worstCaseUsd).toBeLessThanOrEqual(
        (pricing.yearlyPriceUsd / 12) * PLAN_COST_CEILING_OF_PRICE,
      );
    }
  });

  it('keeps the allowances a subscription was sold under in catalog 1', () => {
    expect(BILLING_PLAN_CATALOG_VERSION).toBeGreaterThan(1);
    expect(managedUsageLimitsForCatalogVersion(1)).toEqual(MANAGED_USAGE_LIMITS);
  });

  it('sets the 5-hour window to 10% of the week, and 20% on Max 20x', () => {
    for (const tier of pricedTiers) {
      const limit = MANAGED_USAGE_LIMITS[tier];
      const share = tier === 'max_15x' ? 0.2 : 0.1;
      expect(limit.fiveHourCredits).toBe(Math.ceil(limit.weeklyCredits * share));
    }
    const free = MANAGED_USAGE_LIMITS.free;
    expect(free.fiveHourCredits).toBe(Math.ceil(free.weeklyCredits * 0.1));
  });

  it('keeps each plan window no larger than the one that contains it', () => {
    for (const limit of Object.values(MANAGED_USAGE_LIMITS)) {
      if (limit.unlimited) continue;
      expect(limit.fiveHourCredits).toBeLessThanOrEqual(limit.weeklyCredits);
      expect(limit.weeklyCredits).toBeLessThanOrEqual(limit.monthlyCredits);
    }
  });
});

describe('plan comparison copy', () => {
  it('states Max 5x as five times Pro in every window', () => {
    expect(managedUsageMultiplier('max', 'pro')).toBe(5);
    expect(managedUsageComparisonLabel('max', 'pro', 'Pro')).toBe('5x more usage than Pro');
  });

  it('states Max 20x per window when the windows differ', () => {
    expect(managedUsageMultiplier('max_15x', 'pro')).toBeNull();
    expect(managedUsageComparisonLabel('max_15x', 'pro', 'Pro')).toBe(
      '20x Pro per 5 hours, 10x per week',
    );
  });
});
