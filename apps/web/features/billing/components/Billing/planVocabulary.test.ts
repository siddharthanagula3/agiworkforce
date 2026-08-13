import { describe, expect, it } from 'vitest';
import { BILLING_PLAN_PRICING, type BillingPlanTier } from '@agiworkforce/types';
import { VALID_PLANS, normalizePlan, type PlanTier } from './types';
import type { BillingPlan } from '@features/billing/hooks/use-billing-queries';

const BILLABLE_CATALOG_TIERS = (Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]).filter(
  (tier) => tier !== 'local-only' && tier !== 'byok',
);

describe('billing plan vocabulary', () => {
  it('lists exactly the billable tiers the catalog sells', () => {
    expect([...VALID_PLANS]).toEqual(BILLABLE_CATALOG_TIERS);
  });

  it('preserves every billable tier instead of normalizing it down to free', () => {
    for (const tier of BILLABLE_CATALOG_TIERS) expect(normalizePlan(tier)).toBe(tier);
  });

  it('does not render local trust boundaries as billable plans', () => {
    expect(normalizePlan('local-only')).toBe('free');
    expect(normalizePlan('byok')).toBe('free');
  });

  it('keeps the query hook on the same union', () => {
    const fromHook: BillingPlan = 'max_15x' satisfies PlanTier;
    const fromScreen: PlanTier = fromHook;
    expect(fromScreen).toBe('max_15x');
  });
});
