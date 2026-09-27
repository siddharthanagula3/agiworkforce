import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetUserScopedDb,
  mockGetBalance,
  mockGetSubscription,
  mockGetRollingUsage,
  mockGetFreeTrialPublicUsage,
  mockDbQuery,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockGetBalance: vi.fn(),
  mockGetSubscription: vi.fn(),
  mockGetRollingUsage: vi.fn(),
  mockGetFreeTrialPublicUsage: vi.fn(),
  mockDbQuery: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mockDbQuery }),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: mockGetUserScopedDb,
}));

vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

  CreditService: { getBalance: mockGetBalance },
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));

vi.mock('@/lib/server/rolling-usage', () => ({
  getRollingUsage: mockGetRollingUsage,
}));

vi.mock('@/lib/services/free-trial-service', () => ({
  getFreeTrialPublicUsage: mockGetFreeTrialPublicUsage,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimitHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsRoute: (handler: (...args: unknown[]) => unknown) => handler,
}));

import { GET } from '../route';
import { ApiKeyScopeError } from '@/lib/api-key-scope-error';

function makeRequest() {
  return new Request('http://localhost:3000/api/usage', { method: 'GET' }) as never;
}

describe('GET /api/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: mockDbQuery },
      userId: 'user-1',
      organizationId: null,
    });
    mockGetFreeTrialPublicUsage.mockResolvedValue({
      usagePercentage: 0,
      resetAt: null,
      hasUsageRemaining: true,
    });
    mockDbQuery.mockResolvedValue([{ overage_enabled: false, available_microusd: 0 }]);
  });

  it('publishes the spendable credit balance and whether it will actually be spent', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: 20_000_000,
      credits_used_microusd: 1_000_000,
      credits_remaining_microusd: 19_000_000,
      credits_allocated_cents: 2000,
      credits_used_cents: 100,
      credits_remaining_cents: 1900,
    });
    mockGetRollingUsage.mockResolvedValue({ usedMicrousd: 0, usedCents: 0, oldestAt: null });
    mockDbQuery.mockResolvedValue([{ overage_enabled: true, available_microusd: '12340000' }]);

    const json = await (await GET(makeRequest())).json();

    expect(json.credit_balance_cents).toBe(1234);
    expect(json.overage_enabled).toBe(true);
  });

  it('reports an unknown balance rather than zero when the credit lookup fails', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: 20_000_000,
      credits_used_microusd: 1_000_000,
      credits_remaining_microusd: 19_000_000,
      credits_allocated_cents: 2000,
      credits_used_cents: 100,
      credits_remaining_cents: 1900,
    });
    mockGetRollingUsage.mockResolvedValue({ usedMicrousd: 0, usedCents: 0, oldestAt: null });
    mockDbQuery.mockRejectedValue(new Error('connection lost'));

    const json = await (await GET(makeRequest())).json();

    expect(json.credit_balance_cents).toBeNull();
    expect(json.overage_enabled).toBe(false);
  });

  it('includes session/weekly/flagship-weekly fields derived from real rolling-window spend for a paid tier', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_start: '2026-07-01T00:00:00.000Z',
      current_period_end: '2026-08-01T00:00:00.000Z',
    });
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: 10_000_000,
      credits_used_microusd: 1_000_000,
      credits_remaining_microusd: 9_000_000,
      credits_allocated_cents: 1000,
      credits_used_cents: 100,
      credits_remaining_cents: 900,
      period_start: '2026-07-01T00:00:00.000Z',
      period_end: '2026-08-01T00:00:00.000Z',
    });
    mockGetRollingUsage
      .mockResolvedValueOnce({
        usedMicrousd: 100000,
        usedCents: 10,
        oldestAt: '2026-07-05T03:00:00.000Z',
      })
      .mockResolvedValueOnce({
        usedMicrousd: 500000,
        usedCents: 50,
        oldestAt: '2026-07-01T12:00:00.000Z',
      })
      .mockResolvedValueOnce({
        usedMicrousd: 100000,
        usedCents: 10,
        oldestAt: '2026-07-02T00:00:00.000Z',
      });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.usage_percentage).toBe(10);
    expect(json.session_usage_percentage).toBe(40);
    expect(json.session_reset_at).toBe(
      new Date(Date.parse('2026-07-05T03:00:00.000Z') + 5 * 60 * 60 * 1000).toISOString(),
    );
    expect(json.weekly_usage_percentage).toBe(20);
    expect(json.flagship_weekly_usage_percentage).toBeCloseTo(13.33, 2);
    expect(json.credits).toMatchObject({
      monthly: { allowance: 2_000, used: 200, remaining: 1_800, reset_at: json.usage_reset_at },
      weekly: { allowance: 500, used: 100, remaining: 400, reset_at: json.weekly_reset_at },
      five_hour: { allowance: 50, used: 20, remaining: 30, reset_at: json.session_reset_at },
      flagship_weekly: {
        allowance: 150,
        used: 20,
        remaining: 130,
        reset_at: json.flagship_weekly_reset_at,
      },
    });
    expect(json).not.toHaveProperty('credits_allocated_cents');
    expect(json).not.toHaveProperty('credits_used_cents');
    expect(json).not.toHaveProperty('credits_remaining_cents');
    expect(json).not.toHaveProperty('session_used_cents');
    expect(json).not.toHaveProperty('session_cap_cents');
    expect(json).not.toHaveProperty('weekly_used_cents');
    expect(json).not.toHaveProperty('weekly_cap_cents');
    expect(json).not.toHaveProperty('flagship_weekly_used_cents');
    expect(json).not.toHaveProperty('flagship_weekly_cap_cents');

    expect(mockGetRollingUsage).toHaveBeenCalledTimes(3);
  });

  it('states the Free windows in credits from the free usage counters, without private operands', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'free', status: 'none' });
    mockGetBalance.mockResolvedValue(null);
    mockGetFreeTrialPublicUsage.mockResolvedValue({
      usagePercentage: 75,
      resetAt: '2026-07-19T12:00:00.000Z',
      sessionUsagePercentage: 50,
      sessionResetAt: '2026-07-18T17:00:00.000Z',
      weeklyUsagePercentage: 60,
      weeklyResetAt: '2026-07-22T00:00:00.000Z',
      hasUsageRemaining: true,
      monthlyUsedMicrousd: 75_000,
      weeklyUsedMicrousd: 45_000,
      fiveHourUsedMicrousd: 5_000,
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.usage_percentage).toBe(75);
    expect(json.usage_reset_at).toBe('2026-07-19T12:00:00.000Z');
    expect(json.session_usage_percentage).toBe(50);
    expect(json.session_reset_at).toBe('2026-07-18T17:00:00.000Z');
    expect(json.weekly_usage_percentage).toBe(60);
    expect(json.weekly_reset_at).toBe('2026-07-22T00:00:00.000Z');
    expect(json.flagship_weekly_usage_percentage).toBe(0);
    expect(json.credits).toMatchObject({
      monthly: { allowance: 20, used: 15, remaining: 5, reset_at: '2026-07-19T12:00:00.000Z' },
      weekly: { allowance: 15, used: 9, remaining: 6, reset_at: '2026-07-22T00:00:00.000Z' },
      five_hour: { allowance: 2, used: 1, remaining: 1, reset_at: '2026-07-18T17:00:00.000Z' },
      flagship_weekly: null,
    });
    expect(json).not.toHaveProperty('usage_allocation');
    expect(mockGetRollingUsage).not.toHaveBeenCalled();
    expect(mockGetFreeTrialPublicUsage).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(JSON.stringify(json)).not.toMatch(/microusd|daily_cost|daily_reserved/i);
  });

  it('returns null reset timestamps when there is no usage yet in the window', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'max', status: 'active' });
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: 75_000_000,
      credits_used_microusd: 0,
      credits_remaining_microusd: 75_000_000,
      credits_allocated_cents: 7500,
      credits_used_cents: 0,
      credits_remaining_cents: 7500,
      period_start: null,
      period_end: null,
    });
    mockGetRollingUsage.mockResolvedValue({ usedMicrousd: 0, usedCents: 0, oldestAt: null });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.session_reset_at).toBeNull();
    expect(json.weekly_reset_at).toBeNull();
    expect(json.flagship_weekly_reset_at).toBeNull();
  });

  it('reports no immediately available usage when a shared rolling admission window is exhausted', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: 20_000_000,
      credits_used_microusd: 1_000_000,
      credits_remaining_microusd: 19_000_000,
      credits_allocated_cents: 2000,
      credits_used_cents: 100,
      credits_remaining_cents: 1900,
      period_start: '2026-07-01T00:00:00.000Z',
      period_end: '2026-08-01T00:00:00.000Z',
    });
    mockGetRollingUsage
      .mockResolvedValueOnce({
        usedMicrousd: 1000000,
        usedCents: 100,
        oldestAt: '2026-07-18T16:00:00.000Z',
      })
      .mockResolvedValueOnce({
        usedMicrousd: 1000000,
        usedCents: 100,
        oldestAt: '2026-07-15T00:00:00.000Z',
      })
      .mockResolvedValueOnce({ usedMicrousd: 0, usedCents: 0, oldestAt: null });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.session_usage_percentage).toBe(100);
    expect(json.has_usage_remaining).toBe(false);
  });

  it('keeps non-flagship work available when only the flagship sub-limit is exhausted', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
    mockGetBalance.mockResolvedValue({
      credits_allocated_microusd: 20_000_000,
      credits_used_microusd: 1_000_000,
      credits_remaining_microusd: 19_000_000,
      credits_allocated_cents: 2000,
      credits_used_cents: 100,
      credits_remaining_cents: 1900,
    });
    mockGetRollingUsage
      .mockResolvedValueOnce({
        usedMicrousd: 100000,
        usedCents: 10,
        oldestAt: '2026-07-18T16:00:00.000Z',
      })
      .mockResolvedValueOnce({
        usedMicrousd: 1000000,
        usedCents: 100,
        oldestAt: '2026-07-15T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        usedMicrousd: 1500000,
        usedCents: 150,
        oldestAt: '2026-07-15T00:00:00.000Z',
      });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.flagship_weekly_usage_percentage).toBe(100);
    expect(json.has_usage_remaining).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUserScopedDb.mockRejectedValue(new Error('no session'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('preserves a scoped-key denial as 403 and declares the usage-read requirement', async () => {
    mockGetUserScopedDb.mockRejectedValue(
      new ApiKeyScopeError('API key does not have the required scope'),
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(mockGetUserScopedDb).toHaveBeenCalledWith(expect.any(Request), {
      apiKeyScope: 'usage:read',
    });
  });
});
