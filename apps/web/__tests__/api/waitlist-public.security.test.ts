/**
 * Threat model: POST /api/waitlist/public must:
 * - Reject requests without a valid CSRF token (403) before touching the DB
 * - Return 429 when the 'waitlist' rate limiter signals exceeded
 * - Reject malformed or missing email with 400
 * - Work WITHOUT a signed-in user (anonymous marketing-site capture) and
 *   persist a null user_id in that case
 * - Attach the Clerk user id when a session exists
 * - Fail closed when storage is unavailable, and NOT leak internal state
 *   (table name, database errors, stack traces) in responses
 *
 * Storage contract:
 * - Normalized email is persisted to cloud_managed_waitlist because launch
 *   operations must be able to send invite/release emails.
 * - user_id is nullable for explicitly anonymous records (migration 0034).
 * - Rate limit uses the dedicated 'waitlist' config, not 'default'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// ─── Baseline mocks ───────────────────────────────────────────────────────────
vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/error-handler', async () => {
  const actual = await vi.importActual<typeof import('@/lib/error-handler')>('@/lib/error-handler');
  return actual;
});

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
}));

// ─── CSRF mock — exported so per-test overrides work ─────────────────────────
const mockRequireCsrfToken = vi.fn();
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (...args: unknown[]) => mockRequireCsrfToken(...args),
  generateCsrfToken: vi.fn(() => 'valid-token'),
  verifyCsrfToken: vi.fn(() => true),
  getSessionIdFromRequest: vi.fn(() => Promise.resolve('session-123')),
}));

// ─── Rate-limit mock ──────────────────────────────────────────────────────────
const mockWithRateLimit = vi.fn().mockResolvedValue(null);
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...args),
}));

// ─── Neon DB mock ─────────────────────────────────────────────────────────────
const mockExecute = vi.fn().mockResolvedValue(1);
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: vi.fn().mockResolvedValue([]),
    execute: mockExecute,
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

// ─── Clerk auth mock — OPTIONAL identity, default anonymous ──────────────────
const mockAuth = vi.fn().mockResolvedValue({ userId: null });
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

// ─── Import route under test ──────────────────────────────────────────────────
import { POST, OPTIONS } from '@/app/api/waitlist/public/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makePostRequest(body: unknown, extra?: RequestInit['headers']): NextRequest {
  return new NextRequest('http://localhost/api/waitlist/public', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': 'valid-csrf-token-value',
      ...extra,
    },
    body: JSON.stringify(body),
  });
}

function csrfBlockedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Invalid or missing CSRF token', code: 'CSRF_VALIDATION_FAILED' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  );
}

function rateLimitExceededResponse(): NextResponse {
  return NextResponse.json(
    { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
    { status: 429 },
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('POST /api/waitlist/public — security tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: CSRF passes, rate limit passes, execute succeeds, anonymous user
    mockRequireCsrfToken.mockResolvedValue(null);
    mockWithRateLimit.mockResolvedValue(null);
    mockExecute.mockResolvedValue(1);
    mockAuth.mockResolvedValue({ userId: null });
  });

  // ─── CSRF protection ────────────────────────────────────────────────────────
  describe('(a) CSRF enforcement', () => {
    it('returns 403 with CSRF_VALIDATION_FAILED when CSRF token is missing', async () => {
      mockRequireCsrfToken.mockResolvedValueOnce(csrfBlockedResponse());

      const request = new NextRequest('http://localhost/api/waitlist/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', source: 'website' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('calls requireCsrfToken before any DB operation', async () => {
      mockRequireCsrfToken.mockResolvedValueOnce(csrfBlockedResponse());

      const request = makePostRequest({ email: 'test@example.com', source: 'website' });
      await POST(request);

      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('proceeds when CSRF token is valid', async () => {
      const request = makePostRequest({ email: 'test@example.com', source: 'website' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.joined).toBe(true);
    });
  });

  // ─── Rate limiting ──────────────────────────────────────────────────────────
  describe('(b) Rate limit enforcement', () => {
    it("uses the dedicated 'waitlist' rate limit config", async () => {
      const request = makePostRequest({ email: 'test@example.com' });
      await POST(request);

      expect(mockWithRateLimit).toHaveBeenCalledWith(expect.anything(), 'waitlist');
    });

    it('returns 429 when rate limiter signals exceeded, before any DB call', async () => {
      mockWithRateLimit.mockResolvedValueOnce(rateLimitExceededResponse());

      const request = makePostRequest({ email: 'test@example.com', source: 'website' });
      const response = await POST(request);

      expect(response.status).toBe(429);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  // ─── Anonymous capture (the point of this route) ───────────────────────────
  describe('(c) Anonymous capture', () => {
    it('accepts a signup with NO signed-in user and stores a null user_id', async () => {
      mockAuth.mockResolvedValueOnce({ userId: null });

      const request = makePostRequest({ email: 'Visitor@Example.com', source: 'website' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockExecute).toHaveBeenCalledTimes(1);

      const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(params[0]).toBeNull(); // user_id
      expect(params[1]).toBe('visitor@example.com'); // normalized email
      expect(params[2]).toBe('website'); // source
    });

    it('still works when auth() throws (no Clerk middleware context)', async () => {
      mockAuth.mockRejectedValueOnce(new Error('Clerk: auth() called outside middleware'));

      const request = makePostRequest({ email: 'visitor@example.com' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(params[0]).toBeNull();
    });

    it('attaches the Clerk user id when a session exists', async () => {
      mockAuth.mockResolvedValueOnce({ userId: 'user_clerk_123' });

      const request = makePostRequest({ email: 'member@example.com', source: 'billing' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(params[0]).toBe('user_clerk_123');
    });

    it('upsert preserves an existing user_id on conflict (coalesce)', async () => {
      const request = makePostRequest({ email: 'repeat@example.com', source: 'website' });
      await POST(request);

      const [sql] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('on conflict (email, source)');
      expect(sql).toContain('coalesce(excluded.user_id, cloud_managed_waitlist.user_id)');
    });
  });

  // ─── Input validation ───────────────────────────────────────────────────────
  describe('(d) Input validation', () => {
    it('rejects a missing email with 400', async () => {
      const request = makePostRequest({ source: 'website' });
      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it.each(['not-an-email', 'a@b', 'spaces in@email.com', '', 42, null, { e: 1 }])(
      'rejects malformed email %p with 400',
      async (bad) => {
        const request = makePostRequest({ email: bad, source: 'website' });
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(mockExecute).not.toHaveBeenCalled();
      },
    );

    it('rejects an email longer than 254 chars', async () => {
      const longEmail = `${'a'.repeat(250)}@example.com`;
      const request = makePostRequest({ email: longEmail });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('rejects a non-JSON body with 400', async () => {
      const request = new NextRequest('http://localhost/api/waitlist/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': 'valid-csrf-token-value',
        },
        body: 'not json at all',
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("defaults an unknown source to 'website' instead of erroring", async () => {
      const request = makePostRequest({ email: 'test@example.com', source: 'sneaky-source' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(params[2]).toBe('website');
    });

    it('accepts every allow-listed source verbatim', async () => {
      for (const source of ['website', 'byok', 'sync', 'billing', 'mobile', 'other']) {
        mockExecute.mockClear();
        const request = makePostRequest({ email: 'test@example.com', source });
        const response = await POST(request);

        expect(response.status).toBe(200);
        const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
        expect(params[2]).toBe(source);
      }
    });
  });

  // ─── Fail-closed storage / no internal leakage ──────────────────────────────
  describe('(e) Fail-closed storage', () => {
    it('returns 5xx (not success) when the table is missing (42P01)', async () => {
      mockExecute.mockRejectedValueOnce(
        Object.assign(new Error('relation missing'), {
          code: '42P01',
        }),
      );

      const request = makePostRequest({ email: 'test@example.com' });
      const response = await POST(request);

      expect(response.status).toBeGreaterThanOrEqual(500);
      const body = await response.text();
      expect(body).not.toContain('cloud_managed_waitlist');
      expect(body).not.toContain('42P01');
    });

    it('returns 5xx (not success) when the DB is unreachable', async () => {
      mockExecute.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

      const request = makePostRequest({ email: 'test@example.com' });
      const response = await POST(request);

      expect(response.status).toBeGreaterThanOrEqual(500);
      const body = await response.text();
      expect(body).not.toContain('ECONNREFUSED');
      expect(body).not.toContain('127.0.0.1');
    });

    it('never acknowledges a signup that was not durably stored', async () => {
      mockExecute.mockRejectedValueOnce(new Error('boom'));

      const request = makePostRequest({ email: 'test@example.com' });
      const response = await POST(request);
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };

      expect(data.ok).not.toBe(true);
    });
  });

  // ─── CORS preflight ─────────────────────────────────────────────────────────
  describe('(f) OPTIONS preflight', () => {
    it('returns 204 for preflight when CORS handler passes', async () => {
      const request = new NextRequest('http://localhost/api/waitlist/public', {
        method: 'OPTIONS',
      });
      const response = await OPTIONS(request);
      expect(response.status).toBe(204);
    });
  });
});
