import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MICROUSD_PER_CREDIT } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/services/bonus-credit-service');

const {
  mockGetBalance,
  mockResolveEffectiveSubscription,
  mockGetSpendableCredits,
  mockGetRollingUsage,
  mockGetFreeTrialPublicUsage,
  mockGetPrepaidCreditBalances,
} = vi.hoisted(() => ({
  mockGetBalance: vi.fn(),
  mockResolveEffectiveSubscription: vi.fn(),
  mockGetSpendableCredits: vi.fn(),
  mockGetRollingUsage: vi.fn(),
  mockGetFreeTrialPublicUsage: vi.fn(),
  mockGetPrepaidCreditBalances: vi.fn(),
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

vi.mock('@/lib/services/bonus-credit-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getPrepaidCreditBalances: mockGetPrepaidCreditBalances,
}));

import { getManagedUsageSummary } from '../managed-usage-summary-service';

const db = { query: vi.fn() } as never;

function credits(count: number): number {
  return count * MICROUSD_PER_CREDIT;
}

function subscription(planTier: string) {
  return {
    plan_tier: planTier,
    status: 'active',
    current_period_start: null,
    current_period_end: null,
  };
}

describe('managed usage summary, stated in credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSpendableCredits.mockResolvedValue({ availableCents: 400, overageEnabled: true });
    mockGetRollingUsage.mockResolvedValue({ usedMicrousd: 0, usedCents: 0, oldestAt: null });
    mockGetPrepaidCreditBalances.mockResolvedValue({
      bonusCredits: 500,
      purchasedCredits: 1_000,
      expiringPurchasedCredits: 0,
      overageHeadroomMicrousd: credits(1_500),
      nextBonusExpiry: '2026-12-01T00:00:00.000Z',
      nextPurchaseExpiry: null,
      bonusGrants: [],
      expiringPurchases: [],
    });
  });

  it('states a paid plan in the credits the plan table publishes for each window', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue(subscription('pro'));
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: credits(2_000),
      credits_used_microusd: credits(100),
      credits_remaining_microusd: credits(1_900),
      period_start: null,
      period_end: null,
    });
    mockGetRollingUsage
      .mockResolvedValueOnce({ usedMicrousd: credits(15), usedCents: 0, oldestAt: null })
      .mockResolvedValueOnce({ usedMicrousd: credits(60), usedCents: 0, oldestAt: null })
      .mockResolvedValueOnce({ usedMicrousd: credits(20), usedCents: 0, oldestAt: null });

    const summary = await getManagedUsageSummary(db, 'user-1');

    expect(summary.credits?.monthly).toMatchObject({
      allowance: 2_000,
      used: 100,
      remaining: 1_900,
    });
    expect(summary.credits?.weekly).toMatchObject({ allowance: 500, used: 60, remaining: 440 });
    expect(summary.credits?.five_hour).toMatchObject({ allowance: 50, used: 15, remaining: 35 });
    expect(summary.credits?.flagship_weekly).toMatchObject({ allowance: 150, used: 20 });
    expect(summary.credits?.purchased).toEqual({ remaining: 1_000, overage_enabled: true });
    expect(summary.credits?.bonus).toEqual({
      remaining: 500,
      next_expiry_at: '2026-12-01T00:00:00.000Z',
    });
    expect(summary.usage_allocation).toBe('provisioned');
  });

  it('states the Free windows in credits, measured on the Free ledger', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue(subscription('free'));
    mockGetBalance.mockResolvedValue(null);
    mockGetFreeTrialPublicUsage.mockResolvedValue({
      usagePercentage: 25,
      resetAt: '2026-10-01T00:00:00.000Z',
      sessionUsagePercentage: 50,
      sessionResetAt: '2026-09-27T15:00:00.000Z',
      weeklyUsagePercentage: 20,
      weeklyResetAt: '2026-10-03T00:00:00.000Z',
      hasUsageRemaining: true,
      monthlyUsedMicrousd: credits(5),
      weeklyUsedMicrousd: credits(3),
      fiveHourUsedMicrousd: credits(1),
    });

    const summary = await getManagedUsageSummary(db, 'user-2');

    expect(summary.credits?.monthly).toEqual({
      allowance: 20,
      used: 5,
      remaining: 15,
      reset_at: '2026-10-01T00:00:00.000Z',
    });
    expect(summary.credits?.weekly).toEqual({
      allowance: 15,
      used: 3,
      remaining: 12,
      reset_at: '2026-10-03T00:00:00.000Z',
    });
    expect(summary.credits?.five_hour).toEqual({
      allowance: 2,
      used: 1,
      remaining: 1,
      reset_at: '2026-09-27T15:00:00.000Z',
    });
    expect(summary.usage_percentage).toBe(25);
    expect(summary.session_usage_percentage).toBe(50);
    expect(summary.weekly_usage_percentage).toBe(20);
    expect(summary.has_usage_remaining).toBe(true);
    expect(summary).not.toHaveProperty('usage_allocation');
    expect(mockGetRollingUsage).not.toHaveBeenCalled();
  });

  it('states no allowance for a plan that spends nothing here', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue(subscription('byok'));
    mockGetBalance.mockResolvedValue(null);

    const summary = await getManagedUsageSummary(db, 'user-3');

    expect(summary.credits).toBeUndefined();
  });

  it('reports unreadable bonus and purchased balances as unknown rather than none', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue(subscription('pro'));
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: credits(2_000),
      credits_used_microusd: 0,
      credits_remaining_microusd: credits(2_000),
      period_start: null,
      period_end: null,
    });
    mockGetPrepaidCreditBalances.mockRejectedValue(new Error('ledger unavailable'));

    const summary = await getManagedUsageSummary(db, 'user-4');

    expect(summary.credits?.purchased.remaining).toBeNull();
    expect(summary.credits?.bonus).toBeNull();
    expect(summary.credits?.purchase_expiry).toBeNull();
  });
});
