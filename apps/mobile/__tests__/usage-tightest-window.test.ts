jest.mock('@/services/api', () => ({ api: {} }));

import { tightestUsageWindow, type UsageSnapshot } from '@/services/usage';

function snapshot(overrides: Partial<UsageSnapshot>): UsageSnapshot {
  return {
    planTier: 'pro',
    usagePercentage: 20,
    usageResetAt: '2026-12-01T00:00:00Z',
    hasUsageRemaining: true,
    periodStart: null,
    periodEnd: null,
    subscriptionStatus: 'active',
    sessionUsagePercentage: 0,
    sessionResetAt: null,
    weeklyUsagePercentage: 0,
    weeklyResetAt: null,
    flagshipWeeklyUsagePercentage: 0,
    flagshipWeeklyResetAt: null,
    credits: null,
    ...overrides,
  };
}

describe('tightestUsageWindow', () => {
  it('names the five-hour session when it has less left than the week', () => {
    expect(
      tightestUsageWindow(
        snapshot({
          sessionUsagePercentage: 90,
          sessionResetAt: '2026-11-12T10:00:00Z',
          weeklyUsagePercentage: 30,
          weeklyResetAt: '2026-11-16T00:00:00Z',
        }),
      ),
    ).toBe('Current session 10%');
  });

  it('names the week when it is the tighter window', () => {
    expect(
      tightestUsageWindow(
        snapshot({
          sessionUsagePercentage: 10,
          sessionResetAt: '2026-11-12T10:00:00Z',
          weeklyUsagePercentage: 65,
          weeklyResetAt: '2026-11-16T00:00:00Z',
        }),
      ),
    ).toBe('This week 35%');
  });

  it('falls back to the billing period and says nothing without any window', () => {
    expect(tightestUsageWindow(snapshot({ usagePercentage: 40 }))).toBe('This billing period 60%');
    expect(tightestUsageWindow(snapshot({ usageResetAt: null }))).toBeNull();
  });
});
