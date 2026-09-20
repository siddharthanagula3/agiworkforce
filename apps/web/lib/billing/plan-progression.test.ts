import { describe, expect, it } from 'vitest';

import {
  BILLING_PLAN_CAPABILITY_TIERS,
  BILLING_PLAN_PRICING,
  BILLING_PLAN_PRODUCT_LIMITS,
  ENTITLED_SUBSCRIPTION_STATUSES,
  FEATURE_RATE_CARD,
  RATE_CARD_FEATURES,
  creditLedgerRemainingMicroUsd,
  effectivePlanTier,
  getPlanPriceCents,
  toEntitlement,
  type BillingPlanCapability,
  type BillingPlanLimit,
  type BillingPlanProductLimits,
  type BillingPlanTier,
} from '@agiworkforce/types';

import { MANAGED_USAGE_LIMITS } from './managed-usage-caps';
import { PLAN_CREDIT_ALLOWANCES } from './plan-credits';
import { getPlanUsageBudgetCents } from '../server/managed-usage-policy';

/**
 * What a customer is promised by moving up one step. Nothing here restates a
 * number: each claim is read out of the catalog for every adjacent pair on the
 * ladder, so a plan whose entry was edited into taking something away fails
 * here rather than in a support ticket.
 */
const UPGRADE_LADDER = [
  'free',
  'basic',
  'pro',
  'max',
  'max_15x',
] as const satisfies readonly BillingPlanTier[];

const ADJACENT_PAIRS: ReadonlyArray<readonly [BillingPlanTier, BillingPlanTier]> =
  UPGRADE_LADDER.flatMap((tier, index) => {
    const next = UPGRADE_LADDER[index + 1];
    return next === undefined ? [] : [[tier, next] as [BillingPlanTier, BillingPlanTier]];
  });

const LIMIT_KEYS = Object.keys(
  BILLING_PLAN_PRODUCT_LIMITS.free,
) as (keyof BillingPlanProductLimits)[];

const CAPABILITIES = Object.keys(BILLING_PLAN_CAPABILITY_TIERS) as BillingPlanCapability[];

/** A ceiling as a number the two tiers can be compared by. */
function comparableLimit(limit: BillingPlanLimit | number): number {
  if (limit === 'unlimited' || limit === 'custom') return Number.POSITIVE_INFINITY;
  return limit;
}

describe('moving up the ladder never takes something away', () => {
  it.each(ADJACENT_PAIRS)('%s to %s keeps every capability', (lower, higher) => {
    for (const capability of CAPABILITIES) {
      const granted = BILLING_PLAN_CAPABILITY_TIERS[capability];
      if (!granted.includes(lower)) continue;
      expect(granted, `${higher} loses ${capability}`).toContain(higher);
    }
  });

  it.each(ADJACENT_PAIRS)('%s to %s raises or holds every product limit', (lower, higher) => {
    for (const key of LIMIT_KEYS) {
      const before = comparableLimit(BILLING_PLAN_PRODUCT_LIMITS[lower][key]);
      const after = comparableLimit(BILLING_PLAN_PRODUCT_LIMITS[higher][key]);
      expect(after, `${higher} lowers ${key}`).toBeGreaterThanOrEqual(before);
    }
  });

  it.each(ADJACENT_PAIRS)('%s to %s raises or holds every usage window', (lower, higher) => {
    for (const window of ['monthlyUnits', 'weeklyUnits', 'fiveHourUnits'] as const) {
      const before = MANAGED_USAGE_LIMITS[lower].unlimited
        ? Number.POSITIVE_INFINITY
        : MANAGED_USAGE_LIMITS[lower][window];
      const after = MANAGED_USAGE_LIMITS[higher].unlimited
        ? Number.POSITIVE_INFINITY
        : MANAGED_USAGE_LIMITS[higher][window];
      expect(after, `${higher} shrinks ${window}`).toBeGreaterThanOrEqual(before);
    }
  });

  it.each(ADJACENT_PAIRS)('%s to %s costs more than the step below', (lower, higher) => {
    expect(getPlanPriceCents(higher)).toBeGreaterThan(getPlanPriceCents(lower) ?? 0);
  });

  it('states every allowance the ladder promises in credits, not as a share', () => {
    for (const tier of UPGRADE_LADDER) {
      const allowance = PLAN_CREDIT_ALLOWANCES[tier];
      expect(Number.isFinite(allowance.monthly)).toBe(true);
      expect(allowance.monthly).toBeGreaterThanOrEqual(allowance.weekly);
      expect(allowance.weekly).toBeGreaterThanOrEqual(allowance.fiveHour);
    }
  });
});

