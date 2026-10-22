import { describe, expect, it } from 'vitest';
import {
  earliestExhaustedUsageResetAt,
  isAccountWideUsageFeature,
  resolveExhaustedUsageRecovery,
  resolvePlanUsageRecovery,
  resolveWorkUsageRecovery,
  workUsageRecoveryActionLabel,
  WORK_USAGE_COPY,
  type UsageSnapshotExhaustionInput,
} from '../work-usage';
import type { ManagedUsageCredits } from '../managed-usage-balance';
import { PRODUCT_NAMES } from '../product-names';

describe('work usage recovery', () => {
  it('offers credits to a paid plan whose spent usage credits can clear', () => {
    expect(resolveWorkUsageRecovery('insufficient_credits', 'pro')).toBe('add_credits');
    expect(resolveWorkUsageRecovery('rolling_five_hour_limit_reached', 'pro')).toBe('add_credits');
  });

  it('offers only Upgrade to the Free plan', () => {
    expect(resolveWorkUsageRecovery('free_trial_token_budget_reached', 'free')).toBe('upgrade');
    expect(resolveWorkUsageRecovery('insufficient_credits', 'free')).toBe('upgrade');
  });

  it('upgrades a paid plan when credits cannot clear the limit', () => {
    expect(resolveWorkUsageRecovery('monthly_credit_limit_reached', 'pro')).toBe('upgrade');
  });

  it('leaves refusals another model or a retry can answer to the send error', () => {
    expect(resolveWorkUsageRecovery('flagship_weekly_limit_reached', 'pro')).toBeNull();
    expect(resolveWorkUsageRecovery('rate_limit_exceeded', 'pro')).toBeNull();
    expect(resolveWorkUsageRecovery(null, 'pro')).toBeNull();
  });

  it('treats only plan capacity as account-wide', () => {
    expect(isAccountWideUsageFeature('token_cap')).toBe(true);
    expect(isAccountWideUsageFeature('rolling_capacity')).toBe(true);
    expect(isAccountWideUsageFeature('request_rate')).toBe(false);
  });

  it('names the product from the registry and states no usage figures', () => {
    expect(WORK_USAGE_COPY.title).toContain(PRODUCT_NAMES.work);
    for (const body of Object.values(WORK_USAGE_COPY.body)) {
      expect(body).not.toMatch(/\d|\$|%/);
    }
  });
});

describe('usage exhaustion from a usage snapshot', () => {
  const NOW = Date.parse('2026-10-22T12:00:00Z');
  const window = { allowance: 100, used: 100, remaining: 0, reset_at: null };

  function input(
    overrides: Partial<UsageSnapshotExhaustionInput> = {},
    credits: Partial<ManagedUsageCredits> = {},
  ): UsageSnapshotExhaustionInput {
    return {
      planTier: 'pro',
      hasUsageRemaining: false,
      usageAllocation: 'provisioned',
      credits: {
        monthly: window,
        weekly: window,
        five_hour: window,
        flagship_weekly: null,
        purchased: { remaining: 0, overage_enabled: false },
        bonus: null,
        ...credits,
      },
      readings: [
        { bucket: 'session', percentRemaining: 0, resetAt: '2026-10-22T14:00:00Z' },
        { bucket: 'weekly', percentRemaining: 40, resetAt: '2026-10-25T00:00:00Z' },
      ],
      ...overrides,
    };
  }

  it('offers a paid plan Add credits once usage and credits are spent', () => {
    expect(resolveExhaustedUsageRecovery(input(), NOW)).toBe('add_credits');
  });

  it('offers Free only Upgrade', () => {
    expect(resolveExhaustedUsageRecovery(input({ planTier: 'free' }), NOW)).toBe('upgrade');
    expect(
      resolveExhaustedUsageRecovery(
        input({ planTier: 'free' }, { purchased: { remaining: 20, overage_enabled: false } }),
        NOW,
      ),
    ).toBe('upgrade');
  });

  it('asks to turn on usage credits when bought credits are switched off', () => {
    expect(
      resolveExhaustedUsageRecovery(
        input({}, { purchased: { remaining: 20, overage_enabled: false } }),
        NOW,
      ),
    ).toBe('enable_usage_credits');
    expect(workUsageRecoveryActionLabel('enable_usage_credits')).toBe('Turn on usage credits');
  });

  it('offers more credits when usage credits are on but spent', () => {
    expect(
      resolveExhaustedUsageRecovery(
        input({}, { purchased: { remaining: 0, overage_enabled: true } }),
        NOW,
      ),
    ).toBe('add_credits');
  });

  it.each<[string, Partial<UsageSnapshotExhaustionInput>, Partial<ManagedUsageCredits>]>([
    ['the server reports usage left', { hasUsageRemaining: true }, {}],
    ['the allocation is still pending', { usageAllocation: 'pending' }, {}],
    ['credits are not reported', { credits: null }, {}],
    [
      'the bought balance is unknown',
      {},
      { purchased: { remaining: null, overage_enabled: false } },
    ],
    [
      'usage credits are on and funded',
      {},
      { purchased: { remaining: 20, overage_enabled: true } },
    ],
    ['bonus credits remain', {}, { bonus: { remaining: 5, next_expiry_at: null } }],
    [
      'the exhausted window has already reset',
      {
        readings: [{ bucket: 'session', percentRemaining: 0, resetAt: '2026-10-22T11:00:00Z' }],
      },
      {},
    ],
  ])('blocks nothing when %s', (_label, overrides, credits) => {
    expect(resolveExhaustedUsageRecovery(input(overrides, credits), NOW)).toBeNull();
  });

  it('finds the earliest reset among exhausted windows only', () => {
    expect(
      earliestExhaustedUsageResetAt([
        { bucket: 'weekly', percentRemaining: 0, resetAt: '2026-10-25T00:00:00Z' },
        { bucket: 'session', percentRemaining: 0, resetAt: '2026-10-22T14:00:00Z' },
        { bucket: 'period', percentRemaining: 30, resetAt: '2026-10-22T13:00:00Z' },
      ]),
    ).toBe(Date.parse('2026-10-22T14:00:00Z'));
  });

  it('maps plans to their recovery and labels', () => {
    expect(resolvePlanUsageRecovery('free')).toBe('upgrade');
    expect(resolvePlanUsageRecovery('pro')).toBe('add_credits');
    expect(workUsageRecoveryActionLabel('add_credits')).toBe(WORK_USAGE_COPY.addCredits);
    expect(workUsageRecoveryActionLabel('upgrade')).toBe(WORK_USAGE_COPY.upgrade);
    expect(workUsageRecoveryActionLabel('wait')).toBeNull();
  });
});
