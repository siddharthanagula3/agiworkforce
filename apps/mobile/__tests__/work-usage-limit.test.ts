jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import {
  isUsageExhausted,
  usageRecoveryActionLabel,
  usageRecoveryForPlan,
} from '../src/features/chat/hooks/useWorkUsageLimit';
import type { UsageSnapshot } from '../services/usage';

type Credits = NonNullable<UsageSnapshot['credits']>;

function snapshot(
  overrides: Partial<UsageSnapshot> = {},
  credits: Partial<Credits> = {},
): UsageSnapshot {
  const window = { allowance: 100, used: 100, remaining: 0, reset_at: null };
  return {
    planTier: 'pro',
    usagePercentage: 100,
    usageResetAt: null,
    hasUsageRemaining: false,
    periodStart: null,
    periodEnd: null,
    subscriptionStatus: 'active',
    sessionUsagePercentage: 100,
    sessionResetAt: null,
    weeklyUsagePercentage: 100,
    weeklyResetAt: null,
    flagshipWeeklyUsagePercentage: 0,
    flagshipWeeklyResetAt: null,
    credits: {
      monthly: window,
      weekly: window,
      five_hour: window,
      flagship_weekly: null,
      purchased: { remaining: 0, overage_enabled: false },
      bonus: null,
      ...credits,
    } as Credits,
    ...overrides,
  };
}

describe('usage exhaustion from a usage snapshot', () => {
  it('is exhausted only when the server reports none left and no credits could carry a turn', () => {
    expect(isUsageExhausted(snapshot())).toBe(true);
  });

  it('is not exhausted while the server still reports usage', () => {
    expect(isUsageExhausted(snapshot({ hasUsageRemaining: true }))).toBe(false);
  });

  it.each([
    ['purchased credits remain', { purchased: { remaining: 10, overage_enabled: false } }],
    [
      'the purchased balance is unknown',
      { purchased: { remaining: null, overage_enabled: false } },
    ],
    ['overage is on', { purchased: { remaining: 0, overage_enabled: true } }],
    ['bonus credits remain', { bonus: { remaining: 5, next_expiry_at: null } }],
  ])('leaves the send to the server when %s', (_label, credits) => {
    expect(isUsageExhausted(snapshot({}, credits as Partial<Credits>))).toBe(false);
  });

  it('leaves the send to the server when credits are not reported', () => {
    expect(isUsageExhausted(snapshot({ credits: null }))).toBe(false);
  });
});

describe('usage recovery by plan', () => {
  it('offers Free only Upgrade', () => {
    expect(usageRecoveryForPlan('free')).toBe('upgrade');
    expect(usageRecoveryActionLabel('upgrade')).toBe('Upgrade');
  });

  it('offers a self-serve paid plan Add credits', () => {
    expect(usageRecoveryForPlan('pro')).toBe('add_credits');
    expect(usageRecoveryActionLabel('add_credits')).toBe('Add credits');
  });

  it('offers no action when the only recovery is waiting', () => {
    expect(usageRecoveryActionLabel('wait')).toBeNull();
  });
});
