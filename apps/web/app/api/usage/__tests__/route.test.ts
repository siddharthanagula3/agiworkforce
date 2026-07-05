/**
 * Tests for GET /api/usage.
 *
 * Covers the 2026-07-05 addition of session (rolling 5h) / weekly /
 * flagship-weekly usage fields, layered on top of the existing monthly
 * credit balance response — see billing-catalog.ts's
 * getPlanWeeklyUsageBudgetCents header comment for why these are a pacing
 * layer, not a replacement for the monthly budget.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetClerkAuthUser, mockGetBalance, mockGetSubscription, mockGetRollingUsage } =
  vi.hoisted(() => ({
    mockGetClerkAuthUser: vi.fn(),
    mockGetBalance: vi.fn(),
    mockGetSubscription: vi.fn(),
    mockGetRollingUsage: vi.fn(),
  }));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mockGetClerkAuthUser,
}));

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: { getBalance: mockGetBalance },
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));

vi.mock('@/lib/server/rolling-usage', () => ({
  getRollingUsage: mockGetRollingUsage,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimitHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
}));

import { GET } from '../route';

function makeRequest() {
  return new Request('http://localhost:3000/api/usage', { method: 'GET' }) as never;
}

describe('GET /api/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
  });

  it('includes session/weekly/flagship-weekly fields derived from real rolling-window spend for a paid tier', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_start: '2026-07-01T00:00:00.000Z',
      current_period_end: '2026-08-01T00:00:00.000Z',
    });
    mockGetBalance.mockResolvedValue({
      credits_allocated_cents: 1000,
      credits_used_cents: 100,
      credits_remaining_cents: 900,
      period_start: '2026-07-01T00:00:00.000Z',
      period_end: '2026-08-01T00:00:00.000Z',
    });
    // session used=20 (of cap 46), weekly all-models used=50 (of cap 231),
    // flagship-only used=10 (of cap 69) — see billing-catalog pro derivation.
    mockGetRollingUsage
      .mockResolvedValueOnce({ usedCents: 20, oldestAt: '2026-07-05T03:00:00.000Z' })
      .mockResolvedValueOnce({ usedCents: 50, oldestAt: '2026-07-01T12:00:00.000Z' })
      .mockResolvedValueOnce({ usedCents: 10, oldestAt: '2026-07-02T00:00:00.000Z' });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.session_used_cents).toBe(20);
    expect(json.session_cap_cents).toBe(46); // round(round(1000*12/52) * 0.2)
    expect(json.session_reset_at).toBe(
      new Date(Date.parse('2026-07-05T03:00:00.000Z') + 5 * 60 * 60 * 1000).toISOString(),
    );

    expect(json.weekly_used_cents).toBe(50);
    expect(json.weekly_cap_cents).toBe(231); // round(1000*12/52)

    expect(json.flagship_weekly_used_cents).toBe(10);
    expect(json.flagship_weekly_cap_cents).toBe(69); // round(231*0.3)

    // Real rolling-window queries were actually called (not skipped) for a paid tier.
    expect(mockGetRollingUsage).toHaveBeenCalledTimes(3);
  });

  it('skips the rolling-window queries and zeroes the fields for free tier (no derivable budget)', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'free', status: 'none' });
    mockGetBalance.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.session_cap_cents).toBe(0);
    expect(json.weekly_cap_cents).toBe(0);
    expect(json.flagship_weekly_cap_cents).toBe(0);
    expect(json.session_used_cents).toBe(0);
    expect(json.session_reset_at).toBeNull();
    expect(mockGetRollingUsage).not.toHaveBeenCalled();
  });

  it('returns null reset timestamps when there is no usage yet in the window', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'max', status: 'active' });
    mockGetBalance.mockResolvedValue({
      credits_allocated_cents: 7500,
      credits_used_cents: 0,
      credits_remaining_cents: 7500,
      period_start: null,
      period_end: null,
    });
    mockGetRollingUsage.mockResolvedValue({ usedCents: 0, oldestAt: null });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.session_reset_at).toBeNull();
    expect(json.weekly_reset_at).toBeNull();
    expect(json.flagship_weekly_reset_at).toBeNull();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetClerkAuthUser.mockRejectedValue(new Error('no session'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});
