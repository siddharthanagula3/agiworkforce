import { describe, expect, it } from 'vitest';
import {
  getPlanPriceCents,
  getPlanPriceInr,
  getPlanUsageBudgetCents,
  getPlanDailyUsageBudgetCents,
  getUsageBudgetCentsFromPriceCents,
  INCLUDED_USAGE_BUDGET_RATIO,
} from '../billing-catalog';

describe('billing catalog', () => {
  // 2026-07-02: free/basic/pro/max moved from a ratio-of-price budget to
  // explicit founder-set flat dollar amounts (monthlyUsageBudgetUsd) — see
  // BILLING_PLAN_PRICING in billing-catalog.ts. Explicit amounts always win
  // over INCLUDED_USAGE_BUDGET_RATIO for the tiers that define one, and are
  // NOT interval-scaled (a yearly-billed Pro subscriber still gets the same
  // $10/mo budget every month, not a lump 12x sum) — team/enterprise still
  // fall back to the ratio since they don't have a fixed budget set yet.
  it('uses the explicit monthly dollar budget for tiers that define one, regardless of interval', () => {
    expect(getPlanPriceCents('pro')).toBe(2000);
    expect(getPlanUsageBudgetCents('pro')).toBe(1000); // $10/mo, explicit

    expect(getPlanPriceCents('pro', 'yearly')).toBe(20400);
    expect(getPlanUsageBudgetCents('pro', 'yearly')).toBe(1000); // same $10/mo, not ratio-of-yearly-price

    expect(getPlanPriceCents('max')).toBe(10000);
    expect(getPlanUsageBudgetCents('max')).toBe(7500); // $75/mo, explicit

    expect(getPlanPriceCents('basic')).toBe(800);
    expect(getPlanUsageBudgetCents('basic')).toBe(200); // $2/mo, explicit
  });

  it('falls back to the ratio for tiers with no explicit budget set (team/enterprise)', () => {
    expect(INCLUDED_USAGE_BUDGET_RATIO).toBe(0.35);
    expect(getPlanUsageBudgetCents('team')).toBe(Math.round(2500 * 0.35));
  });

  it('returns zero for free and invalid plans', () => {
    expect(getPlanUsageBudgetCents('free')).toBe(0);
    expect(getPlanUsageBudgetCents('unknown-plan')).toBe(0);
  });

  it('rounds arbitrary price cents with the same ratio', () => {
    expect(getUsageBudgetCentsFromPriceCents(2999)).toBe(1050);
    expect(getUsageBudgetCentsFromPriceCents(5988)).toBe(2096);
  });

  it('exposes the free-tier daily budget ($0.005/day, not a fixed prompt count)', () => {
    expect(getPlanDailyUsageBudgetCents('free')).toBe(1); // round($0.005 * 100) = 1 cent
    expect(getPlanDailyUsageBudgetCents('pro')).toBe(0); // pro resets monthly, not daily
  });

  it('exposes India-specific pricing for basic, and null for USD-only tiers', () => {
    expect(getPlanPriceInr('basic')).toBe(399);
    expect(getPlanPriceInr('pro')).toBeNull();
  });
});
