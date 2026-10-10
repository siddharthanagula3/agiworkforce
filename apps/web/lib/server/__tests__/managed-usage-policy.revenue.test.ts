import { describe, expect, it, vi } from 'vitest';

import { effectiveManagedUsageLimit, MICROUSD_PER_CREDIT } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import {
  getPlanFiveHourUsageCredits,
  getPlanMonthlyUsageCredits,
  getPlanSessionUsageCapMicrousd,
  getPlanUsageBudgetCents,
  getPlanWeeklyUsageCapMicrousd,
  getPlanWeeklyUsageCredits,
} from '../managed-usage-policy';

const INDIA_WEB = { channel: 'web', currency: 'inr' } as const;

describe('managed usage limits follow the subscriber’s revenue', () => {
  it('resolves every window of an India web Basic subscriber from the scaled limit', () => {
    const subject = { tier: 'basic', catalogVersion: null, revenueContext: INDIA_WEB };
    const scaled = effectiveManagedUsageLimit('basic', null, INDIA_WEB);

    expect(getPlanMonthlyUsageCredits(subject)).toBe(scaled.monthlyCredits);
    expect(getPlanWeeklyUsageCredits(subject)).toBe(scaled.weeklyCredits);
    expect(getPlanFiveHourUsageCredits(subject)).toBe(scaled.fiveHourCredits);
    expect(getPlanSessionUsageCapMicrousd(subject)).toBe(
      scaled.fiveHourCredits * MICROUSD_PER_CREDIT,
    );
    expect(getPlanWeeklyUsageCapMicrousd(subject)).toBe(scaled.weeklyCredits * MICROUSD_PER_CREDIT);
  });

  it('caps an India web Basic subscriber below a US one in all three windows', () => {
    const india = { tier: 'basic', catalogVersion: null, revenueContext: INDIA_WEB };
    const us = { tier: 'basic', catalogVersion: null, revenueContext: null };

    expect(getPlanUsageBudgetCents(india)).toBeLessThan(getPlanUsageBudgetCents(us));
    expect(getPlanWeeklyUsageCapMicrousd(india)!).toBeLessThan(getPlanWeeklyUsageCapMicrousd(us)!);
    expect(getPlanSessionUsageCapMicrousd(india)!).toBeLessThan(
      getPlanSessionUsageCapMicrousd(us)!,
    );
  });

  it('keeps a plain tier string on the base budget', () => {
    expect(getPlanMonthlyUsageCredits('basic')).toBe(
      getPlanMonthlyUsageCredits({ tier: 'basic', catalogVersion: null }),
    );
  });
});
