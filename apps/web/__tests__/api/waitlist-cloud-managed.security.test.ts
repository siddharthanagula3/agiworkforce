import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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

const mockRequireCsrfToken = vi.fn();
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (...args: unknown[]) => mockRequireCsrfToken(...args),
  generateCsrfToken: vi.fn(() => 'valid-token'),
  verifyCsrfToken: vi.fn(() => true),
  getSessionIdFromRequest: vi.fn(() => Promise.resolve('session-123')),
}));

const mockWithRateLimit = vi.fn().mockResolvedValue(null);
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...args),
}));

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

const mockRequireCurrentUserId = vi.fn().mockResolvedValue('user-test-id');
vi.mock('@/lib/server/neon-chat', () => ({
  requireCurrentUserId: () => mockRequireCurrentUserId(),
}));

import { POST, OPTIONS } from '@/app/api/waitlist/cloud-managed/route';

function makePostRequest(body: unknown, extra?: RequestInit['headers']): NextRequest {
  return new NextRequest('http://localhost/api/waitlist/cloud-managed', {
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

describe('POST /api/waitlist/cloud-managed, security tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCsrfToken.mockResolvedValue(null);
    mockWithRateLimit.mockResolvedValue(null);
    mockExecute.mockResolvedValue(1);
    mockRequireCurrentUserId.mockResolvedValue('user-test-id');
  });

  describe('(a) CSRF enforcement', () => {
    it('returns 403 with CSRF_VALIDATION_FAILED when CSRF token is missing', async () => {
      mockRequireCsrfToken.mockResolvedValueOnce(csrfBlockedResponse());

      const request = new NextRequest('http://localhost/api/waitlist/cloud-managed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', source: 'byok' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('returns 403 when CSRF token is invalid (expired/wrong signature)', async () => {
      mockRequireCsrfToken.mockResolvedValueOnce(csrfBlockedResponse());

      const request = makePostRequest(
        { email: 'test@example.com', source: 'byok' },
        { 'x-csrf-token': 'invalid-tampered-token' },
      );

      const response = await POST(request);
      expect(response.status).toBe(403);
    });

    it('calls requireCsrfToken before any DB operation', async () => {
      mockRequireCsrfToken.mockResolvedValueOnce(csrfBlockedResponse());

      const request = makePostRequest({ email: 'test@example.com', source: 'byok' });
      await POST(request);

      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('proceeds when CSRF token is valid', async () => {
      const request = makePostRequest({ email: 'test@example.com', source: 'byok' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
    });

    it('requires a signed-in user before durable insert', async () => {
      const { createError } = await import('@/lib/errors');
      mockRequireCurrentUserId.mockRejectedValueOnce(createError.unauthorized());

      const request = makePostRequest({ email: 'test@example.com', source: 'billing' });
      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('CSRF bypass via ?csrf=skip query param does not work', async () => {
      mockRequireCsrfToken.mockResolvedValueOnce(csrfBlockedResponse());

      const request = new NextRequest('http://localhost/api/waitlist/cloud-managed?csrf=skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', source: 'byok' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(403);
    });
  });

  describe('(b) Rate limit enforcement', () => {
    it('returns 429 when rate limiter signals exceeded', async () => {
      mockWithRateLimit.mockResolvedValueOnce(rateLimitExceededResponse());

      const request = makePostRequest({ email: 'test@example.com', source: 'byok' });
      const response = await POST(request);

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('429 response does not leak email or internal state', async () => {
      mockWithRateLimit.mockResolvedValueOnce(rateLimitExceededResponse());

      const request = makePostRequest({ email: 'secret@example.com', source: 'byok' });
      const response = await POST(request);
      const body = await response.text();

      expect(body).not.toContain('secret@example.com');
      expect(body).not.toContain('cloud_managed_waitlist');
      expect(body).not.toContain('cloudDb');
    });

    it('rate limit check runs after CSRF passes', async () => {
      mockRequireCsrfToken.mockResolvedValue(null);
      mockWithRateLimit.mockResolvedValueOnce(rateLimitExceededResponse());

      const request = makePostRequest({ email: 'test@example.com', source: 'byok' });
      await POST(request);

      expect(mockRequireCsrfToken).toHaveBeenCalledOnce();
      expect(mockWithRateLimit).toHaveBeenCalledOnce();
    });
  });

  describe('(c) Input validation error paths', () => {
    it('returns 400 for missing email, body contains no Neon details', async () => {
      const request = makePostRequest({ source: 'byok' });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const body = await response.text();
      expect(body).not.toContain('cloud_managed_waitlist');
      expect(body).not.toContain('42P01');
      expect(body).not.toContain('stack');
    });

    it('returns 400 for invalid email format', async () => {
      const request = makePostRequest({ email: 'not-an-email', source: 'byok' });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('returns 400 for email exceeding 254 chars', async () => {
      const longEmail = 'a'.repeat(250) + '@x.co';
      const request = makePostRequest({ email: longEmail, source: 'byok' });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('accepts valid email with unknown source, defaults to "other"', async () => {
      const request = makePostRequest({ email: 'test@example.com', source: 'unknown-source' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('cloud_managed_waitlist'),
        expect.arrayContaining(['other']),
      );
    });

    it('stores normalized email so launch notifications can be sent', async () => {
      const request = makePostRequest({ email: 'TestUser@example.com', source: 'byok' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('email, source, joined_at, updated_at'),
        ['user-test-id', 'testuser@example.com', 'byok', expect.any(String), expect.any(String)],
      );
      expect(mockExecute.mock.calls[0]?.[1]).not.toContain('TestUser@example.com');
    });

    it('returns 400 for completely malformed body', async () => {
      const request = new NextRequest('http://localhost/api/waitlist/cloud-managed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': 'valid-csrf-token-value',
        },
        body: 'not json at all {{{',
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe('(d) DB error paths, no internal state in response', () => {
    it('fails closed when table does not exist (42P01)', async () => {
      const pgErr = Object.assign(new Error('table not found'), { code: '42P01' });
      mockExecute.mockRejectedValueOnce(pgErr);

      const request = makePostRequest({ email: 'test@example.com', source: 'byok' });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(JSON.stringify(data)).not.toContain('test@example.com');
    });

    it('42P01 response does not expose table name or SQL error code', async () => {
      const pgErr = Object.assign(new Error('table not found'), { code: '42P01' });
      mockExecute.mockRejectedValueOnce(pgErr);

      const request = makePostRequest({ email: 'test@example.com', source: 'byok' });
      const response = await POST(request);
      const body = await response.text();

      expect(body).not.toContain('42P01');
      expect(body).not.toContain('cloud_managed_waitlist');
      expect(body).not.toContain('table not found');
    });

    it('generic DB error fails closed without internal details', async () => {
      const pgErr = Object.assign(new Error('duplicate key constraint'), { code: '23505' });
      mockExecute.mockRejectedValueOnce(pgErr);

      const request = makePostRequest({ email: 'test@example.com', source: 'byok' });
      const response = await POST(request);

      const body = await response.text();
      expect(response.status).toBe(500);
      expect(body).not.toContain('23505');
      expect(body).not.toContain('duplicate key constraint');
      expect(body).not.toContain('cloud_managed_waitlist');
    });
  });

  describe('OPTIONS preflight', () => {
    it('OPTIONS responds without requiring CSRF', async () => {
      const request = new NextRequest('http://localhost/api/waitlist/cloud-managed', {
        method: 'OPTIONS',
      });

      const response = await OPTIONS(request);
      expect([200, 204]).toContain(response.status);
      expect(mockRequireCsrfToken).not.toHaveBeenCalled();
    });
  });
});
