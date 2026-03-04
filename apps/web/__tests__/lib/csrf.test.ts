/**
 * CSRF Token Tests
 *
 * Tests for CSRF token generation and verification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

describe('CSRF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env['CSRF_SECRET'] = 'test-csrf-secret-key-12345';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('generateCsrfToken', () => {
    it('should generate a token with session ID, timestamp, and signature', async () => {
      const { generateCsrfToken } = await import('@/lib/csrf');
      const sessionId = 'session-123';

      const token = generateCsrfToken(sessionId);

      const parts = token.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe(sessionId);
      expect(parseInt(parts[1]!, 10)).not.toBeNaN();
      expect(parts[2]!).toHaveLength(64); // SHA-256 hex
    });

    it('should generate different tokens for different sessions', async () => {
      const { generateCsrfToken } = await import('@/lib/csrf');

      const token1 = generateCsrfToken('session-1');
      const token2 = generateCsrfToken('session-2');

      expect(token1).not.toBe(token2);
    });

    it('should include current timestamp', async () => {
      const { generateCsrfToken } = await import('@/lib/csrf');
      const now = Date.now();

      const token = generateCsrfToken('session-123');
      const timestamp = parseInt(token.split(':')[1]!, 10);

      // Timestamp should be within 1 second of now
      expect(Math.abs(timestamp - now)).toBeLessThan(1000);
    });

    it('should throw error when CSRF_SECRET is not set', async () => {
      delete process.env['CSRF_SECRET'];
      vi.resetModules();

      const { generateCsrfToken, resetCsrfCache } = await import('@/lib/csrf');
      resetCsrfCache(); // Clear cached secret

      expect(() => generateCsrfToken('session-123')).toThrow(
        'CSRF_SECRET environment variable is required',
      );
    });
  });

  describe('verifyCsrfToken', () => {
    it('should verify valid token', async () => {
      const { generateCsrfToken, verifyCsrfToken } = await import('@/lib/csrf');
      const sessionId = 'session-123';

      const token = generateCsrfToken(sessionId);
      const isValid = verifyCsrfToken(token, sessionId);

      expect(isValid).toBe(true);
    });

    it('should reject null token', async () => {
      const { verifyCsrfToken } = await import('@/lib/csrf');

      expect(verifyCsrfToken(null, 'session-123')).toBe(false);
    });

    it('should reject token with wrong session ID', async () => {
      const { generateCsrfToken, verifyCsrfToken } = await import('@/lib/csrf');

      const token = generateCsrfToken('session-1');
      const isValid = verifyCsrfToken(token, 'session-2');

      expect(isValid).toBe(false);
    });

    it('should reject expired token', async () => {
      const { verifyCsrfToken } = await import('@/lib/csrf');
      const sessionId = 'session-123';

      // Create a token with old timestamp
      const oldTimestamp = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
      const { createHmac } = await import('crypto');
      const data = `${sessionId}:${oldTimestamp}`;
      const signature = createHmac('sha256', 'test-csrf-secret-key-12345')
        .update(data)
        .digest('hex');
      const expiredToken = `${data}:${signature}`;

      const isValid = verifyCsrfToken(expiredToken, sessionId, 3600000); // 1 hour max age

      expect(isValid).toBe(false);
    });

    it('should accept token within max age', async () => {
      const { generateCsrfToken, verifyCsrfToken } = await import('@/lib/csrf');
      const sessionId = 'session-123';

      const token = generateCsrfToken(sessionId);
      const isValid = verifyCsrfToken(token, sessionId, 3600000); // 1 hour

      expect(isValid).toBe(true);
    });

    it('should reject token with invalid format (wrong parts)', async () => {
      const { verifyCsrfToken } = await import('@/lib/csrf');

      expect(verifyCsrfToken('invalid', 'session-123')).toBe(false);
      expect(verifyCsrfToken('part1:part2', 'session-123')).toBe(false);
      expect(verifyCsrfToken('part1:part2:part3:part4', 'session-123')).toBe(false);
    });

    it('should reject token with tampered signature', async () => {
      const { generateCsrfToken, verifyCsrfToken } = await import('@/lib/csrf');
      const sessionId = 'session-123';

      const token = generateCsrfToken(sessionId);
      const parts = token.split(':');
      const tamperedToken = `${parts[0]}:${parts[1]}:tampered${parts[2]!.slice(8)}`;

      const isValid = verifyCsrfToken(tamperedToken, sessionId);

      expect(isValid).toBe(false);
    });

    it('should reject token with invalid timestamp', async () => {
      const { verifyCsrfToken } = await import('@/lib/csrf');

      const invalidToken = 'session-123:notanumber:' + 'a'.repeat(64);
      const isValid = verifyCsrfToken(invalidToken, 'session-123');

      expect(isValid).toBe(false);
    });

    it('should reject token with wrong signature length', async () => {
      const { verifyCsrfToken } = await import('@/lib/csrf');

      const shortSignature = 'session-123:' + Date.now() + ':' + 'a'.repeat(32);
      const isValid = verifyCsrfToken(shortSignature, 'session-123');

      expect(isValid).toBe(false);
    });
  });

  describe('getSessionIdFromRequest', () => {
    it('should extract session ID from session-id cookie', async () => {
      const { getSessionIdFromRequest } = await import('@/lib/csrf');

      const request = new Request('https://example.com', {
        headers: { cookie: 'session-id=my-session-123' },
      });

      const sessionId = await getSessionIdFromRequest(request);
      expect(sessionId).toBe('my-session-123');
    });

    it('should extract session ID from Supabase auth cookie', async () => {
      const { getSessionIdFromRequest } = await import('@/lib/csrf');

      const request = new Request('https://example.com', {
        headers: { cookie: 'sb-test-auth-token=some-token-value' },
      });

      const sessionId = await getSessionIdFromRequest(request);
      expect(sessionId).toMatch(/^anon-/);
    });

    it('should generate anonymous session ID when no cookies', async () => {
      const { getSessionIdFromRequest } = await import('@/lib/csrf');

      const request = new Request('https://example.com');

      const sessionId = await getSessionIdFromRequest(request);
      expect(sessionId).toMatch(/^anon-/);
    });

    it('should prefer session-id cookie over Supabase cookie', async () => {
      const { getSessionIdFromRequest } = await import('@/lib/csrf');

      const request = new Request('https://example.com', {
        headers: { cookie: 'session-id=explicit-session;sb-test-auth-token=supabase-token' },
      });

      const sessionId = await getSessionIdFromRequest(request);
      expect(sessionId).toBe('explicit-session');
    });
  });

  describe('validateCsrfFromRequest', () => {
    it('should skip validation for GET requests', async () => {
      const { validateCsrfFromRequest } = await import('@/lib/csrf');

      const request = new Request('https://example.com', { method: 'GET' });
      const isValid = await validateCsrfFromRequest(request);

      expect(isValid).toBe(true);
    });

    it('should require validation for POST requests', async () => {
      const { validateCsrfFromRequest } = await import('@/lib/csrf');

      const request = new Request('https://example.com', { method: 'POST' });
      const isValid = await validateCsrfFromRequest(request);

      expect(isValid).toBe(false); // No token provided
    });

    it('should require validation for PUT requests', async () => {
      const { validateCsrfFromRequest } = await import('@/lib/csrf');

      const request = new Request('https://example.com', { method: 'PUT' });
      const isValid = await validateCsrfFromRequest(request);

      expect(isValid).toBe(false);
    });

    it('should require validation for DELETE requests', async () => {
      const { validateCsrfFromRequest } = await import('@/lib/csrf');

      const request = new Request('https://example.com', { method: 'DELETE' });
      const isValid = await validateCsrfFromRequest(request);

      expect(isValid).toBe(false);
    });

    it('should require validation for PATCH requests', async () => {
      const { validateCsrfFromRequest } = await import('@/lib/csrf');

      const request = new Request('https://example.com', { method: 'PATCH' });
      const isValid = await validateCsrfFromRequest(request);

      expect(isValid).toBe(false);
    });

    it('should validate token from x-csrf-token header', async () => {
      const { generateCsrfToken, validateCsrfFromRequest } = await import('@/lib/csrf');
      const sessionId = 'session-123';
      const token = generateCsrfToken(sessionId);

      const request = new Request('https://example.com', {
        method: 'POST',
        headers: {
          'x-csrf-token': token,
          cookie: `session-id=${sessionId}`,
        },
      });

      const isValid = await validateCsrfFromRequest(request);

      expect(isValid).toBe(true);
    });

    it('should allow providing session ID directly', async () => {
      const { generateCsrfToken, validateCsrfFromRequest } = await import('@/lib/csrf');
      const sessionId = 'custom-session';
      const token = generateCsrfToken(sessionId);

      const request = new Request('https://example.com', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
      });

      const isValid = await validateCsrfFromRequest(request, sessionId);

      expect(isValid).toBe(true);
    });
  });

  // =========================================================================
  // requireCsrfToken Tests (M38)
  // Note: setup.ts mocks requireCsrfToken globally; use vi.importActual to test real impl.
  // =========================================================================
  describe('requireCsrfToken', () => {
    type CsrfModule = typeof import('@/lib/csrf');

    it('returns null for GET requests (no CSRF check needed)', async () => {
      const { requireCsrfToken, resetCsrfCache } = await vi.importActual<CsrfModule>('@/lib/csrf');
      resetCsrfCache();
      const request = new Request('https://example.com', { method: 'GET' });
      const result = await requireCsrfToken(request);
      expect(result).toBeNull();
    });

    it('returns null when valid token is present on POST', async () => {
      const { generateCsrfToken, requireCsrfToken, resetCsrfCache } =
        await vi.importActual<CsrfModule>('@/lib/csrf');
      resetCsrfCache();
      const sessionId = 'session-require-test';
      const token = generateCsrfToken(sessionId);
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: {
          'x-csrf-token': token,
          cookie: `session-id=${sessionId}`,
        },
      });
      const result = await requireCsrfToken(request);
      expect(result).toBeNull();
    });

    it('returns 403 Response when x-csrf-token header is absent on POST', async () => {
      const { requireCsrfToken, resetCsrfCache } = await vi.importActual<CsrfModule>('@/lib/csrf');
      resetCsrfCache();
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: { cookie: 'session-id=some-session' },
      });
      const result = await requireCsrfToken(request);
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(403);
      const body = await result!.json();
      expect(body.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('returns 403 Response when token is for a different session', async () => {
      const { generateCsrfToken, requireCsrfToken, resetCsrfCache } =
        await vi.importActual<CsrfModule>('@/lib/csrf');
      resetCsrfCache();
      const token = generateCsrfToken('session-A');
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: {
          'x-csrf-token': token,
          cookie: 'session-id=session-B',
        },
      });
      const result = await requireCsrfToken(request);
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(403);
    });

    it('accepts externally supplied sessionId, bypassing cookie extraction', async () => {
      const { generateCsrfToken, requireCsrfToken, resetCsrfCache } =
        await vi.importActual<CsrfModule>('@/lib/csrf');
      resetCsrfCache();
      const sessionId = 'explicit-session-id';
      const token = generateCsrfToken(sessionId);
      const request = new Request('https://example.com', {
        method: 'DELETE',
        headers: { 'x-csrf-token': token },
      });
      const result = await requireCsrfToken(request, sessionId);
      expect(result).toBeNull();
    });

    it('403 response has correct Content-Type and X-Content-Type-Options headers', async () => {
      const { requireCsrfToken, resetCsrfCache } = await vi.importActual<CsrfModule>('@/lib/csrf');
      resetCsrfCache();
      const request = new Request('https://example.com', { method: 'POST' });
      const result = await requireCsrfToken(request);
      expect(result).toBeInstanceOf(Response);
      expect(result?.headers.get('Content-Type')).toContain('application/json');
      expect(result?.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });
});
