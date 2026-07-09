/**
 * Contract test for GET /api/me.
 *
 * Asserts the live route handler's JSON output parses against the shared
 * `MeResponseSchema` from @agiworkforce/services — the single schema that
 * desktop (`cloudAccountAuth`), mobile (tier store), and web
 * (`authentication-manager`) all validate against. This test is the
 * enforcement anchor: if the route's response shape drifts, it fails here
 * first, before any client breaks in production.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeResponseSchema } from '@agiworkforce/services';

vi.mock('server-only', () => ({}));

const { mockGetClerkAuthUser, mockNeonQuery, mockGetSubscription, mockGetBalance } = vi.hoisted(
  () => ({
    mockGetClerkAuthUser: vi.fn(),
    mockNeonQuery: vi.fn(),
    mockGetSubscription: vi.fn(),
    mockGetBalance: vi.fn(),
  }),
);

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mockGetClerkAuthUser,
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: {
      getUser: vi.fn().mockResolvedValue({
        fullName: 'Contract Tester',
        firstName: 'Contract',
        lastName: 'Tester',
        username: 'contract',
        primaryEmailAddress: { emailAddress: 'contract@example.com' },
      }),
    },
  }),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
  })),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: { getBalance: mockGetBalance },
}));

import { GET } from '../route';

function makeGetRequest() {
  return new Request('http://localhost:3000/api/me', { method: 'GET' }) as never;
}

describe('GET /api/me — shared cloud contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({
      userId: 'user_contract_1',
      email: 'contract@example.com',
    });
    mockNeonQuery.mockResolvedValue([{ routing_preferences: { us_only: false } }]);
  });

  it('response for a subscribed user parses against MeResponseSchema', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_end: '2026-08-05T00:00:00.000Z',
    });
    mockGetBalance.mockResolvedValue({
      account_id: 'acct_1',
      credits_remaining_cents: 1250,
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = MeResponseSchema.safeParse(body);
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.plan.tier).toBe('pro');
      expect(parsed.data.plan.current_period_end).toBeTypeOf('number');
      expect(parsed.data.feature_flags.advanced_model_access).toBe(true);
    }
  });

  it('response for a free user (no subscription, no credits) still parses', async () => {
    mockGetSubscription.mockResolvedValue(null);
    mockGetBalance.mockResolvedValue(null);
    mockNeonQuery.mockResolvedValue([]);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = MeResponseSchema.safeParse(body);
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.plan).toEqual({
        tier: 'free',
        display_name: 'Free',
        status: 'none',
        current_period_end: null,
      });
      expect(parsed.data.credits).toBeNull();
      expect(parsed.data.routing_preferences).toEqual({});
    }
  });

  it('response survives subscription/credit service failures (degraded free shape)', async () => {
    mockGetSubscription.mockRejectedValue(new Error('subscription backend down'));
    mockGetBalance.mockRejectedValue(new Error('credit backend down'));
    mockNeonQuery.mockRejectedValue(new Error('db down'));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(MeResponseSchema.safeParse(body).success).toBe(true);
  });
});
