/**
 * Cross-surface contract test: /api/llm/v1/chat/completions auth gate.
 *
 * After sec-launch1 + web-launch2's RLS migrations, this route MUST reject any
 * caller that cannot present a valid Bearer token. The auth-gate at
 * `app/api/llm/v1/chat/completions/lib/auth-gate.ts:45-87` enforces this in
 * two distinct steps:
 *
 *   1. Missing/invalid `Authorization: Bearer …` header → 401
 *      (invalid_api_key, "Missing or invalid authorization header")
 *
 *   2. Header present but JWT verification fails inside
 *      `getAuthenticatedUserWithClient` → 401
 *      (invalid_api_key, "Invalid authentication token")
 *
 * The team-lead spec mentions "cookie"; this route is Bearer-only by design
 * (auth-gate.ts:42-46 explicitly rejects cookie-style requests up front), so
 * the "forged cookie" case is realised here as a forged Bearer token whose
 * Supabase JWT verification fails. Either way the contract is: no valid auth
 * → HTTP 401.
 *
 * The route's downstream dependencies (rate-limit, CSRF, subscription, credit
 * service, LLM provider factory) are all mocked at the boundary so this test
 * focuses on the auth contract only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Boundary mocks (hoisted before route import) ─────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
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
}));

vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((k: string) => `mock-${k}`),
}));

// The auth gate calls `getAuthenticatedUserWithClient` from `@/lib/api-auth`.
// We control its behavior per-test to simulate "valid JWT" vs "forged JWT".
const mockGetAuthenticatedUserWithClient = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUserWithClient: (...args: unknown[]) =>
    mockGetAuthenticatedUserWithClient(...args),
  getAuthenticatedUser: vi.fn(),
}));

// Subscription / credit / LLM factory mocks — guards beyond auth that must
// not be reached when auth fails. We assert they were NOT called in each test.
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

// Route under test — must be imported AFTER all vi.mock() calls
import { POST } from '@/app/api/llm/v1/chat/completions/route';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model: 'auto-balanced',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
    }),
  });
}

type AuthErrorBody = {
  error?: { message?: string; type?: string; code?: string };
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/llm/v1/chat/completions — auth contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects request with no Authorization header → 401', async () => {
    // No auth header at all — auth-gate trips at line 46 before any JWT lookup.
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);

    const body = (await response.json()) as AuthErrorBody;
    expect(body.error?.code).toBe('invalid_api_key');
    expect(body.error?.message).toMatch(/authorization header/i);

    // Auth gate must short-circuit before reaching downstream services.
    expect(mockGetAuthenticatedUserWithClient).not.toHaveBeenCalled();
    expect(mockGetSubscription).not.toHaveBeenCalled();
    expect(mockCheckAvailable).not.toHaveBeenCalled();
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('rejects request whose Authorization is not Bearer-prefixed → 401', async () => {
    // Wrong scheme — auth-gate.ts:46 requires "Bearer " prefix specifically.
    const response = await POST(makeRequest({ Authorization: 'Basic dXNlcjpwYXNz' }));

    expect(response.status).toBe(401);
    const body = (await response.json()) as AuthErrorBody;
    expect(body.error?.code).toBe('invalid_api_key');
    expect(body.error?.message).toMatch(/authorization header/i);
    expect(mockGetAuthenticatedUserWithClient).not.toHaveBeenCalled();
  });

  it('rejects request with a forged/invalid Bearer JWT → 401', async () => {
    // Bearer token present, but Supabase JWT verification throws inside
    // getAuthenticatedUserWithClient — auth-gate.ts:73-87 maps that to 401.
    mockGetAuthenticatedUserWithClient.mockRejectedValueOnce(
      new Error('JWT signature verification failed'),
    );

    const response = await POST(
      makeRequest({
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmb3JnZWQifQ.invalid-signature-here',
      }),
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as AuthErrorBody;
    expect(body.error?.code).toBe('invalid_api_key');
    expect(body.error?.message).toMatch(/invalid authentication token/i);

    // JWT verification was attempted, but no downstream service was reached.
    expect(mockGetAuthenticatedUserWithClient).toHaveBeenCalledTimes(1);
    expect(mockGetSubscription).not.toHaveBeenCalled();
    expect(mockCheckAvailable).not.toHaveBeenCalled();
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('rejects an empty Bearer token → 401', async () => {
    // "Bearer " (trailing space, no token) — getAuthenticatedUserWithClient
    // should reject the empty token. We mock the rejection to assert the
    // route's contract (route translates the error to 401 invalid_api_key).
    mockGetAuthenticatedUserWithClient.mockRejectedValueOnce(new Error('Invalid token'));

    const response = await POST(makeRequest({ Authorization: 'Bearer ' }));

    expect(response.status).toBe(401);
    const body = (await response.json()) as AuthErrorBody;
    expect(body.error?.code).toBe('invalid_api_key');
  });
});
