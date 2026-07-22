import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getClerkAuthUser: vi.fn(),
  getSubscription: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: mocks.withRateLimit,
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mocks.getClerkAuthUser,
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: mocks.getSubscription,
  },
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(() => null),
}));

import { runAuthGate } from './auth-gate';

function makeRequest() {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer verified-token',
      'x-agi-surface': 'web',
      'x-real-ip': '203.0.113.10',
    },
  });
}

describe('runAuthGate rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-123' });
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'active',
      plan_tier: 'basic',
    });
  });

  it('uses a broad IP abuse bucket and a separate verified-user chat bucket', async () => {
    const request = makeRequest();

    const result = await runAuthGate(request);

    expect(result.ok).toBe(true);
    expect(mocks.withRateLimit).toHaveBeenNthCalledWith(1, request, 'llm-completion-ip');
    expect(mocks.withRateLimit).toHaveBeenNthCalledWith(
      2,
      request,
      'llm-completion',
      'user:user-123',
    );
  });
});
