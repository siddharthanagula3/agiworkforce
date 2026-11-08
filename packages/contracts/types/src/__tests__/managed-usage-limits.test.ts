import { describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  type BillingPlanPricing,
  type BillingPlanTier,
} from '../billing-catalog';
import { BILLING_PLAN_CATALOG_VERSION } from '../billing-plan-catalog';
import { usdFromCredits } from '../credits';
import {
  MANAGED_USAGE_BASELINES,
  MANAGED_USAGE_LIMITS,
  compareManagedUsage,
  managedUsageComparisonLabel,
  managedUsageComparisonLines,
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

  it('keeps five-hour limits on the other paid plans and removes only Ultra’s session cap', () => {
    for (const tier of pricedTiers) {
      const limit = MANAGED_USAGE_LIMITS[tier];
      if (tier === 'max_15x') {
        expect(limit.fiveHourCredits).toBeNull();
        expect(limit.weeklyCredits).toBe(5_000);
        expect(limit.monthlyCredits).toBe(20_000);
      } else {
        expect(limit.fiveHourCredits).toBe(Math.ceil(limit.weeklyCredits * 0.1));
      }
    }
    const free = MANAGED_USAGE_LIMITS.free;
    expect(free.fiveHourCredits).toBe(Math.ceil(free.weeklyCredits * 0.1));
  });

  it('keeps each plan window no larger than the one that contains it', () => {
    for (const limit of Object.values(MANAGED_USAGE_LIMITS)) {
      if (limit.unlimited) continue;
      if (limit.fiveHourCredits !== null)
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

  it('states Ultra’s weekly multiple without inventing a session allowance', () => {
    expect(managedUsageMultiplier('max_15x', 'pro')).toBeNull();
    expect(managedUsageComparisonLabel('max_15x', 'pro', 'Pro')).toBe(
      '10x more weekly usage than Pro',
    );
  });

  it('compares each plan with the plan below it and Team seats with Pro', () => {
    expect(managedUsageComparisonLines('free')).toEqual([]);
    expect(managedUsageComparisonLines('basic')).toEqual(['5x more usage per session than Free']);
    expect(managedUsageComparisonLines('pro')).toEqual(['5x more usage than Basic']);
    expect(managedUsageComparisonLines('max')).toEqual(['5x more usage than Premium']);
    expect(managedUsageComparisonLines('max_15x')).toEqual(['10x more weekly usage than Premium']);
    expect(managedUsageComparisonLines('team')).toEqual(['Same usage as Premium for every seat']);
    expect(managedUsageComparisonLines('enterprise')).toEqual([]);
  });

  it('claims only multiples the usage table yields window by window', () => {
    for (const [tier, baseline] of Object.entries(MANAGED_USAGE_BASELINES) as Array<
      [BillingPlanTier, BillingPlanTier]
    >) {
      const comparison = compareManagedUsage(tier);
      expect(comparison, tier).not.toBeNull();
      const subject = MANAGED_USAGE_LIMITS[tier];
      const against = MANAGED_USAGE_LIMITS[baseline];
      const session =
        subject.fiveHourCredits === null || against.fiveHourCredits === null
          ? null
          : subject.fiveHourCredits / against.fiveHourCredits;
      const weekly = subject.weeklyCredits / against.weeklyCredits;
      const monthly = subject.monthlyCredits / against.monthlyCredits;
      if (comparison!.factor !== null) {
        expect([session, weekly, monthly], tier).toEqual([
          comparison!.factor,
          comparison!.factor,
          comparison!.factor,
        ]);
      }
      if (comparison!.session !== null) expect(session, tier).toBe(comparison!.session);
      if (comparison!.weekly !== null) expect(weekly, tier).toBe(comparison!.weekly);
    }
  });
});
