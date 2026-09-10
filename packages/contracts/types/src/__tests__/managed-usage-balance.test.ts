import { describe, expect, it } from 'vitest';
import {
  normalizeUsagePercentage,
  parseManagedUsageSummaryResponse,
} from '../managed-usage-balance';

describe('managed usage public contract', () => {
  it('normalizes untrusted client percentages without exposing private operands', () => {
    expect(normalizeUsagePercentage(42.4)).toBe(42);
    expect(normalizeUsagePercentage(101)).toBe(100);
    expect(normalizeUsagePercentage(-1)).toBe(0);
    expect(normalizeUsagePercentage('50')).toBe(0);
    expect(normalizeUsagePercentage(Number.NaN)).toBe(0);
  });

  it('projects an untrusted summary onto the percentage-only public DTO', () => {
    const parsed = parseManagedUsageSummaryResponse({
      plan_tier: 'pro',
      usage_percentage: 25,
      usage_reset_at: '2026-08-01T00:00:00.000Z',
      has_usage_remaining: true,
      period_start: '2026-07-01T00:00:00.000Z',
      period_end: '2026-08-01T00:00:00.000Z',
      subscription_status: 'active',
      session_usage_percentage: 50,
      session_reset_at: null,
      weekly_usage_percentage: 40,
      weekly_reset_at: null,
      flagship_weekly_usage_percentage: 10,
      flagship_weekly_reset_at: null,
      credits_allocated_cents: 2_000,
      credits_used_cents: 500,
      provider_cost_cents: 123,
    });

    expect(parsed).toEqual({
      plan_tier: 'pro',
      usage_percentage: 25,
      usage_reset_at: '2026-08-01T00:00:00.000Z',
      has_usage_remaining: true,
      period_start: '2026-07-01T00:00:00.000Z',
      period_end: '2026-08-01T00:00:00.000Z',
      subscription_status: 'active',
      session_usage_percentage: 50,
      session_reset_at: null,
      weekly_usage_percentage: 40,
      weekly_reset_at: null,
      flagship_weekly_usage_percentage: 10,
      flagship_weekly_reset_at: null,
    });
  });

  it('carries a published credit balance and whether it is spendable', () => {
    const parsed = parseManagedUsageSummaryResponse({
      plan_tier: 'pro',
      usage_percentage: 25,
      usage_reset_at: null,
      has_usage_remaining: true,
      period_start: null,
      period_end: null,
      subscription_status: 'active',
      session_usage_percentage: 0,
      session_reset_at: null,
      weekly_usage_percentage: 0,
      weekly_reset_at: null,
      flagship_weekly_usage_percentage: 0,
      flagship_weekly_reset_at: null,
      credit_balance_cents: 1_234,
      overage_enabled: true,
    });

    expect(parsed.credit_balance_cents).toBe(1_234);
    expect(parsed.overage_enabled).toBe(true);
  });

  it('rejects a credit balance that is not a whole non-negative cent count', () => {
    expect(() =>
      parseManagedUsageSummaryResponse({
        plan_tier: 'pro',
        usage_percentage: 25,
        usage_reset_at: null,
        has_usage_remaining: true,
        period_start: null,
        period_end: null,
        subscription_status: 'active',
        session_usage_percentage: 0,
        session_reset_at: null,
        weekly_usage_percentage: 0,
        weekly_reset_at: null,
        flagship_weekly_usage_percentage: 0,
        flagship_weekly_reset_at: null,
        credit_balance_cents: -5,
      }),
    ).toThrow(/credit_balance_cents/i);
  });

  it('rejects invalid public summary values at runtime', () => {
    expect(() =>
      parseManagedUsageSummaryResponse({
        plan_tier: 'pro',
        usage_percentage: 101,
        usage_reset_at: null,
        has_usage_remaining: false,
        period_start: null,
        period_end: null,
        subscription_status: 'active',
        session_usage_percentage: 0,
        session_reset_at: null,
        weekly_usage_percentage: 0,
        weekly_reset_at: null,
        flagship_weekly_usage_percentage: 0,
        flagship_weekly_reset_at: null,
      }),
    ).toThrow(/usage_percentage/i);
  });
  it('carries the credits block through, fractions intact', () => {
    const parsed = parseManagedUsageSummaryResponse({
      plan_tier: 'free',
      usage_percentage: 20,
      usage_reset_at: null,
      has_usage_remaining: true,
      period_start: null,
      period_end: null,
      subscription_status: 'active',
      session_usage_percentage: 0,
      session_reset_at: null,
      weekly_usage_percentage: 0,
      weekly_reset_at: null,
      flagship_weekly_usage_percentage: 0,
      flagship_weekly_reset_at: null,
      credits: {
        monthly: { allowance: 5, used: 1.25, remaining: 3.75, reset_at: null },
        weekly: { allowance: 3.75, used: 0.5, remaining: 3.25, reset_at: null },
        five_hour: {
          allowance: 1.25,
          used: 0.1,
          remaining: 1.15,
          reset_at: '2026-09-10T00:00:00.000Z',
        },
        flagship_weekly: null,
        purchased: { remaining: null, overage_enabled: false },
      },
    });

    expect(parsed.credits?.monthly.used).toBe(1.25);
    expect(parsed.credits?.weekly.allowance).toBe(3.75);
    expect(parsed.credits?.five_hour.reset_at).toBe('2026-09-10T00:00:00.000Z');
    expect(parsed.credits?.flagship_weekly).toBeNull();
    expect(parsed.credits?.purchased.remaining).toBeNull();
  });

  it('omits the credits block when the server does not send one', () => {
    const parsed = parseManagedUsageSummaryResponse({
      plan_tier: 'byok',
      usage_percentage: 0,
      usage_reset_at: null,
      has_usage_remaining: true,
      period_start: null,
      period_end: null,
      subscription_status: 'active',
      session_usage_percentage: 0,
      session_reset_at: null,
      weekly_usage_percentage: 0,
      weekly_reset_at: null,
      flagship_weekly_usage_percentage: 0,
      flagship_weekly_reset_at: null,
    });

    expect(parsed.credits).toBeUndefined();
  });

  it('rejects a negative credit amount', () => {
    expect(() =>
      parseManagedUsageSummaryResponse({
        plan_tier: 'pro',
        usage_percentage: 0,
        usage_reset_at: null,
        has_usage_remaining: true,
        period_start: null,
        period_end: null,
        subscription_status: 'active',
        session_usage_percentage: 0,
        session_reset_at: null,
        weekly_usage_percentage: 0,
        weekly_reset_at: null,
        flagship_weekly_usage_percentage: 0,
        flagship_weekly_reset_at: null,
        credits: {
          monthly: { allowance: -1, used: 0, remaining: 0, reset_at: null },
          weekly: { allowance: 125, used: 0, remaining: 125, reset_at: null },
          five_hour: { allowance: 25, used: 0, remaining: 25, reset_at: null },
          flagship_weekly: null,
          purchased: { remaining: 0, overage_enabled: false },
        },
      }),
    ).toThrow(/allowance/i);
  });
});
