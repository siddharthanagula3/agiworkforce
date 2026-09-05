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

import { GET } from './route';
import { ApiKeyScopeError } from '@/lib/api-key-scope-error';
import { listCanonicalModels } from '@agiworkforce/types';

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
