import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
  withRateLimit: vi.fn(),
  listRecentRolloutBenchmarks: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  getClerkAuthUser: mocks.getClerkAuthUser,
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityAuthorizedParties: vi.fn(),
  getIdentityProvider: vi.fn(),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
  getIdentityUser: vi.fn(),
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
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/routing')>()),
  observedHealthRankingEnabled: () => true,
  canaryRoutingEnabled: () => false,
  shadowMirroringEnabled: () => true,
}));
vi.mock('@/lib/services/model-rollout/rollout-evaluation-service', () => ({
  DEFAULT_ROLLOUT_EVALUATION_CONFIG: vi.fn(),
  ROLLOUT_EVALUATION_ENV: vi.fn(),
  detectRolloutAlerts: vi.fn(),
  purgeExpiredRoutingTraces: vi.fn(),
  readCohortMetrics: vi.fn(),
  recordRolloutBenchmarks: vi.fn(),
  resolveRolloutEvaluationConfig: vi.fn(),
  listRecentRolloutBenchmarks: mocks.listRecentRolloutBenchmarks,
}));

import { modelRegistry } from '@agiworkforce/model-registry';
import { createError } from '@/lib/errors';
import { GET } from '../route';

const OPERATOR = 'operator_1';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/admin/model-rollout');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_PLATFORM_ADMIN_USER_IDS', OPERATOR);
  mocks.getClerkAuthUser.mockResolvedValue({ userId: OPERATOR });
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.listRecentRolloutBenchmarks.mockResolvedValue([{ id: 'bench-1' }]);
});

describe('GET /api/admin/model-rollout', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.listRecentRolloutBenchmarks).not.toHaveBeenCalled();
  });

  it('answers 404 to a signed-in user who is not a platform operator', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'org_owner_1' });

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.listRecentRolloutBenchmarks).not.toHaveBeenCalled();
  });

  it('answers 404 to everyone when the operator allowlist is unset', async () => {
    vi.stubEnv('AGI_PLATFORM_ADMIN_USER_IDS', '');

    const response = await GET(request());

    expect(response.status).toBe(404);
  });

  it('returns the rate limiter answer without authenticating', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
  });

  it('reports stages, only slots under rollout, and recent benchmarks', async () => {
    type Slot = {
      modelKey: string;
      canary?: { modelKey: string; trafficFraction: number };
      shadow?: { modelKey: string; dailyRequestCap: number };
    };
    const expectedSlots = Object.entries(modelRegistry.policies.auto.slots as Record<string, Slot>)
      .filter(([, slot]) => slot.canary !== undefined || slot.shadow !== undefined)
      .map(([slotId, slot]) => ({
        slotId,
        modelKey: slot.modelKey,
        canaryModelKey: slot.canary?.modelKey ?? null,
        canaryTrafficFraction: slot.canary?.trafficFraction ?? null,
        shadowModelKey: slot.shadow?.modelKey ?? null,
        shadowDailyRequestCap: slot.shadow?.dailyRequestCap ?? null,
      }));

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      stages: { observedHealth: true, canary: false, shadow: true },
      slots: expectedSlots,
      benchmarks: [{ id: 'bench-1' }],
    });
    expect(mocks.listRecentRolloutBenchmarks).toHaveBeenCalledWith(100);
  });
});
