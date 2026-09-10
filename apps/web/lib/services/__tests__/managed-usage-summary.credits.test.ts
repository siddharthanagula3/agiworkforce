import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetBalance,
  mockResolveEffectiveSubscription,
  mockGetSpendableCredits,
  mockGetRollingUsage,
  mockGetFreeTrialPublicUsage,
} = vi.hoisted(() => ({
  mockGetBalance: vi.fn(),
  mockResolveEffectiveSubscription: vi.fn(),
  mockGetSpendableCredits: vi.fn(),
  mockGetRollingUsage: vi.fn(),
  mockGetFreeTrialPublicUsage: vi.fn(),
}));

vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

  CreditService: { getBalance: mockGetBalance },
}));

vi.mock('@/lib/services/effective-subscription-service', () => ({
  resolveEffectiveSubscription: mockResolveEffectiveSubscription,
}));

vi.mock('@/lib/server/spendable-credits', () => ({
  getSpendableCredits: mockGetSpendableCredits,
}));

vi.mock('@/lib/server/rolling-usage', () => ({
  getRollingUsage: mockGetRollingUsage,
}));

vi.mock('@/lib/services/free-trial-service', () => ({
  getFreeTrialPublicUsage: mockGetFreeTrialPublicUsage,
}));

import { getManagedUsageSummary } from '../managed-usage-summary-service';

const db = { query: vi.fn() } as never;

describe('managed usage summary, stated in credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSpendableCredits.mockResolvedValue({ availableCents: 400, overageEnabled: true });
    mockGetRollingUsage.mockResolvedValue({ usedCents: 0, oldestAt: null });
  });

  it('maps a paid plan from its cents ledger onto the published allowances', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_start: null,
      current_period_end: null,
    });
    mockGetBalance.mockResolvedValue({
      credits_allocated_cents: 1000,
      credits_used_cents: 200,
      credits_remaining_cents: 800,
      period_start: null,
      period_end: null,
    });
    mockGetRollingUsage
      .mockResolvedValueOnce({ usedCents: 30, oldestAt: null })
      .mockResolvedValueOnce({ usedCents: 120, oldestAt: null })
      .mockResolvedValueOnce({ usedCents: 40, oldestAt: null });

    const summary = await getManagedUsageSummary(db, 'user-1');

    expect(summary.credits?.monthly).toMatchObject({ allowance: 500, used: 100, remaining: 400 });
    expect(summary.credits?.weekly).toMatchObject({ allowance: 125, used: 60, remaining: 65 });
    expect(summary.credits?.five_hour).toMatchObject({ allowance: 25, used: 15, remaining: 10 });
    expect(summary.credits?.flagship_weekly).toMatchObject({ allowance: 37.5, used: 20 });
    expect(summary.credits?.purchased).toEqual({ remaining: 200, overage_enabled: true });
  });

  it('maps the free lane from its microUSD counters, fractions intact', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue({
      plan_tier: 'free',
      status: 'active',
      current_period_start: null,
      current_period_end: null,
    });
    mockGetBalance.mockResolvedValue(null);
    mockGetFreeTrialPublicUsage.mockResolvedValue({
      usagePercentage: 25,
      resetAt: null,
      sessionUsagePercentage: 40,
      sessionResetAt: null,
      weeklyUsagePercentage: 20,
      weeklyResetAt: null,
      hasUsageRemaining: true,
      monthlyUsedMicrousd: 25_000,
      weeklyUsedMicrousd: 15_000,
      fiveHourUsedMicrousd: 10_000,
    });

    const summary = await getManagedUsageSummary(db, 'user-2');

    expect(summary.credits?.monthly).toMatchObject({ allowance: 5, used: 1.25, remaining: 3.75 });
    expect(summary.credits?.weekly).toMatchObject({ allowance: 3.75, used: 0.75, remaining: 3 });
    expect(summary.credits?.five_hour).toMatchObject({
      allowance: 1.25,
      used: 0.5,
      remaining: 0.75,
    });
    expect(summary.credits?.flagship_weekly).toBeNull();
  });

  it('states no allowance for a plan that spends nothing here', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue({
      plan_tier: 'byok',
      status: 'active',
      current_period_start: null,
      current_period_end: null,
    });
    mockGetBalance.mockResolvedValue(null);

    const summary = await getManagedUsageSummary(db, 'user-3');

    expect(summary.credits).toBeUndefined();
  });

  it('reports an unreadable purchased balance as unknown rather than none', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_start: null,
      current_period_end: null,
    });
    mockGetBalance.mockResolvedValue({
      credits_allocated_cents: 1000,
      credits_used_cents: 0,
      credits_remaining_cents: 1000,
      period_start: null,
      period_end: null,
    });
    mockGetSpendableCredits.mockResolvedValue({ availableCents: null, overageEnabled: false });

    const summary = await getManagedUsageSummary(db, 'user-4');

    expect(summary.credits?.purchased.remaining).toBeNull();
  });
});
