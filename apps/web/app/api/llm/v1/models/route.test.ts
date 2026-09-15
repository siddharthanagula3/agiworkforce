import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/lib/cors', () => ({
  getCorsHeaders: vi.fn(() => ({})),
}));

const authMocks = vi.hoisted(() => ({
  db: { query: async () => [], execute: async () => 0 },
  getClerkAuthUser: vi.fn(),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async (...args: unknown[]) => {
    const { userId } = (await authMocks.getClerkAuthUser(...args)) as { userId: string };
    return { db: authMocks.db, userId, organizationId: null };
  },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: authMocks.getClerkAuthUser,
}));

const subscriptionMocks = vi.hoisted(() => ({
  getSubscription: vi.fn(),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: subscriptionMocks.getSubscription },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: () => ({}) }));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  listAvailableManagedProviderIds: () => everyRoutedProvider(),
}));
const availabilityMocks = vi.hoisted(() => ({
  getProviderAvailabilityMap: vi.fn(
    async (): Promise<Record<string, { state: 'degraded'; reason: string; until: string }>> => ({}),
  ),
}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  getProviderAvailabilityMap: availabilityMocks.getProviderAvailabilityMap,
}));
vi.mock('@/lib/server/free-pools', () => ({ freePoolDecisions: () => [] }));

import { GET } from './route';
function everyRoutedProvider(): Set<string> {
  const providers = new Set<string>();
  for (const model of listChatModels()) {
    for (const route of listManagedRoutesForModel(model.id)) providers.add(route.provider);
  }
  return providers;
}

import { ApiKeyScopeError } from '@/lib/api-key-scope-error';
import {
  listCanonicalModels,
  listChatModels,
  listManagedRoutesForModel,
} from '@agiworkforce/types';

const CONTEXTLESS_MEDIA_MODEL = (() => {
  const model = listCanonicalModels().find(
    (candidate) => candidate.modelType === 'video' && candidate.contextWindow === undefined,
  );
  if (!model) throw new Error('Canonical contextless media fixture is missing');
  return model.id;
})();

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('https://example.com/api/llm/v1/models', { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/llm/v1/models authentication downgrade boundary', () => {
  it('returns the public free catalog when no credential was presented', async () => {
    authMocks.getClerkAuthUser.mockRejectedValueOnce(new Error('No session'));

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      object: 'list',
      x_agi_workforce: { user_tier: 'free' },
    });
    expect(subscriptionMocks.getSubscription).not.toHaveBeenCalled();
  });

  it('returns 401 when a presented Authorization credential is invalid', async () => {
    authMocks.getClerkAuthUser.mockRejectedValueOnce(new Error('Invalid token'));

    const response = await GET(request({ Authorization: 'Bearer invalid-token' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    });
    expect(subscriptionMocks.getSubscription).not.toHaveBeenCalled();
  });

  it('returns 403 when a valid API key lacks model-read scope', async () => {
    authMocks.getClerkAuthUser.mockRejectedValueOnce(
      new ApiKeyScopeError('API key does not have the required scope'),
    );

    const response = await GET(request({ Authorization: 'Bearer scoped-key' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'insufficient_scope',
      },
    });
  });

  it('returns the authenticated subscription catalog for a valid credential', async () => {
    authMocks.getClerkAuthUser.mockResolvedValueOnce({ userId: 'user-1' });
    subscriptionMocks.getSubscription.mockResolvedValueOnce({
      plan_tier: 'max',
      status: 'active',
    });

    const response = await GET(request({ Authorization: 'Bearer valid-token' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      object: 'list',
      x_agi_workforce: { user_tier: 'max' },
    });
    expect(subscriptionMocks.getSubscription).toHaveBeenCalledWith(authMocks.db, 'user-1');
    expect(authMocks.getClerkAuthUser).toHaveBeenCalledWith(expect.any(NextRequest), {
      apiKeyScope: 'models:read',
    });
  });

  it('publishes only chat models with provider-backed token context limits', async () => {
    authMocks.getClerkAuthUser.mockResolvedValueOnce({ userId: 'user-1' });
    subscriptionMocks.getSubscription.mockResolvedValueOnce({
      plan_tier: 'max',
      status: 'active',
    });

    const response = await GET(request({ Authorization: 'Bearer valid-token' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.length).toBeGreaterThan(0);
    expect(payload.data).not.toContainEqual(
      expect.objectContaining({ id: CONTEXTLESS_MEDIA_MODEL }),
    );
    expect(
      payload.data.every(
        (model: { context_window: number }) =>
          Number.isFinite(model.context_window) && model.context_window > 0,
      ),
    ).toBe(true);
  });

  it.each(['canceled', 'past_due', 'unpaid', 'expired'])(
    'returns only the free catalog when a retained paid subscription is %s',
    async (status) => {
      authMocks.getClerkAuthUser.mockResolvedValueOnce({ userId: 'user-1' });
      subscriptionMocks.getSubscription.mockResolvedValueOnce({
        plan_tier: 'max',
        status,
      });

      const response = await GET(request({ Authorization: 'Bearer valid-token' }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        object: 'list',
        x_agi_workforce: { user_tier: 'free' },
      });
    },
  );

  it('withholds a model whose every route is degraded and names it in the metadata', async () => {
    const asMaxSubscriber = () => {
      authMocks.getClerkAuthUser.mockResolvedValueOnce({ userId: 'user-1' });
      subscriptionMocks.getSubscription.mockResolvedValueOnce({
        plan_tier: 'max',
        status: 'active',
      });
    };
    asMaxSubscriber();
    const offered = (
      (await (await GET(request({ Authorization: 'Bearer valid-token' }))).json()).data as Array<{
        id: string;
      }>
    ).map((model) => model.id);
    const withheld = offered.find((modelId) => {
      const routes = listManagedRoutesForModel(modelId);
      return routes.length > 0 && routes.every((route) => route.provider === routes[0]?.provider);
    });
    expect(withheld).toBeDefined();
    const soleProvider = listManagedRoutesForModel(withheld as string)[0]?.provider as string;
    availabilityMocks.getProviderAvailabilityMap.mockResolvedValueOnce({
      [soleProvider]: {
        state: 'degraded',
        reason: 'This provider is temporarily unavailable.',
        until: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    asMaxSubscriber();
    const payload = await (await GET(request({ Authorization: 'Bearer valid-token' }))).json();

    expect(payload.data.map((model: { id: string }) => model.id)).not.toContain(withheld);
    expect(payload.data.length).toBeGreaterThan(0);
    expect(payload.x_agi_workforce.temporarily_unavailable).toContain(withheld);
    expect(payload.x_agi_workforce.total_available).toBe(payload.data.length);
  });

  it('keeps a trialing subscription on its paid catalog', async () => {
    authMocks.getClerkAuthUser.mockResolvedValueOnce({ userId: 'user-1' });
    subscriptionMocks.getSubscription.mockResolvedValueOnce({
      plan_tier: 'max',
      status: 'trialing',
    });

    const response = await GET(request({ Authorization: 'Bearer valid-token' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      object: 'list',
      x_agi_workforce: { user_tier: 'max' },
    });
  });
});
