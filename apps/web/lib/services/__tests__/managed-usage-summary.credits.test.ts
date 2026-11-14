import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MANAGED_USAGE_LIMITS,
  MICROUSD_PER_CREDIT,
  getEffectivePlanCreditAllowance,
  isEntitledSubscriptionStatus,
  parseManagedUsageSummaryResponse,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/services/bonus-credit-service');
type EntitlementResolutionModule = typeof import('@/lib/services/entitlement-resolution');
type PricingModule = typeof import('@/lib/pricing');

const INR_BASIC_PRICE_ID = 'price_fixture_basic_monthly_inr';

const {
  mockGetBalance,
  mockResolveEffectiveSubscription,
  mockEntitledPlan,
  mockGetSpendableCredits,
  mockGetRollingUsage,
  mockGetAccountOverage,
  mockGetFreeTrialPublicUsage,
  mockGetPrepaidCreditBalances,
} = vi.hoisted(() => ({
  mockGetBalance: vi.fn(),
  mockResolveEffectiveSubscription: vi.fn(),
  mockEntitledPlan: vi.fn(),
  mockGetSpendableCredits: vi.fn(),
  mockGetRollingUsage: vi.fn(),
  mockGetAccountOverage: vi.fn(),
  mockGetFreeTrialPublicUsage: vi.fn(),
  mockGetPrepaidCreditBalances: vi.fn(),
}));

vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

  CreditService: { getBalance: mockGetBalance },
}));

vi.mock('@/lib/services/usage-limit-promotion-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  readSummaryPromotions: vi.fn(async () => null),
}));

vi.mock('@/lib/services/effective-subscription-service', async () => {
  const { usageAllowanceSubject } = await vi.importActual<EntitlementResolutionModule>(
    '@/lib/services/entitlement-resolution',
  );
  return {
    resolveEntitlementBundle: async (...args: unknown[]) => {
      const subscription = await mockResolveEffectiveSubscription(...args);
      return {
        subscription,
        plan: mockEntitledPlan() ?? subscription?.plan_tier ?? 'free',
        entitled: Boolean(subscription) && isEntitledSubscriptionStatus(subscription.status),
      };
    },
    usageAllowanceSubject,
  };
});

vi.mock('@/lib/server/spendable-credits', () => ({
  getSpendableCredits: mockGetSpendableCredits,
}));

vi.mock('@/lib/server/rolling-usage', () => ({
  getRollingUsage: mockGetRollingUsage,
  getAccountOverageMicrousd: mockGetAccountOverage,
}));

vi.mock('@/lib/services/free-trial-service', () => ({
  getFreeTrialPublicUsage: mockGetFreeTrialPublicUsage,
}));

