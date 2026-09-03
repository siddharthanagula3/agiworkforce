import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/csrf', async (importOriginal) => importOriginal());

vi.mock('server-only', () => ({}));

const mockVerifyToken = vi.fn();
vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

const mockAuth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockVerifyKey = vi.fn();
vi.mock('@/lib/services/api-key-service', () => ({
  ApiKeyService: { verifyKey: (...args: unknown[]) => mockVerifyKey(...args) },
}));

process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';
process.env['CSRF_SECRET'] = 'test-csrf-secret-32chars-minimum!!';

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

const GARBAGE_SK_LIVE_KEY = 'sk_live_0000000000000000_never_issued_never_matches_anything';
const REAL_SK_LIVE_KEY = 'sk_live_1a2b3c4d5e6f7890_a_real_verified_secret_value_here';

describe('WEB-APIKEY-CSRF-BLOCK-01: API-key CSRF bypass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyToken.mockRejectedValue(new Error('not a JWT'));
    mockVerifyKey.mockResolvedValue(null);
    mockAuth.mockResolvedValue({ userId: null });
  });

  describe('THE ATTACK: garbage sk_-shaped bearer + valid session cookie', () => {
    it('does NOT bypass CSRF, requireCsrfToken still 403s with no x-csrf-token', async () => {
      mockAuth.mockResolvedValue({ userId: 'victim-user' });
      mockVerifyKey.mockResolvedValue(null);

      const req = makeRequest('POST', {
        bearerToken: GARBAGE_SK_LIVE_KEY,
        cookie: 'session-id=victim-session',
      });
      const result = await requireCsrfToken(req);

      expect(result).not.toBeNull();
      expect((result as Response).status).toBe(403);
      const body = await (result as Response).json();
      expect(body.code).toBe('CSRF_VALIDATION_FAILED');
      expect(mockVerifyKey).toHaveBeenCalledWith(GARBAGE_SK_LIVE_KEY);
    });

    it('same attack via validateCsrfFromRequest → returns false, not true', async () => {
      mockAuth.mockResolvedValue({ userId: 'victim-user' });
      mockVerifyKey.mockResolvedValue(null);

      const req = makeRequest('POST', {
        bearerToken: GARBAGE_SK_LIVE_KEY,
        cookie: 'session-id=victim-session',
      });
      const result = await validateCsrfFromRequest(req);

      expect(result).toBe(false);
    });

    it('isBearerTokenValid returns false for the garbage key regardless of cookie state', async () => {
      mockVerifyKey.mockResolvedValue(null);
      const result = await isBearerTokenValid(`Bearer ${GARBAGE_SK_LIVE_KEY}`);
      expect(result).toBe(false);
    });
  });

  describe('the fix: a cryptographically verified API key bypasses CSRF', () => {
    it('requireCsrfToken returns null (bypass) for a verified key', async () => {
      mockVerifyKey.mockResolvedValue({
        id: 'key-1',
        user_id: 'user-1',
        name: 'ci key',
        scopes: [],
        created_at: '2026-01-01',
        expires_at: null,
        last_used_at: null,
      });

      const req = makeRequest('POST', { bearerToken: REAL_SK_LIVE_KEY });
      const result = await requireCsrfToken(req);

      expect(result).toBeNull();
      expect(mockVerifyKey).toHaveBeenCalledWith(REAL_SK_LIVE_KEY);
    });

    it('validateCsrfFromRequest returns true for a verified key', async () => {
      mockVerifyKey.mockResolvedValue({ id: 'key-1', user_id: 'user-1' });
      const req = makeRequest('POST', { bearerToken: REAL_SK_LIVE_KEY });
      expect(await validateCsrfFromRequest(req)).toBe(true);
    });

    it('a verified key still bypasses even with a valid session cookie present', async () => {
      mockAuth.mockResolvedValue({ userId: 'user-1' });
      mockVerifyKey.mockResolvedValue({ id: 'key-1', user_id: 'user-1' });

      const req = makeRequest('POST', {
        bearerToken: REAL_SK_LIVE_KEY,
        cookie: 'session-id=user-1-session',
      });
      expect(await requireCsrfToken(req)).toBeNull();
    });

    it('GET requests never touch ApiKeyService, CSRF is method-gated first', async () => {
      const req = makeRequest('GET', { bearerToken: REAL_SK_LIVE_KEY });
      expect(await requireCsrfToken(req)).toBeNull();
      expect(mockVerifyKey).not.toHaveBeenCalled();
    });
  });

  describe('unchanged: Clerk-JWT bypass and cookie-only CSRF requirement', () => {
    it('a valid Clerk JWT still bypasses CSRF, and never calls ApiKeyService', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'user_123' });
      const req = makeRequest('POST', {
        bearerToken: 'valid.jwt.token.with.sufficient.length.for.bearer.minimum',
      });

      expect(await requireCsrfToken(req)).toBeNull();
      expect(mockVerifyKey).not.toHaveBeenCalled();
    });

    it('cookie-only request (no bearer) with no CSRF token still 403s', async () => {
      mockAuth.mockResolvedValue({ userId: 'user-1' });
      const req = makeRequest('POST', { cookie: 'session-id=user-1-session' });
      const result = await requireCsrfToken(req);
      expect(result).not.toBeNull();
      expect((result as Response).status).toBe(403);
      expect(mockVerifyKey).not.toHaveBeenCalled();
    });
  });
});
