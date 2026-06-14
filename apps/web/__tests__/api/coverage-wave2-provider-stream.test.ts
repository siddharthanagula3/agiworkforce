/**
 * Unit tests: POST /api/v1/providers/[providerId]/stream
 *
 * Coverage targets:
 * - RT-01 allowlist: unlisted providerId returns 400 before any upstream call
 * - Credit pre-charge ordering: checkAvailable called before upstream fetch
 * - Upstream 4xx forwarded correctly (refund issued, status mirrored)
 * - Happy-path: stream response pipes through with SSE headers
 * - Unauthenticated request returns 401
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Boundary mocks (must be declared before route import) ────────────────────

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/utils/env', () => ({
  getEnv: vi.fn((key: string, fallback?: string) => {
    if (key === 'API_GATEWAY_URL') return 'http://localhost:3001';
    return fallback ?? '';
  }),
}));

// Rate limit: always pass through
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

// Auth mock — controlled per test
const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

// DB mock
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({})),
}));

// CreditService mock — controlled per test
const mockCheckAvailable = vi.fn();
const mockDeductCredits = vi.fn();
const mockGenerateIdempotencyKey = vi.fn(() => 'idempotency-key-abc');

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    checkAvailable: (...args: unknown[]) => mockCheckAvailable(...args),
    deductCredits: (...args: unknown[]) => mockDeductCredits(...args),
    generateIdempotencyKey: (...args: Parameters<typeof mockGenerateIdempotencyKey>) =>
      mockGenerateIdempotencyKey(...args),
  },
}));

// createError stub (imported but not directly invoked in the success path)
vi.mock('@/lib/errors', () => ({
  createError: vi.fn(),
}));

// Route under test — imported AFTER all vi.mock() calls
import { POST } from '@/app/api/v1/providers/[providerId]/stream/route';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(providerId: string, body?: object): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/providers/${encodeURIComponent(providerId)}/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify(
        body ?? {
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Hello' }],
        },
      ),
    },
  );
}

function makeParams(providerId: string): { params: Promise<{ providerId: string }> } {
  return { params: Promise.resolve({ providerId }) };
}

function makeSseStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"content_block_delta"}\n\n'));
      controller.close();
    },
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('POST /api/v1/providers/[providerId]/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['AGI_MANAGED_COMPUTE_PRIVATE_BETA'] = '1';
    // Default: authenticated user
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc-123' });
    // Default: credits available
    mockCheckAvailable.mockResolvedValue(true);
    // Default: deduct succeeds
    mockDeductCredits.mockResolvedValue({ success: true, balance: 99 });
  });

  // ── 1. Unauthenticated request → 401 ──────────────────────────────────────

  it('returns 401 when getClerkAuthUser throws (unauthenticated)', async () => {
    const appError = Object.assign(new Error('Missing auth'), { statusCode: 401 });
    mockGetClerkAuthUser.mockRejectedValueOnce(appError);

    const request = makeRequest('anthropic');
    const response = await POST(request, makeParams('anthropic'));

    expect(response.status).toBe(401);
    // Credit check must never be reached
    expect(mockCheckAvailable).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  // ── 2. RT-01 allowlist: unlisted providerId → 400 ─────────────────────────

  it('returns 400 for an unlisted providerId (RT-01 allowlist guard)', async () => {
    const badProviders = [
      'unknown-provider',
      '../../../etc/passwd',
      'aws-bedrock',
      'azure',
      '',
      '.',
    ];

    for (const badId of badProviders) {
      vi.clearAllMocks();
      mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc-123' });

      const request = makeRequest(badId);
      const response = await POST(request, makeParams(badId));

      expect(response.status, `Expected 400 for providerId="${badId}"`).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toMatch(/invalid provider/i);

      // Upstream fetch must never be called for disallowed providers
      expect(mockCheckAvailable).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
    }
  });

  // ── 3. Credit pre-charge happens before upstream fetch ────────────────────

  it('calls checkAvailable then deductCredits before forwarding to upstream', async () => {
    const callOrder: string[] = [];

    mockCheckAvailable.mockImplementation(() => {
      callOrder.push('checkAvailable');
      return Promise.resolve(true);
    });

    mockDeductCredits.mockImplementation(() => {
      callOrder.push('deductCredits');
      return Promise.resolve({ success: true });
    });

    // Mock fetch — called AFTER credit deduction
    const mockFetch = vi.fn().mockImplementation(() => {
      callOrder.push('fetch');
      return Promise.resolve(
        new Response(makeSseStream(), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );
    });

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      const request = makeRequest('anthropic');
      const response = await POST(request, makeParams('anthropic'));

      expect(response.status).toBe(200);
      // Order must be: check → deduct → fetch
      expect(callOrder).toEqual(['checkAvailable', 'deductCredits', 'fetch']);
      expect(mockDeductCredits.mock.calls[0]?.[4]).toEqual(
        expect.objectContaining({ provider: 'anthropic', model: 'claude-sonnet-4-6' }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ── 4. Insufficient credits → 402, upstream fetch not called ─────────────

  it('returns 402 when checkAvailable returns false (insufficient credits)', async () => {
    mockCheckAvailable.mockResolvedValue(false);

    const mockFetch = vi.fn();
    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      const request = makeRequest('openai');
      const response = await POST(request, makeParams('openai'));

      expect(response.status).toBe(402);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe('insufficient_credits');

      // Upstream must not be called when credits are insufficient
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('blocks managed compute before checking credits when private beta is disabled', async () => {
    process.env['AGI_MANAGED_COMPUTE_PRIVATE_BETA'] = '0';

    const mockFetch = vi.fn();
    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      const request = makeRequest('openai');
      const response = await POST(request, makeParams('openai'));
      const body = (await response.json()) as {
        error: { code: string };
        managed_compute: { allowed: boolean; provider: string; model: string };
      };

      expect(response.status).toBe(403);
      expect(body.error.code).toBe('public_launch_blocked');
      expect(body.managed_compute.allowed).toBe(false);
      expect(body.managed_compute.provider).toBe('openai');
      expect(mockCheckAvailable).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ── 5. Upstream 4xx is forwarded and credits are refunded ─────────────────

  it('forwards upstream 4xx status, sanitizes raw errors, and refunds credits', async () => {
    // upstream returns 422
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'model not found' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      const request = makeRequest('google');
      const response = await POST(request, makeParams('google'));

      // Status mirrors upstream
      expect(response.status).toBe(422);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe('Upstream error 422');
      expect(body.error).not.toContain('model not found');

      // deductCredits must have been called twice:
      //   1st: positive amount (pre-charge)
      //   2nd: negative amount (refund)
      expect(mockDeductCredits).toHaveBeenCalledTimes(2);
      const [, secondCall] = mockDeductCredits.mock.calls;
      // second call amount is negative (refund)
      const refundAmount = secondCall?.[2] as number;
      expect(refundAmount).toBeLessThan(0);
      expect(secondCall?.[4]).toEqual(
        expect.objectContaining({ provider: 'google', model: 'claude-sonnet-4-6' }),
      );
      expect(secondCall?.[5]).toBe('idempotency-key-abc');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ── 6. Happy path: SSE stream pipes through with correct headers ──────────

  it('streams response with text/event-stream header on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(makeSseStream(), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      const request = makeRequest('anthropic');
      const response = await POST(request, makeParams('anthropic'));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.headers.get('cache-control')).toMatch(/no-cache/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ── 7. All canonical allowlisted providers are accepted ──────────────────

  it('accepts all known canonical provider IDs from the allowlist', async () => {
    const knownProviders = [
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

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(makeSseStream(), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      for (const pid of knownProviders) {
        vi.clearAllMocks();
        mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc-123' });
        mockCheckAvailable.mockResolvedValue(true);
        mockDeductCredits.mockResolvedValue({ success: true });

        const request = makeRequest(pid);
        const response = await POST(request, makeParams(pid));

        expect(response.status, `Expected 200 for allowed provider="${pid}"`).toBe(200);
      }
    } finally {
      global.fetch = originalFetch;
    }
  });
});