vi.mock('@/lib/pricing', async (importOriginal) => {
  const actual = await importOriginal<PricingModule>();
  return {
    ...actual,
    getPricePointForPriceId: (priceId: string) =>
      priceId === INR_BASIC_PRICE_ID
        ? {
            plan: 'basic',
            interval: 'monthly',
            currency: 'inr',
            envVar: 'STRIPE_PRICE_BASIC_MONTHLY_INR',
          }
        : actual.getPricePointForPriceId(priceId),
  };
});

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
    mockGetSpendableCredits.mockResolvedValue({
      availableCents: 400,
      overageEnabled: true,
      selfServe: true,
    });
    mockGetRollingUsage.mockResolvedValue({ usedMicrousd: 0, usedCents: 0, oldestAt: null });
    mockGetAccountOverage.mockResolvedValue(0);
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
    expect(summary.credits?.purchased).toEqual({
      remaining: 1_000,
      overage_enabled: true,
      self_serve: true,
    });
    expect(summary.credits?.bonus).toEqual({
      remaining: 500,
      next_expiry_at: '2026-12-01T00:00:00.000Z',
    });
    expect(summary.usage_allocation).toBe('provisioned');
    expect(summary.effective_plan_tier).toBe('pro');
  });

  it('keeps Ultra usable beyond its former session allowance and omits that window from the wire contract', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue(subscription('max_15x'));
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: credits(20_000),
      credits_used_microusd: credits(1_500),
      credits_remaining_microusd: credits(18_500),
      period_start: null,
      period_end: null,
    });
    mockGetRollingUsage.mockResolvedValue({
      usedMicrousd: credits(1_500),
      usedCents: 0,
      oldestAt: '2026-11-07T00:00:00.000Z',
    });
    const summary = await getManagedUsageSummary(db, 'user-1');
    const parsed = parseManagedUsageSummaryResponse(JSON.parse(JSON.stringify(summary)));
    expect(parsed.credits?.five_hour).toBeNull();
    expect(parsed.session_reset_at).toBeNull();
    expect(parsed.has_usage_remaining).toBe(true);
    expect(parsed.credits?.weekly).toMatchObject({ allowance: 5_000, remaining: 3_500 });
    expect(parsed.credits?.monthly).toMatchObject({ allowance: 20_000, remaining: 18_500 });
  });

  it('leaves nothing to spend in a month whose credit period never opened, as the gate does', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue(subscription('max_15x'));
    mockGetBalance.mockResolvedValue({
      account_id: '',
      credits_allocated_microusd: 0,
      credits_used_microusd: 0,
      credits_remaining_microusd: 0,
      period_start: '',
      period_end: '',
    });

    const summary = await getManagedUsageSummary(db, 'user-1');

    expect(summary.usage_allocation).toBe('pending');
    expect(summary.has_usage_remaining).toBe(false);
    expect(summary.credits?.monthly).toMatchObject({
      allowance: MANAGED_USAGE_LIMITS.max_15x.monthlyCredits,
      remaining: 0,
    });
  });

  it('states the entitled tier beside the subscription row tier when the row has lapsed', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue({
      ...subscription('pro'),
      status: 'past_due',
    });
    mockEntitledPlan.mockReturnValueOnce('free');
    mockGetBalance.mockResolvedValue(null);
    mockGetFreeTrialPublicUsage.mockResolvedValue(null);

    const summary = await getManagedUsageSummary(db, 'user-1');

    expect(summary.plan_tier).toBe('pro');
    expect(summary.effective_plan_tier).toBe('free');
  });

  it('meters a lapsed paid plan on the Free ledger chat now serves it from, not on paid windows', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue({
      ...subscription('max_15x'),
      status: 'past_due',
    });
    mockEntitledPlan.mockReturnValueOnce('free');
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: credits(1_000),
      credits_used_microusd: 0,
      credits_remaining_microusd: credits(1_000),
      period_start: null,
      period_end: null,
    });
    mockGetFreeTrialPublicUsage.mockResolvedValue({
      usagePercentage: 100,
      resetAt: '2026-10-01T00:00:00.000Z',
      sessionUsagePercentage: 100,
      sessionResetAt: '2026-09-27T15:00:00.000Z',
      weeklyUsagePercentage: 100,
      weeklyResetAt: '2026-10-03T00:00:00.000Z',
      hasUsageRemaining: false,
      monthlyUsedMicrousd: credits(20),
      weeklyUsedMicrousd: credits(15),
      fiveHourUsedMicrousd: credits(2),
    });

    const summary = await getManagedUsageSummary(db, 'user-3');

    expect(summary.plan_tier).toBe('max_15x');
    expect(summary.subscription_status).toBe('past_due');
    expect(summary.has_usage_remaining).toBe(false);
    expect(summary.usage_percentage).toBe(100);
    expect(summary.credits?.monthly).toMatchObject({ allowance: 20, remaining: 0 });
    expect(summary).not.toHaveProperty('usage_allocation');
    expect(mockGetRollingUsage).not.toHaveBeenCalled();
  });

  it('states an India web Basic subscriber in the budget their rupee price pays for', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue({
      ...subscription('basic'),
      stripe_price_id: INR_BASIC_PRICE_ID,
    });
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: credits(100),
      credits_used_microusd: 0,
      credits_remaining_microusd: credits(100),
      period_start: null,
      period_end: null,
    });

    const summary = await getManagedUsageSummary(db, 'user-1');
    const effective = getEffectivePlanCreditAllowance('basic', null, {
      channel: 'web',
      currency: 'inr',
    });

    expect(effective.monthly).toBeLessThan(MANAGED_USAGE_LIMITS.basic.monthlyCredits);
    expect(summary.credits?.monthly.allowance).toBe(effective.monthly);
    expect(summary.credits?.weekly.allowance).toBe(effective.weekly);
    expect(summary.credits?.five_hour?.allowance).toBe(effective.fiveHour);
  });

  it('states a subscriber with no known region in the US budget', async () => {
    mockResolveEffectiveSubscription.mockResolvedValue({
      ...subscription('basic'),
      stripe_price_id: 'price_fixture_unregistered',
    });
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: credits(400),
      credits_used_microusd: 0,
      credits_remaining_microusd: credits(400),
      period_start: null,
      period_end: null,
    });

    const summary = await getManagedUsageSummary(db, 'user-1');

    expect(summary.credits?.monthly.allowance).toBe(MANAGED_USAGE_LIMITS.basic.monthlyCredits);
    expect(summary.credits?.five_hour?.allowance).toBe(MANAGED_USAGE_LIMITS.basic.fiveHourCredits);
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

type ImportedModule0 = typeof import('@/lib/services/usage-limit-promotion-service');
