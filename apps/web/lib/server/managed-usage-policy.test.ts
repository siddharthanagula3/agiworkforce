import { describe, expect, it, vi } from 'vitest';
import { CREDITS_PER_CENT, MICROUSD_PER_CREDIT } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import {
  MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS,
  getPlanDailyUsageCredits,
  getPlanFiveHourUsageBudgetMicrousd,
  getPlanFiveHourUsageCredits,
  getPlanFlagshipWeeklyUsageBudgetCents,
  getPlanFlagshipWeeklyUsageCapCents,
  getPlanMonthlyUsageBudgetMicrousd,
  getPlanMonthlyUsageCredits,
  getPlanSessionUsageBudgetCents,
  getPlanSessionUsageCapCents,
  getPlanUsageBudgetCents,
  getPlanWeeklyUsageBudgetMicrousd,
  getPlanWeeklyUsageBudgetCents,
  getPlanWeeklyUsageCapCents,
  getPlanWeeklyUsageCredits,
  isPlanUsageUncapped,
  toPublicUsagePercentage,
} from './managed-usage-policy';

const PLAN_TABLE = {
  free: { fiveHour: 2, weekly: 15, monthly: 20 },
  basic: { fiveHour: 10, weekly: 100, monthly: 400 },
  pro: { fiveHour: 50, weekly: 500, monthly: 2_000 },
  max: { fiveHour: 250, weekly: 2_500, monthly: 10_000 },
  max_15x: { fiveHour: 1_000, weekly: 5_000, monthly: 20_000 },
  team: { fiveHour: 50, weekly: 500, monthly: 2_000 },
} as const;

describe('managed usage policy', () => {
  it('holds every plan to the credits per 5 hours, week and month the billing table sets', () => {
    for (const [tier, credits] of Object.entries(PLAN_TABLE)) {
      expect(getPlanFiveHourUsageCredits(tier), tier).toBe(credits.fiveHour);
      expect(getPlanWeeklyUsageCredits(tier), tier).toBe(credits.weekly);
      expect(getPlanMonthlyUsageCredits(tier), tier).toBe(credits.monthly);
    }
  });

  it('meters Free on its own windows in microUSD, with no daily cap', () => {
    expect(getPlanMonthlyUsageBudgetMicrousd('free')).toBe(20 * MICROUSD_PER_CREDIT);
    expect(getPlanWeeklyUsageBudgetMicrousd('free')).toBe(15 * MICROUSD_PER_CREDIT);
    expect(getPlanFiveHourUsageBudgetMicrousd('free')).toBe(2 * MICROUSD_PER_CREDIT);
    expect(getPlanDailyUsageCredits('free')).toBe(0);
    expect(getPlanDailyUsageCredits('pro')).toBe(0);
  });

  it('converts paid allowances to the cents ledger at two credits a cent', () => {
    for (const tier of ['basic', 'pro', 'max', 'max_15x', 'team'] as const) {
      expect(getPlanUsageBudgetCents(tier), tier).toBe(PLAN_TABLE[tier].monthly / CREDITS_PER_CENT);
    }
    expect(getPlanUsageBudgetCents('enterprise')).toBe(
      MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS,
    );
    expect(getPlanUsageBudgetCents('free')).toBe(0);
  });

  it('separates a declared-uncapped tier from a zero ceiling', () => {
    expect(isPlanUsageUncapped('enterprise')).toBe(true);
    expect(getPlanSessionUsageCapCents('enterprise')).toBeNull();
    expect(getPlanWeeklyUsageCapCents('enterprise')).toBeNull();
    expect(getPlanFlagshipWeeklyUsageCapCents('enterprise')).toBeNull();

    for (const tier of ['byok', 'local-only', 'free', 'unknown-tier', null]) {
      expect(isPlanUsageUncapped(tier)).toBe(false);
      expect(getPlanSessionUsageCapCents(tier)).toBe(0);
      expect(getPlanWeeklyUsageCapCents(tier)).toBe(0);
      expect(getPlanFlagshipWeeklyUsageCapCents(tier)).toBe(0);
    }

    expect(getPlanSessionUsageCapCents('pro')).toBe(25);
    expect(getPlanWeeklyUsageCapCents('pro')).toBe(250);
    expect(getPlanFlagshipWeeklyUsageCapCents('pro')).toBe(75);
  });

  it('keeps the rolling five-hour and flagship sub-limits tied to the weekly window', () => {
    expect(getPlanWeeklyUsageBudgetCents('pro')).toBe(250);
    expect(getPlanSessionUsageBudgetCents('pro')).toBe(25);
    expect(getPlanFlagshipWeeklyUsageBudgetCents('pro')).toBe(75);
  });

  it('fails unknown plan names closed', () => {
    expect(getPlanMonthlyUsageCredits('unknown')).toBe(0);
    expect(getPlanWeeklyUsageCredits(undefined)).toBe(0);
    expect(getPlanUsageBudgetCents(null)).toBe(0);
    expect(getPlanUsageBudgetCents('unknown')).toBe(0);
  });

  it('converts private ledger operands into a bounded public percentage', () => {
    expect(toPublicUsagePercentage(400, 1_200)).toBe(33.33);
    expect(toPublicUsagePercentage(1_500, 1_200)).toBe(100);
    expect(toPublicUsagePercentage(-10, 1_200)).toBe(0);
    expect(toPublicUsagePercentage(10, 0)).toBe(0);
  });
});
