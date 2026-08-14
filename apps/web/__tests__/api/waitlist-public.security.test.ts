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
// `query` now matters: the route writes the consent ledger through it before it
// touches `execute`, and `recordConsent` throws when the INSERT returns no row.
const mockExecute = vi.fn().mockResolvedValue(1);
const mockQuery = vi.fn();

function consentRowFor(purpose: string, granted: boolean) {
  return {
    purpose,
    granted,
    notice_version: '2026-08-11',
    surface: 'web-waitlist-inline',
    recorded_at: new Date('2026-08-13T00:00:00.000Z'),
  };
}

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: mockQuery,
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

/**
 * A decision for every purpose the waitlist form shows (DPDP s.6).
 *
 * The route refuses to store the address unless the required purpose comes back
 * granted, and refuses the request outright if any shown purpose is simply
 * missing — an absent purpose cannot be told apart from a client that dropped
 * the field, so it is not read as a refusal. Both purposes therefore appear
 * here, and `product_updates` is `false` on purpose: an unticked box is a
 * recorded decision, not an omission.
 */
const CONSENTED = [
  { purpose: 'enterprise_waitlist', granted: true },
  { purpose: 'product_updates', granted: false },
];

/**
 * Every request that expects to reach storage carries consent. Tests that
 * exercise the consent gate itself pass their own `consent` and override it.
 */
function makePostRequest(
  body: Record<string, unknown>,
  extra?: RequestInit['headers'],
): NextRequest {
  return new NextRequest('http://localhost/api/waitlist/public', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': 'valid-csrf-token-value',
      ...extra,
    },
    body: JSON.stringify({
      consent: CONSENTED,
      consentSurface: 'web-waitlist-inline',
      ...body,
    }),
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
    // The consent ledger INSERT returns the row it wrote; anything else makes
    // `recordConsent` throw, which is the fail-closed behaviour asserted below.
    mockQuery.mockImplementation((_sql: string, params: unknown[]) =>
      Promise.resolve([consentRowFor(String(params[2]), Boolean(params[3]))]),
    );
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

  // ─── DPDP consent gate ──────────────────────────────────────────────────────
  //
  // This route is the product's largest unconsented intake: a visitor's
  // plaintext email, no account, no prior relationship, stored indefinitely.
  // The Act makes that storable only against a purpose the person affirmatively
  // agreed to, so the gate below is the point of the endpoint, not decoration.
  describe('(g) consent (DPDP s.6)', () => {
    it('refuses to store the address when the required purpose is declined', async () => {
      const request = makePostRequest({
        email: 'test@example.com',
        consent: [
          { purpose: 'enterprise_waitlist', granted: false },
          { purpose: 'product_updates', granted: false },
        ],
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = (await response.json()) as { error?: { code?: string } };
      expect(data.error?.code).toBe('CONSENT_REQUIRED');
      // The whole point: nothing was written.
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('refuses the request when a shown purpose carries no decision at all', async () => {
      // An absent purpose is not a refusal — it cannot be told apart from a
      // client that dropped the field, so the request fails rather than
      // recording a decision nobody made.
      const request = makePostRequest({
        email: 'test@example.com',
        consent: [{ purpose: 'enterprise_waitlist', granted: true }],
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('refuses a request that carries no consent field whatsoever', async () => {
      const request = makePostRequest({ email: 'test@example.com', consent: undefined });

      const response = await POST(request);
      expect(response.status).toBe(400);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('rejects contradictory decisions for the same purpose', async () => {
      const request = makePostRequest({
        email: 'test@example.com',
        consent: [
          { purpose: 'enterprise_waitlist', granted: true },
          { purpose: 'enterprise_waitlist', granted: false },
          { purpose: 'product_updates', granted: false },
        ],
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('records BOTH the ticked and the unticked purpose before storing', async () => {
      const request = makePostRequest({ email: 'test@example.com' });
      const response = await POST(request);

      expect(response.status).toBe(200);

      const consentWrites = mockQuery.mock.calls.filter(([sql]) =>
        String(sql).includes('consent_records'),
      );
      expect(consentWrites).toHaveLength(2);

      const recorded = consentWrites.map(([, params]) => {
        const p = params as unknown[];
        return { purpose: p[2], granted: p[3] };
      });
      expect(recorded).toContainEqual({ purpose: 'enterprise_waitlist', granted: true });
      // A refusal is a row, not an absence — that distinction is the record.
      expect(recorded).toContainEqual({ purpose: 'product_updates', granted: false });
    });

    it('writes consent BEFORE the address, so a ledger failure stores nothing', async () => {
      mockQuery.mockRejectedValueOnce(new Error('ledger down'));

      const request = makePostRequest({ email: 'test@example.com' });
      const response = await POST(request);

      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(mockExecute).not.toHaveBeenCalled();

      const body = await response.text();
      expect(body).not.toContain('ledger down');
    });

    it('records anonymous consent against a hash, never the plaintext address', async () => {
      const request = makePostRequest({ email: 'Test@Example.com' });
      await POST(request);

      const consentWrites = mockQuery.mock.calls.filter(([sql]) =>
        String(sql).includes('consent_records'),
      );
      expect(consentWrites.length).toBeGreaterThan(0);

      for (const [, params] of consentWrites) {
        const p = params as unknown[];
        expect(p[0]).toBeNull(); // no user id — this visitor has no account
        expect(p[1]).toMatch(/^[a-f0-9]{64}$/); // sha256 of the normalised address
        expect(JSON.stringify(params)).not.toContain('Test@Example.com');
        expect(JSON.stringify(params)).not.toContain('test@example.com');
      }
    });

    it('attaches the account when one exists instead of hashing the address', async () => {
      mockAuth.mockResolvedValueOnce({ userId: 'user_abc' });

      const request = makePostRequest({ email: 'test@example.com' });
      await POST(request);

      const consentWrites = mockQuery.mock.calls.filter(([sql]) =>
        String(sql).includes('consent_records'),
      );
      for (const [, params] of consentWrites) {
        const p = params as unknown[];
        expect(p[0]).toBe('user_abc');
        expect(p[1]).toBeNull();
      }
    });

    it('ignores an invented purpose rather than writing a row nobody can describe', async () => {
      const request = makePostRequest({
        email: 'test@example.com',
        consent: [...CONSENTED, { purpose: 'sell_my_data', granted: true }],
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const consentWrites = mockQuery.mock.calls.filter(([sql]) =>
        String(sql).includes('consent_records'),
      );
      expect(consentWrites).toHaveLength(2);
      expect(JSON.stringify(consentWrites)).not.toContain('sell_my_data');
    });
  });
});
