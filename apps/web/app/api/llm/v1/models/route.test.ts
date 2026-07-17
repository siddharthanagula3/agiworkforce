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
  getClerkAuthUser: vi.fn(),
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

  it('returns the authenticated subscription catalog for a valid credential', async () => {
    authMocks.getClerkAuthUser.mockResolvedValueOnce({ userId: 'user-1' });
    subscriptionMocks.getSubscription.mockResolvedValueOnce({ plan_tier: 'max' });

    const response = await GET(request({ Authorization: 'Bearer valid-token' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      object: 'list',
      x_agi_workforce: { user_tier: 'max' },
    });
    expect(subscriptionMocks.getSubscription).toHaveBeenCalledWith('user-1');
  });
});
