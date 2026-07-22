import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  getPlanDailyUsageUnits,
  getPlanFiveHourUsageBudgetMicrousd,
  getPlanFiveHourUsageUnits,
  getPlanFlagshipWeeklyUsageBudgetCents,
  getPlanMonthlyUsageBudgetMicrousd,
  getPlanMonthlyUsageUnits,
  getPlanSessionUsageBudgetCents,
  getPlanUsageBudgetCents,
  getPlanWeeklyUsageBudgetMicrousd,
  getPlanWeeklyUsageBudgetCents,
  getPlanWeeklyUsageUnits,
  toPublicUsagePercentage,
} from './managed-usage-policy';

describe('managed usage policy', () => {
  it('keeps the founder-set private monthly and rolling-week limits in one server owner', () => {
    expect(getPlanMonthlyUsageUnits('basic')).toBe(400);
    expect(getPlanMonthlyUsageUnits('pro')).toBe(2_000);
    expect(getPlanMonthlyUsageUnits('max')).toBe(10_000);
    expect(getPlanMonthlyUsageUnits('max_15x')).toBe(30_000);
    expect(getPlanMonthlyUsageUnits('team')).toBe(2_000);

    expect(getPlanWeeklyUsageUnits('basic')).toBe(100);
    expect(getPlanWeeklyUsageUnits('pro')).toBe(500);
    expect(getPlanWeeklyUsageUnits('max')).toBe(2_500);
    expect(getPlanWeeklyUsageUnits('max_15x')).toBe(7_500);
    expect(getPlanWeeklyUsageUnits('team')).toBe(500);
  });

  it('uses founder-set Free rolling limits without a daily cap', () => {
    expect(getPlanMonthlyUsageUnits('free')).toBe(20);
    expect(getPlanWeeklyUsageUnits('free')).toBe(15);
    expect(getPlanFiveHourUsageUnits('free')).toBe(5);
    expect(getPlanMonthlyUsageBudgetMicrousd('free')).toBe(100_000);
    expect(getPlanWeeklyUsageBudgetMicrousd('free')).toBe(75_000);
    expect(getPlanFiveHourUsageBudgetMicrousd('free')).toBe(25_000);
    expect(getPlanDailyUsageUnits('free')).toBe(0);
    expect(getPlanDailyUsageUnits('pro')).toBe(0);
  });

  it('converts paid allocations to the existing cents ledger without a percentage-of-price rule', () => {
    expect(getPlanUsageBudgetCents('basic')).toBe(200);
    expect(getPlanUsageBudgetCents('pro')).toBe(1_000);
    expect(getPlanUsageBudgetCents('max')).toBe(5_000);
    expect(getPlanUsageBudgetCents('max_15x')).toBe(15_000);
    expect(getPlanUsageBudgetCents('team')).toBe(1_000);
    expect(getPlanUsageBudgetCents('enterprise')).toBe(0);
    expect(getPlanUsageBudgetCents('free')).toBe(0);
  });

  it('keeps the rolling five-hour and flagship sub-limits tied to the weekly window', () => {
    expect(getPlanWeeklyUsageBudgetCents('pro')).toBe(250);
    expect(getPlanSessionUsageBudgetCents('pro')).toBe(50);
    expect(getPlanFlagshipWeeklyUsageBudgetCents('pro')).toBe(75);
  });

  it('fails unknown plan names closed', () => {
    expect(getPlanMonthlyUsageUnits('unknown')).toBe(0);
    expect(getPlanWeeklyUsageUnits(undefined)).toBe(0);
    expect(getPlanUsageBudgetCents(null)).toBe(0);
  });

  it('converts private ledger operands into a bounded public percentage', () => {
    expect(toPublicUsagePercentage(400, 1_200)).toBe(33.33);
    expect(toPublicUsagePercentage(1_500, 1_200)).toBe(100);
    expect(toPublicUsagePercentage(-10, 1_200)).toBe(0);
    expect(toPublicUsagePercentage(10, 0)).toBe(0);
  });
});
