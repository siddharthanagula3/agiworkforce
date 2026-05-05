/**
 * RT-01: Unauthenticated /api/v1/providers/:id/stream = SSRF + free LLM
 *
 * Tests that the stream endpoint requires valid auth, validates providerId,
 * validates body, checks credits, and deducts them on success.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

// ─── Auth mock ────────────────────────────────────────────────────────────────
const mockGetAuthenticatedUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (...args: unknown[]) => mockGetAuthenticatedUser(...args),
}));

// ─── Rate limit mock ──────────────────────────────────────────────────────────
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
  rateLimitConfigs: {},
}));

// ─── Credit service mock ──────────────────────────────────────────────────────
const mockCheckAvailable = vi.fn();
const mockDeductCredits = vi.fn();
const mockGenerateIdempotencyKey = vi.fn().mockReturnValue('idem-key-123');
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    checkAvailable: (...args: unknown[]) => mockCheckAvailable(...args),
    deductCredits: (...args: unknown[]) => mockDeductCredits(...args),
    generateIdempotencyKey: (...args: unknown[]) => mockGenerateIdempotencyKey(...args),
  },
}));

// ─── Logger mock ──────────────────────────────────────────────────────────────
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/errors', () => ({
  createError: {
    unauthorized: (msg?: string) => {
      const e = new Error(msg ?? 'Unauthorized') as Error & { statusCode: number };
      e.statusCode = 401;
      return e;
    },
  },
}));

vi.mock('@/utils/env', () => ({
  getEnv: (key: string, fallback?: string) => {
    if (key === 'API_GATEWAY_URL') return 'http://localhost:3000';
    return fallback ?? '';
  },
  requireEnv: (key: string) => {
    const map: Record<string, string> = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    };
    return map[key] ?? '';
  },
}));

// ─── Fetch mock ───────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Route under test ─────────────────────────────────────────────────────────
import { POST } from '@/app/api/v1/providers/[providerId]/stream/route';

function makeRequest(
  providerId: string,
  body: unknown,
  authHeader?: string,
): { req: NextRequest; params: Promise<{ providerId: string }> } {
  const req = new NextRequest('http://localhost/api/v1/providers/' + providerId + '/stream', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authHeader ? { authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });
  return { req, params: Promise.resolve({ providerId }) };
}

const VALID_BODY = {
  model: 'claude-opus-4-7',
  messages: [{ role: 'user', content: 'hello' }],
};

describe('RT-01: /api/v1/providers/[providerId]/stream authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // NODE_ENV is read-only in TypeScript but we can mutate via index access
    (process.env as Record<string, string>)['NODE_ENV'] = 'test';
    // Default: authenticated user with credits
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'user-123', email: 'user@example.com' });
    mockCheckAvailable.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 900 });
    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
      status: 200,
    });
  });

  it('returns 401 when no authorization header is present', async () => {
    mockGetAuthenticatedUser.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const { req, params } = makeRequest('anthropic', VALID_BODY);
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });

  it('returns 401 when Bearer token is expired/invalid', async () => {
    mockGetAuthenticatedUser.mockRejectedValue(
      Object.assign(new Error('Invalid token'), { statusCode: 401 }),
    );
    const { req, params } = makeRequest('anthropic', VALID_BODY, 'Bearer expired.jwt.token');
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });

  it('returns 400 when providerId is a path traversal string', async () => {
    const { req, params } = makeRequest('../../../etc/passwd', VALID_BODY, 'Bearer valid.jwt');
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid provider/i);
  });

  it('returns 400 when providerId is not in the allowlist', async () => {
    const { req, params } = makeRequest('evil-provider', VALID_BODY, 'Bearer valid.jwt');
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing messages', async () => {
    const { req, params } = makeRequest(
      'anthropic',
      { model: 'claude-opus-4-7' },
      'Bearer valid.jwt',
    );
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid request body/i);
  });

  it('returns 400 when body is missing model', async () => {
    const { req, params } = makeRequest(
      'anthropic',
      { messages: [{ role: 'user', content: 'hello' }] },
      'Bearer valid.jwt',
    );
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it('returns 402 when user has no credits', async () => {
    mockCheckAvailable.mockResolvedValue(false);
    const { req, params } = makeRequest('anthropic', VALID_BODY, 'Bearer valid.jwt');
    const res = await POST(req, { params });
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.error).toBe('insufficient_credits');
  });

  it('returns 402 when credit deduction fails', async () => {
    mockCheckAvailable.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue({ success: false, error: 'limit reached' });
    const { req, params } = makeRequest('anthropic', VALID_BODY, 'Bearer valid.jwt');
    const res = await POST(req, { params });
    expect(res.status).toBe(402);
  });

  it('returns 200 and streams when auth valid, credits available, provider valid', async () => {
    const { req, params } = makeRequest('anthropic', VALID_BODY, 'Bearer valid.jwt');
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    // Credits should have been deducted
    expect(mockDeductCredits).toHaveBeenCalledOnce();
  });

  it('refunds credits when upstream returns an error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      body: new ReadableStream(),
      text: async () => 'service unavailable',
    });
    const { req, params } = makeRequest('anthropic', VALID_BODY, 'Bearer valid.jwt');
    await POST(req, { params });
    // Should have called deductCredits twice: once to charge, once to refund
    expect(mockDeductCredits).toHaveBeenCalledTimes(2);
    // Second call should be a negative amount (refund)
    const secondCall = mockDeductCredits.mock.calls[1] as unknown[];
    expect(secondCall[1] as number).toBeLessThan(0);
  });

  it('refunds credits when upstream fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('connection refused'));
    const { req, params } = makeRequest('anthropic', VALID_BODY, 'Bearer valid.jwt');
    const res = await POST(req, { params });
    expect(res.status).toBe(502);
    expect(mockDeductCredits).toHaveBeenCalledTimes(2);
  });

  it('accepts all valid provider IDs in allowlist', async () => {
    const validProviders = [
      'anthropic',
      'openai',
      'google',
      'xai',
      'deepseek',
      'perplexity',
      'qwen',
      'moonshot',
      'zhipu',
      'ollama',
      'lmstudio',
    ];
    for (const providerId of validProviders) {
      vi.clearAllMocks();
      mockGetAuthenticatedUser.mockResolvedValue({ id: 'user-123' });
      mockCheckAvailable.mockResolvedValue(true);
      mockDeductCredits.mockResolvedValue({ success: true });
      mockFetch.mockResolvedValue({ ok: true, body: new ReadableStream(), status: 200 });
      const { req, params } = makeRequest(providerId, VALID_BODY, 'Bearer valid.jwt');
      const res = await POST(req, { params });
      expect(res.status).toBe(200);
    }
  });
});
