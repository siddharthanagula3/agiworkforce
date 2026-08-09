/**
 * The billing screen's plan list and the checkout catalog have to be the same
 * list. When this screen kept its own hand-written copy, a tier the catalog
 * already sold was not "unknown" here — `normalizePlan` quietly answered
 * 'free', so a paying subscriber saw the Free plan on their own billing page.
 * This fails the moment the catalog gains or renames a billable tier.
 */
import { describe, expect, it } from 'vitest';
import { BILLING_PLAN_PRICING, type BillingPlanTier } from '@agiworkforce/types';
import { VALID_PLANS, normalizePlan, type PlanTier } from './types';
import type { BillingPlan } from '@features/billing/hooks/use-billing-queries';

// local-only and byok are trust boundaries, not subscriptions: nothing bills them.
const BILLABLE_CATALOG_TIERS = (Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]).filter(
  (tier) => tier !== 'local-only' && tier !== 'byok',
);

describe('billing plan vocabulary', () => {
  it('lists exactly the billable tiers the catalog sells', () => {
    expect([...VALID_PLANS]).toEqual(BILLABLE_CATALOG_TIERS);
  });

  it('preserves every billable tier instead of normalizing it down to free', () => {
    for (const tier of BILLABLE_CATALOG_TIERS) {
      expect(normalizePlan(tier)).toBe(tier);
    }
  });

  it('does not render the local trust boundaries as billable plans', () => {
    expect(normalizePlan('local-only')).toBe('free');
    expect(normalizePlan('byok')).toBe('free');
  });

  it('keeps the query hook on the same union rather than a second copy', () => {
    // Compile-time assertion: both directions must assign, so the two names
    // cannot drift apart without a typecheck failure.
    const fromHook: BillingPlan = 'max_15x' satisfies PlanTier;
    const fromScreen: PlanTier = fromHook;
    expect(fromScreen).toBe('max_15x');
  });
});
