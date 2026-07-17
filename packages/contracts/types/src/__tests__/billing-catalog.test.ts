import { describe, expect, it } from 'vitest';
import {
  getPlanPriceCents,
  getPlanPriceInr,
  getPlanUsageBudgetCents,
  getPlanDailyUsageBudgetCents,
  getPlanWeeklyUsageBudgetCents,
  getPlanSessionUsageBudgetCents,
  getPlanFlagshipWeeklyUsageBudgetCents,
  getUsageBudgetCentsFromPriceCents,
  isPlanSelectableOnSurface,
  PLAN_SURFACE_VISIBILITY,
  INCLUDED_USAGE_BUDGET_RATIO,
  SESSION_OF_WEEKLY_BUDGET_RATIO,
  FLAGSHIP_OF_WEEKLY_BUDGET_RATIO,
  type BillingPlanTier,
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

    expect(getPlanPriceCents('pro', 'yearly')).toBe(20000);
    expect(getPlanUsageBudgetCents('pro', 'yearly')).toBe(1000); // same $10/mo, not ratio-of-yearly-price

    expect(getPlanPriceCents('max')).toBe(10000);
    expect(getPlanUsageBudgetCents('max')).toBe(7500); // $75/mo, explicit

    expect(getPlanPriceCents('basic')).toBe(800);
    expect(getPlanUsageBudgetCents('basic')).toBe(200); // $2/mo, explicit
  });

  it('falls back to the ratio for tiers with no explicit budget set (team/enterprise)', () => {
    expect(INCLUDED_USAGE_BUDGET_RATIO).toBe(0.35);
    expect(getPlanUsageBudgetCents('team')).toBe(Math.round(3000 * 0.35));
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

  // 2026-07-05: session (rolling 5hr) + weekly limits layer on top of the
  // monthly credit budget rather than replacing it — see billing-catalog.ts
  // header comments on getPlanWeeklyUsageBudgetCents.
  describe('weekly/session pacing budgets (layer on top of monthly)', () => {
    it('derives the weekly budget as an even monthly/12-per-52-weeks slice', () => {
      expect(getPlanWeeklyUsageBudgetCents('pro')).toBe(Math.round((1000 * 12) / 52)); // $10/mo -> 231
      expect(getPlanWeeklyUsageBudgetCents('max')).toBe(Math.round((7500 * 12) / 52)); // $75/mo -> 1731
      expect(getPlanWeeklyUsageBudgetCents('basic')).toBe(Math.round((200 * 12) / 52)); // $2/mo -> 46
    });

    it('derives the session budget as 20% of the weekly budget', () => {
      expect(SESSION_OF_WEEKLY_BUDGET_RATIO).toBe(0.2);
      const weeklyPro = getPlanWeeklyUsageBudgetCents('pro');
      expect(getPlanSessionUsageBudgetCents('pro')).toBe(Math.round(weeklyPro * 0.2));
    });

    it('derives the flagship-only weekly budget as 30% of the weekly budget', () => {
      expect(FLAGSHIP_OF_WEEKLY_BUDGET_RATIO).toBe(0.3);
      const weeklyMax = getPlanWeeklyUsageBudgetCents('max');
      expect(getPlanFlagshipWeeklyUsageBudgetCents('max')).toBe(Math.round(weeklyMax * 0.3));
    });

    it('is zero for free (no monthly budget to pace from)', () => {
      expect(getPlanWeeklyUsageBudgetCents('free')).toBe(0);
      expect(getPlanSessionUsageBudgetCents('free')).toBe(0);
      expect(getPlanFlagshipWeeklyUsageBudgetCents('free')).toBe(0);
    });
  });

  // 2026-07: Basic is a mobile-only tier in plan-SELECTION UIs (founder
  // decision). This is a DISPLAY rule — it does not change pricing/budget math
  // above; those still resolve Basic normally for an existing subscriber.
  describe('plan surface visibility (Basic is mobile-only)', () => {
    it('hides Basic from web and desktop plan selection, shows it on mobile', () => {
      expect(isPlanSelectableOnSurface('basic', 'web')).toBe(false);
      expect(isPlanSelectableOnSurface('basic', 'desktop')).toBe(false);
      expect(isPlanSelectableOnSurface('basic', 'mobile')).toBe(true);
    });

    it('shows every other tier on every surface', () => {
      const others: BillingPlanTier[] = [
        'local-only',
        'byok',
        'free',
        'pro',
        'max',
        'team',
        'enterprise',
      ];
      for (const tier of others) {
        expect(isPlanSelectableOnSurface(tier, 'web')).toBe(true);
        expect(isPlanSelectableOnSurface(tier, 'desktop')).toBe(true);
        expect(isPlanSelectableOnSurface(tier, 'mobile')).toBe(true);
      }
    });

    it('normalizes unknown/empty tiers to free (visible everywhere)', () => {
      expect(isPlanSelectableOnSurface('nonsense', 'web')).toBe(true);
      expect(isPlanSelectableOnSurface(null, 'web')).toBe(true);
      expect(isPlanSelectableOnSurface(undefined, 'desktop')).toBe(true);
    });

    it('keeps Basic in the pricing catalog even though it is hidden from web', () => {
      // Guard against "hide" being mistaken for "remove": the tier must still
      // resolve for math + an existing subscriber's current-plan display.
      expect(PLAN_SURFACE_VISIBILITY.basic).toEqual(['mobile']);
      expect(getPlanUsageBudgetCents('basic')).toBe(200);
      expect(getPlanPriceCents('basic')).toBe(800);
    });
  });
});