describe('what a plan grants is a fact about the plan', () => {
  it('derives an entitlement from the tier alone, with no status in the answer', () => {
    for (const tier of Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]) {
      const entitlement = toEntitlement(tier);
      expect(entitlement.productId).toBe(tier);
      expect(entitlement.capabilities).toEqual(
        CAPABILITIES.filter((capability) =>
          BILLING_PLAN_CAPABILITY_TIERS[capability].includes(tier),
        ).sort(),
      );
      expect(entitlement.limits).toBe(BILLING_PLAN_PRODUCT_LIMITS[tier]);
    }
  });

  it('lets a subscription status demote a tier and nothing else', () => {
    const statuses = [
      ...ENTITLED_SUBSCRIPTION_STATUSES,
      'past_due',
      'unpaid',
      'canceled',
      'incomplete',
      'paused',
      '',
    ];
    for (const tier of Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]) {
      for (const status of statuses) {
        const resolved = effectivePlanTier(tier, status);
        expect(
          resolved === tier || resolved === 'free',
          `${status} turned ${tier} into ${resolved}`,
        ).toBe(true);
        if ((ENTITLED_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) {
          expect(resolved).toBe(tier);
        }
      }
    }
  });

  it('never lets an unentitled status reach past free', () => {
    for (const tier of Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]) {
      expect(effectivePlanTier(tier, 'canceled')).toBe('free');
    }
  });
});

describe('what the plan includes is not what the customer bought', () => {
  it('counts an allowance and a purchase as two balances, and spends both', () => {
    const balance = {
      subjectId: 'subject',
      allocatedMicroUsd: 2_000_000,
      usedMicroUsd: 2_000_000,
      topUpAllocatedMicroUsd: 500_000,
      flagshipUsedTodayMicroUsd: 0,
    };
    expect(creditLedgerRemainingMicroUsd(balance)).toBe(500_000);
    expect(creditLedgerRemainingMicroUsd({ ...balance, topUpAllocatedMicroUsd: 0 })).toBe(0);
    expect(creditLedgerRemainingMicroUsd({ ...balance, usedMicroUsd: 3_000_000 })).toBe(0);
  });

  it('gives the free plan no paid ledger to spend from', () => {
    expect(getPlanUsageBudgetCents('free')).toBe(0);
    expect(MANAGED_USAGE_LIMITS.free.unlimited).toBe(false);
    for (const window of ['monthlyUnits', 'weeklyUnits', 'fiveHourUnits'] as const) {
      expect(MANAGED_USAGE_LIMITS.free[window]).toBeGreaterThan(0);
    }
  });

  it('gives a local or bring-your-own-key plan no managed allowance at all', () => {
    for (const tier of ['local-only', 'byok'] as const) {
      expect(getPlanUsageBudgetCents(tier)).toBe(0);
      expect(MANAGED_USAGE_LIMITS[tier].unlimited).toBe(false);
      expect(MANAGED_USAGE_LIMITS[tier].monthlyUnits).toBe(0);
    }
  });
});

describe('every metered feature carries a decided price', () => {
  it('prices or explicitly defers every feature the platform meters', () => {
    for (const feature of RATE_CARD_FEATURES) {
      const entry = FEATURE_RATE_CARD[feature];
      expect(entry.source.length, `${feature} names no source`).toBeGreaterThan(0);
      if (entry.customerBasis === 'rate_card') {
        expect(
          entry.customerMicrousd,
          `${feature} is on the rate card with no price`,
        ).toBeGreaterThan(0);
      } else {
        expect(entry.customerMicrousd, `${feature} prices without a rate-card basis`).toBeNull();
      }
    }
  });

  it('never passes an upstream figure through as the customer price', () => {
    for (const feature of RATE_CARD_FEATURES) {
      const entry = FEATURE_RATE_CARD[feature];
      if (entry.customerMicrousd === null || entry.providerCogsMicrousd === null) continue;
      expect(
        entry.customerMicrousd,
        `${feature} charges the customer exactly what the provider charges`,
      ).not.toBe(entry.providerCogsMicrousd);
    }
  });
});
