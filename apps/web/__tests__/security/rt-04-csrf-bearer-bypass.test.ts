/**
 * RT-04: CSRF bypass via any Bearer header
 *
 * Tests that requireCsrfToken only bypasses CSRF for cryptographically valid
 * Bearer tokens, not for garbage/invalid Bearer strings.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Override the global @/lib/csrf mock from test/setup.ts so this file tests the
// real implementation. setup.ts mocks `requireCsrfToken` to always return null
// for ALL tests; combined with vitest config `mockReset: true`, the mock loses
// its implementation between tests and returns undefined — which breaks every
// real-impl test in this file.
vi.mock('@/lib/csrf', async (importOriginal) => importOriginal());

vi.mock('server-only', () => ({}));

// ─── Clerk backend mock — controls whether JWT is "valid" ─────────────────────
// NOTE: `verifyToken` is a plain function (not vi.fn()) at the mock boundary so
// that vitest's `mockReset: true` config doesn't clear its implementation
// between tests. Only `mockVerifyToken` is reset between tests via beforeEach.
const mockVerifyToken = vi.fn();
vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

// Clerk auth() mock — returns no session (tests exercise the Bearer path)
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
}));

process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';
process.env['CSRF_SECRET'] = 'test-csrf-secret-32chars-minimum!!';
process.env['JWT_SECRET'] = 'test-developer-jwt-secret-at-least-32-bytes';

import { requireCsrfToken, validateCsrfFromRequest, isBearerTokenValid } from '@/lib/csrf';

function makeRequest(
  method: string,
  opts: { bearerToken?: string; csrfToken?: string; cookie?: string } = {},
): Request {
  const headers: Record<string, string> = {};
  if (opts.bearerToken) headers['authorization'] = `Bearer ${opts.bearerToken}`;
  if (opts.csrfToken) headers['x-csrf-token'] = opts.csrfToken;
  if (opts.cookie) headers['cookie'] = opts.cookie;

  return new Request('http://localhost/api/test', { method, headers });
}

function makeDeveloperToken(): string {
  return jwt.sign(
    {
      userId: 'device-user',
      sub: 'device-user',
      surface: 'developer',
    },
    process.env['JWT_SECRET']!,
    {
      expiresIn: 3600,
      issuer: 'agiworkforce-api-gateway',
      audience: 'agiworkforce',
      jwtid: 'csrf-device-jti',
    },
  );
}

describe('RT-04: CSRF Bearer bypass fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: verifyToken throws (invalid JWT)
    mockVerifyToken.mockRejectedValue(new Error('invalid token'));
  });

  describe('isBearerTokenValid', () => {
    it('returns false when no Authorization header', async () => {
      const result = await isBearerTokenValid(null);
      expect(result).toBe(false);
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it('returns false for garbage Bearer token', async () => {
      const result = await isBearerTokenValid('Bearer bogus_garbage_token');
      expect(result).toBe(false);
    });

    it('returns false for "Bearer xxx" (invalid JWT)', async () => {
      mockVerifyToken.mockRejectedValue(new Error('invalid JWT'));
      const result = await isBearerTokenValid('Bearer invalid.jwt.token');
      expect(result).toBe(false);
    });

    it('returns true for a valid Clerk JWT', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'user_123' });
      const result = await isBearerTokenValid(
        'Bearer valid.jwt.token.with.sufficient.length.for.bearer.minimum',
      );
      expect(result).toBe(true);
    });

    it('returns true for a valid first-party developer device token', async () => {
      const result = await isBearerTokenValid(`Bearer ${makeDeveloperToken()}`);
      expect(result).toBe(true);
    });

    it('returns false for extremely short token', async () => {
      const result = await isBearerTokenValid('Bearer x');
      expect(result).toBe(false);
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });
  });

  describe('requireCsrfToken', () => {
    it('POST with valid Bearer + no CSRF → 200 (null returned)', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'user_123' });
      const req = makeRequest('POST', {
        bearerToken: 'valid.jwt.token.with.sufficient.length.for.bearer.minimum',
      });
      const result = await requireCsrfToken(req);
      expect(result).toBeNull(); // CSRF passes (valid Bearer)
    });

    it('POST with a valid developer device token bypasses CSRF safely', async () => {
      const result = await requireCsrfToken(
        makeRequest('POST', { bearerToken: makeDeveloperToken() }),
      );
      expect(result).toBeNull();
    });

    it('POST with invalid Bearer + session cookie + no CSRF → 403 (was previously 200)', async () => {
      // RT-04 regression test: old code returned null for ANY Bearer header
      mockVerifyToken.mockRejectedValue(new Error('invalid'));
      const req = makeRequest('POST', {
        bearerToken: 'bogus_invalid_token',
        cookie: 'agi_access_token=some_cookie_session',
      });
      const result = await requireCsrfToken(req);
      // Should be a 403 Response, not null
      expect(result).not.toBeNull();
      expect((result as Response).status).toBe(403);
      const body = await (result as Response).json();
      expect(body.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('POST with invalid Bearer + session cookie + valid CSRF → requireCsrfToken called without Bearer bypass', async () => {
      mockVerifyToken.mockRejectedValue(new Error('invalid'));
      // The key assertion: bogus Bearer no longer grants automatic bypass.
      // With a valid CSRF token the result depends on session binding (tested in unit),
      // but with NO CSRF token the result must be 403 (bogus Bearer does not skip check).
      const req = makeRequest('POST', {
        bearerToken: 'bogus',
        cookie: 'agi_access_token=some_session',
      });
      const result = await requireCsrfToken(req);
      // No valid CSRF token supplied — must be 403 (bogus Bearer did NOT bypass)
      expect(result).not.toBeNull();
      expect((result as Response).status).toBe(403);
    });

    it('POST with no Bearer + no CSRF → 403', async () => {
      const req = makeRequest('POST', {});
      const result = await requireCsrfToken(req);
      expect(result).not.toBeNull();
      expect((result as Response).status).toBe(403);
    });

    it('GET with invalid Bearer → no CSRF check needed (GET is safe)', async () => {
      const req = makeRequest('GET', { bearerToken: 'bogus' });
      const result = await requireCsrfToken(req);
      expect(result).toBeNull(); // GET never needs CSRF
    });

    it('DELETE with invalid Bearer + no CSRF → 403', async () => {
      mockVerifyToken.mockRejectedValue(new Error('invalid'));
      const req = makeRequest('DELETE', { bearerToken: 'bogus_token_xyz' });
      const result = await requireCsrfToken(req);
      expect(result).not.toBeNull();
      expect((result as Response).status).toBe(403);
    });

    it('PUT with invalid Bearer + no CSRF → 403', async () => {
      mockVerifyToken.mockRejectedValue(new Error('invalid'));
      const req = makeRequest('PUT', { bearerToken: 'bogus' });
      const result = await requireCsrfToken(req);
      expect(result).not.toBeNull();
      expect((result as Response).status).toBe(403);
    });
  });

  describe('validateCsrfFromRequest', () => {
    it('valid Bearer → returns true', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'user_123' });
      const req = makeRequest('POST', {
        bearerToken: 'valid.jwt.token.with.sufficient.length.for.bearer.minimum',
      });
      const result = await validateCsrfFromRequest(req);
      expect(result).toBe(true);
    });

    it('invalid Bearer + no CSRF → returns false', async () => {
      mockVerifyToken.mockRejectedValue(new Error('invalid'));
      const req = makeRequest('POST', { bearerToken: 'bogus' });
      const result = await validateCsrfFromRequest(req);
      expect(result).toBe(false);
    });

    it('GET → always returns true (no CSRF needed)', async () => {
      const req = makeRequest('GET', { bearerToken: 'bogus' });
      const result = await validateCsrfFromRequest(req);
      expect(result).toBe(true);
    });
  });
});
