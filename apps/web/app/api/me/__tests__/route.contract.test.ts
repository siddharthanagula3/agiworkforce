/**
 * Contract test for GET /api/me.
 *
 * Asserts the live route handler's JSON output parses against the shared
 * `MeResponseSchema` from @agiworkforce/cloud-contracts — the single schema that
 * desktop (`cloudAccountAuth`), mobile (tier store), and web
 * (`authentication-manager`) all validate against. This test is the
 * enforcement anchor: if the route's response shape drifts, it fails here
 * first, before any client breaks in production.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeResponseSchema } from '@agiworkforce/cloud-contracts';

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

function makeGetRequest(query?: string) {
  const url = query ? `http://localhost:3000/api/me?${query}` : 'http://localhost:3000/api/me';
  return new Request(url, { method: 'GET' }) as never;
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
      // First real consumer of the capability-handshake contract: the live
      // route must actually include it, not just the isolated service.
      expect(parsed.data.capability_handshake?.granted).toContain('canUseWebSearch');
      expect(parsed.data.capability_handshake?.granted).toContain('canUseVoice');
      expect(parsed.data.capability_handshake?.sources.tier).toBe('tier:pro');
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
      // Tier-layer honesty at the full integration level (real route, real
      // getTierPolicy('free')): Claude-style free chat grants search, voice,
      // and one custom remote connector while Deep Research remains paid.
      expect(parsed.data.capability_handshake?.granted).toContain('canUseWebSearch');
      expect(parsed.data.capability_handshake?.granted).not.toContain('canUseDeepResearch');
      expect(parsed.data.capability_handshake?.granted).toContain('canUseVoice');
      expect(parsed.data.capability_handshake?.granted).toContain('canUseConnectors');
      expect(parsed.data.capability_handshake?.deniedBy['canUseDeepResearch']).toEqual(['tier']);
      // But free users can still chat — tier honesty must not overcorrect
      // into denying universal capabilities.
      expect(parsed.data.capability_handshake?.granted).toContain('canChat');
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

describe('GET /api/me — capability_handshake surface parameter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({
      userId: 'user_contract_1',
      email: 'contract@example.com',
    });
    mockNeonQuery.mockResolvedValue([{ routing_preferences: { us_only: false } }]);
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'max',
      status: 'active',
      current_period_end: '2026-08-05T00:00:00.000Z',
    });
    mockGetBalance.mockResolvedValue(null);
  });

  it('defaults to the web surface when no ?surface= is given (no behavior change for existing callers)', async () => {
    const res = await GET(makeGetRequest());
    const body = await res.json();
    const parsed = MeResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.capability_handshake?.sources.surface).toBe('surface:web');
      expect(parsed.data.capability_handshake?.granted).not.toContain('canUseFileSystem');
    }
  });

  it('honors an explicit ?surface=desktop and grants desktop-only capabilities', async () => {
    const res = await GET(makeGetRequest('surface=desktop'));
    const body = await res.json();
    const parsed = MeResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.capability_handshake?.sources.surface).toBe('surface:desktop');
      expect(parsed.data.capability_handshake?.granted).toContain('canUseFileSystem');
    }
  });

  it('falls back to web for an invalid/unrecognized surface value rather than throwing', async () => {
    const res = await GET(makeGetRequest('surface=not_a_real_surface'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = MeResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.capability_handshake?.sources.surface).toBe('surface:web');
    }
  });
});
