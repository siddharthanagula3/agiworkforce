/**
 * POST /api/usage/deduct
 *
 * Covers:
 * - 401 when unauthenticated
 * - 400 for missing amount_cents
 * - 400 for negative amount_cents
 * - 400 for non-integer amount_cents
 * - 400 for invalid JSON body
 * - 403 when CreditService reports insufficient credits
 * - 200 with remaining_cents on success
 * - userId is taken from auth, never from the request body
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Environment stubs ────────────────────────────────────────────────────────
vi.stubEnv('CSRF_SECRET', 'test-csrf-secret-32-chars-minimum!!');

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  // withRateLimitHandler(handler, key) returns an async function with the same
  // signature as handler. In tests we bypass the rate-limit check entirely.
  withRateLimitHandler: (handler: (...args: unknown[]) => unknown, _key: string) => handler,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// CSRF: pass through in all tests
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(() => Promise.resolve(null)),
}));

// Clerk auth mock
const mockClerkAuth = vi.fn(() => Promise.resolve({ userId: 'user-auth-id' }));
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

// CreditService mock
const mockDeductCredits = vi.fn();
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    deductCredits: (...args: unknown[]) => mockDeductCredits(...args),
  },
}));

// Import route AFTER mocks
import { POST } from '@/app/api/usage/deduct/route';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/usage/deduct', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(rawBody: string): NextRequest {
  return new NextRequest('http://localhost/api/usage/deduct', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    },
    body: rawBody,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/usage/deduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkAuth.mockResolvedValue({ userId: 'user-auth-id' });
    mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 4500 });
  });

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockClerkAuth.mockRejectedValueOnce(new Error('Unauthorized'));

      const res = await POST(makeRequest({ amount_cents: 100 }));
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('userId is sourced from auth, not the request body', async () => {
      mockDeductCredits.mockResolvedValueOnce({ success: true, remaining_cents: 9000 });

      // Even if a malicious body includes a userId field, deductCredits must be
      // called with the auth-derived id, not the body-supplied one.
      await POST(makeRequest({ amount_cents: 100, userId: 'attacker-user-id' }));

      expect(mockDeductCredits).toHaveBeenCalledWith(
        'user-auth-id', // from auth, not body
        100,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe('input validation', () => {
    it('returns 400 when amount_cents is missing', async () => {
      const res = await POST(makeRequest({}));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when amount_cents is null', async () => {
      const res = await POST(makeRequest({ amount_cents: null }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when amount_cents is a string', async () => {
      const res = await POST(makeRequest({ amount_cents: '100' }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when amount_cents is negative', async () => {
      const res = await POST(makeRequest({ amount_cents: -50 }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when amount_cents is a float', async () => {
      const res = await POST(makeRequest({ amount_cents: 99.5 }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid JSON body', async () => {
      const res = await POST(makeRawRequest('{not: valid}'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts amount_cents = 0', async () => {
      mockDeductCredits.mockResolvedValueOnce({ success: true, remaining_cents: 5000 });

      const res = await POST(makeRequest({ amount_cents: 0 }));
      expect(res.status).toBe(200);
    });
  });

  describe('credit deduction', () => {
    it('returns 200 with remaining_cents on successful deduction', async () => {
      mockDeductCredits.mockResolvedValueOnce({ success: true, remaining_cents: 3900 });

      const res = await POST(makeRequest({ amount_cents: 100 }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.remaining_cents).toBe(3900);
    });

    it('forwards description, metadata, and idempotency_key to CreditService', async () => {
      mockDeductCredits.mockResolvedValueOnce({ success: true, remaining_cents: 2000 });

      await POST(
        makeRequest({
          amount_cents: 500,
          description: 'openai/gpt-4o usage',
          metadata: { provider: 'openai', model: 'gpt-4o' },
          idempotency_key: 'user-auth-id:session-1:openai:gpt-4o:100:200',
        }),
      );

      expect(mockDeductCredits).toHaveBeenCalledWith(
        'user-auth-id',
        500,
        'openai/gpt-4o usage',
        { provider: 'openai', model: 'gpt-4o' },
        'user-auth-id:session-1:openai:gpt-4o:100:200',
      );
    });

    it('returns 403 when CreditService reports insufficient credits', async () => {
      mockDeductCredits.mockResolvedValueOnce({
        success: false,
        code: 'INSUFFICIENT_CREDITS',
        error: 'Insufficient credits',
        available: 50,
        required: 100,
      });

      const res = await POST(makeRequest({ amount_cents: 100 }));
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when CreditService reports daily limit exceeded', async () => {
      mockDeductCredits.mockResolvedValueOnce({
        success: false,
        code: 'DAILY_LIMIT_EXCEEDED',
        error: 'Daily limit exceeded',
      });

      const res = await POST(makeRequest({ amount_cents: 100 }));

      expect(res.status).toBe(403);
    });

    it('returns 500 when CreditService returns generic failure', async () => {
      mockDeductCredits.mockResolvedValueOnce({
        success: false,
        error: 'Database connection error',
      });

      const res = await POST(makeRequest({ amount_cents: 100 }));
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('remaining_cents defaults to 0 when not returned by CreditService', async () => {
      mockDeductCredits.mockResolvedValueOnce({ success: true });

      const res = await POST(makeRequest({ amount_cents: 50 }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.remaining_cents).toBe(0);
    });
  });
});
