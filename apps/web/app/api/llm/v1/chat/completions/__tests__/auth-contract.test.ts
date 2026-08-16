
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const admitManagedTurnSlot = () => ({
  admitted: true,
  limit: null,
  active: 0,
  slot: { release: async () => {} },
});
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
  acquireManagedTurnSlot: vi.fn(async () => admitManagedTurnSlot()),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
  withCorsRoute: (handler: (...args: unknown[]) => unknown) => handler,
}));

vi.mock('@shared/utils/env', () => ({
  requireEnv: vi.fn((k: string) => `mock-${k}`),
}));

const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
  getAuthenticatedUser: vi.fn(),
}));

const mockGetSubscription = vi.fn();
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
    allocateCreditsForPeriod: vi.fn(),
  },
}));

const mockCheckAvailable = vi.fn();
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    checkAvailable: (...args: unknown[]) => mockCheckAvailable(...args),
    deductCredits: vi.fn(),
    getBalance: vi.fn(),
    generateIdempotencyKey: vi.fn(() => 'mock-idempotency-key'),
  },
}));

const mockSendRequest = vi.fn();
vi.mock('@/lib/llm-providers/factory', () => ({
  LLMProviderFactory: {
    getProviderFromModel: vi.fn(),
    sendRequest: (...args: unknown[]) => mockSendRequest(...args),
    streamRequest: vi.fn(),
  },
}));

import { POST } from '@/app/api/llm/v1/chat/completions/route';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agi-surface': 'web', ...headers },
    body: JSON.stringify({
      model: 'auto-balanced',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
    }),
  });
}

type AuthErrorBody = {
  error?: { message?: string; type?: string; code?: string; contract_version?: string };
};

describe('POST /api/llm/v1/chat/completions · auth contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects request with no Authorization header → 401', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);

    const body = (await response.json()) as AuthErrorBody;
    expect(body.error?.code).toBe('invalid_api_key');
    expect(body.error?.message).toMatch(/authorization header/i);

    expect(mockGetClerkAuthUser).not.toHaveBeenCalled();
    expect(mockGetSubscription).not.toHaveBeenCalled();
    expect(mockCheckAvailable).not.toHaveBeenCalled();
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('rejects request whose Authorization is not Bearer-prefixed → 401', async () => {
    const response = await POST(makeRequest({ Authorization: 'Basic dXNlcjpwYXNz' }));

    expect(response.status).toBe(401);
    const body = (await response.json()) as AuthErrorBody;
    expect(body.error?.code).toBe('invalid_api_key');
    expect(body.error?.message).toMatch(/authorization header/i);
    expect(mockGetClerkAuthUser).not.toHaveBeenCalled();
  });

  it('rejects request with a forged/invalid Bearer JWT → 401', async () => {
    mockGetClerkAuthUser.mockRejectedValueOnce(new Error('JWT signature verification failed'));

    const response = await POST(
      makeRequest({
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmb3JnZWQifQ.invalid-signature-here',
      }),
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as AuthErrorBody;
    expect(body.error?.code).toBe('invalid_api_key');
    expect(body.error?.message).toMatch(/invalid authentication token/i);

    expect(mockGetClerkAuthUser).toHaveBeenCalledTimes(1);
    expect(mockGetSubscription).not.toHaveBeenCalled();
    expect(mockCheckAvailable).not.toHaveBeenCalled();
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('rejects an empty Bearer token → 401', async () => {
    mockGetClerkAuthUser.mockRejectedValueOnce(new Error('Invalid token'));

    const response = await POST(makeRequest({ Authorization: 'Bearer ' }));

    expect(response.status).toBe(401);
    const body = (await response.json()) as AuthErrorBody;
    expect(body.error?.code).toBe('invalid_api_key');
  });

  it('rejects an authenticated managed request without an Idempotency-Key', async () => {
    mockGetClerkAuthUser.mockResolvedValueOnce({ userId: 'user-1', email: 'user@example.com' });
    mockGetSubscription.mockResolvedValueOnce({
      id: 'subscription-1',
      status: 'active',
      plan_tier: 'pro',
      stripe_price_id: 'price-pro',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const response = await POST(makeRequest({ Authorization: 'Bearer valid-token' }));

    expect(response.status).toBe(400);
    expect(response.headers.get('X-AGI-Chat-Contract-Version')).toBe('2026-07-15');
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'idempotency_key_required',
        contract_version: '2026-07-15',
      },
    });
    expect(mockCheckAvailable).not.toHaveBeenCalled();
    expect(mockSendRequest).not.toHaveBeenCalled();
  });
});
