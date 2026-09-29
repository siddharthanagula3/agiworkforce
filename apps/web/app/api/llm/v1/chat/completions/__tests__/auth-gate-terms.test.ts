import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  getSubscription: vi.fn(),
  readTermsStanding: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: vi.fn(),
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  getClerkAuthUser: (...args: unknown[]) => mocks.getClerkAuthUser(...args),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mocks.getSubscription(...args),
  },
}));

vi.mock('@/lib/developer-api/project-spend', () => ({
  developerProjectSpendRefusal: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/server/terms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/terms')>()),
  readTermsStanding: (...args: unknown[]) => mocks.readTermsStanding(...args),
}));

vi.mock('@/lib/observability/metrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/observability/metrics')>()),
  recordFailure: (...args: unknown[]) => mocks.recordFailure(...args),
}));

import { CURRENT_TERMS_VERSION } from '@/lib/server/terms';
import { runAuthGate } from '../lib/auth-gate';

function request(surface: string, token = 'clerk-session-token'): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-agi-surface': surface },
  });
}

function subscription(planTier: string) {
  return {
    id: `sub-${planTier}`,
    user_id: 'user-1',
    plan_tier: planTier,
    status: 'active',
    current_period_start: new Date('2026-07-01T00:00:00Z'),
    current_period_end: new Date('2026-08-01T00:00:00Z'),
    stripe_subscription_id: null,
    stripe_price_id: null,
  };
}

describe('runAuthGate terms acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1', boundSurface: 'web' });
    mocks.getSubscription.mockResolvedValue(subscription('pro'));
    mocks.readTermsStanding.mockResolvedValue({ kind: 'current' });
  });

  it('admits an account on the current version without a notice', async () => {
    const result = await runAuthGate(request('web'));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.termsNotice).toBeUndefined();
  });

  it('admits an account on an older valid version and carries the notice', async () => {
    mocks.readTermsStanding.mockResolvedValue({
      kind: 'notice',
      acceptedVersion: '2026-01-01',
      requiredFrom: '2026-11-01T00:00:00.000Z',
    });

    const result = await runAuthGate(request('web'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.termsNotice).toEqual({
        'X-AGI-Terms-Notice': CURRENT_TERMS_VERSION,
        'X-AGI-Terms-Required-From': '2026-11-01T00:00:00.000Z',
      });
    }
  });

  it.each(['never_accepted', 'superseded'] as const)(
    'refuses a %s account with the acceptance link in the message',
    async (reason) => {
      mocks.readTermsStanding.mockResolvedValue({ kind: 'required', reason });

      const result = await runAuthGate(request('web'));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(403);
      const body = (await result.response.json()) as {
        error: { code: string; message: string; acceptance_url: string };
        acceptance_url: string;
        terms_version: string;
      };
      const link = 'https://agiworkforce.com/login/complete?redirectTo=%2Fchat';
      expect(body.error.code).toBe('terms_acceptance_required');
      expect(body.error.acceptance_url).toBe(link);
      expect(body.error.message).toContain(link);
      expect(body.acceptance_url).toBe(link);
      expect(body.terms_version).toBe(CURRENT_TERMS_VERSION);
    },
  );

  it('never checks terms for an API key caller', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1', apiKeyId: 'key-1' });
    mocks.readTermsStanding.mockResolvedValue({ kind: 'required', reason: 'never_accepted' });

    const result = await runAuthGate(request('api', 'sk_live_test-key'));

    expect(result.ok).toBe(true);
    expect(mocks.readTermsStanding).not.toHaveBeenCalled();
  });

  it('refuses the mobile app too, now that it can record an acceptance', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1', boundSurface: 'mobile' });
    mocks.readTermsStanding.mockResolvedValue({ kind: 'required', reason: 'never_accepted' });

    const result = await runAuthGate(request('mobile'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect((await result.response.json()).error.code).toBe('terms_acceptance_required');
    }
  });

  it('allows the turn, and counts it, when the acceptance cannot be read', async () => {
    mocks.readTermsStanding.mockRejectedValue(new Error('connection reset'));

    const result = await runAuthGate(request('web'));

    expect(result.ok).toBe(true);
    expect(mocks.recordFailure).toHaveBeenCalledWith('database', 'terms_acceptance_unreadable');
  });
});
