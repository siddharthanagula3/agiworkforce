import { describe, it, expect } from 'vitest';
import { TierInfoSchema } from '../protocol/apiResponses';
import { parseTierInfoResponse } from '../utils/api';

const canonicalUsageResponse = {
  plan_tier: 'pro',
  usage_percentage: 42,
  usage_reset_at: '2026-09-01T00:00:00.000Z',
  has_usage_remaining: true,
  period_start: '2026-08-01T00:00:00.000Z',
  period_end: '2026-09-01T00:00:00.000Z',
  subscription_status: 'active',
  session_usage_percentage: 12,
  session_reset_at: '2026-08-16T05:00:00.000Z',
  weekly_usage_percentage: 30,
  weekly_reset_at: '2026-08-22T00:00:00.000Z',
  flagship_weekly_usage_percentage: 8,
  flagship_weekly_reset_at: '2026-08-22T00:00:00.000Z',
};

describe('usage summary parsing', () => {
  it('reads every published limit out of the full /api/usage summary', () => {
    expect(parseTierInfoResponse(canonicalUsageResponse)).toEqual({
      tier: 'pro',
      subscriptionStatus: 'active',
      usagePercentage: 42,
      resetsAt: '2026-09-01T00:00:00.000Z',
      hasUsageRemaining: true,
      usageBuckets: [
        {
          bucket: 'session',
          percentRemaining: 88,
          resetAt: '2026-08-16T05:00:00.000Z',
        },
        { bucket: 'weekly', percentRemaining: 70, resetAt: '2026-08-22T00:00:00.000Z' },
        {
          bucket: 'weeklyFlagship',
          percentRemaining: 92,
          resetAt: '2026-08-22T00:00:00.000Z',
        },
        { bucket: 'period', percentRemaining: 58, resetAt: '2026-09-01T00:00:00.000Z' },
      ],
    });
  });

  it('still reports the billing period when a deployment omits the rolling windows', () => {
    const {
      session_usage_percentage: _session,
      session_reset_at: _sessionReset,
      weekly_usage_percentage: _weekly,
      weekly_reset_at: _weeklyReset,
      flagship_weekly_usage_percentage: _flagship,
      flagship_weekly_reset_at: _flagshipReset,
      ...withoutRollingWindows
    } = canonicalUsageResponse;

    expect(parseTierInfoResponse(withoutRollingWindows)?.usageBuckets).toEqual([
      { bucket: 'period', percentRemaining: 58, resetAt: '2026-09-01T00:00:00.000Z' },
    ]);
  });

  it('rejects a reset timestamp that would render as an invalid date', () => {
    expect(
      parseTierInfoResponse({ ...canonicalUsageResponse, usage_reset_at: 'next month' }),
    ).toBeUndefined();
  });

  it('rejects a summary that omits the contract-required usage percentage', () => {
    const { usage_percentage: _omitted, ...withoutPercentage } = canonicalUsageResponse;
    expect(TierInfoSchema.safeParse(withoutPercentage).success).toBe(false);
  });

  it('rejects a usage percentage outside the contract range', () => {
    expect(
      TierInfoSchema.safeParse({ ...canonicalUsageResponse, usage_percentage: 140 }).success,
    ).toBe(false);
  });
});
