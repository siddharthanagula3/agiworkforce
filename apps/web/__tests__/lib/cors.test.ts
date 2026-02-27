/**
 * CORS Tests
 *
 * Tests for CORS handling and security headers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Original env is restored via vi.unstubAllEnvs() in afterEach.

describe('CORS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Reset env vars using vi.stubEnv for proper TypeScript support
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOWED_ORIGINS', 'https://app.example.com,https://admin.example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isOriginAllowed', () => {
    it('should allow null origin (same-origin requests)', async () => {
      const { isOriginAllowed } = await import('@/lib/cors');
      expect(isOriginAllowed(null)).toBe(true);
    });

    it('should allow origins from ALLOWED_ORIGINS env var', async () => {
      const { isOriginAllowed } = await import('@/lib/cors');

      expect(isOriginAllowed('https://app.example.com')).toBe(true);
      expect(isOriginAllowed('https://admin.example.com')).toBe(true);
    });

    it('should allow NEXT_PUBLIC_APP_URL', async () => {
      const { isOriginAllowed } = await import('@/lib/cors');
      expect(isOriginAllowed('https://example.com')).toBe(true);
    });

    it('should allow Tauri desktop app origins', async () => {
      const { isOriginAllowed } = await import('@/lib/cors');

      expect(isOriginAllowed('tauri://localhost')).toBe(true);
      expect(isOriginAllowed('https://tauri.localhost')).toBe(true);
    });

    it('should block unknown origins in production', async () => {
      const { isOriginAllowed } = await import('@/lib/cors');

      expect(isOriginAllowed('https://evil.com')).toBe(false);
      expect(isOriginAllowed('https://attacker.com')).toBe(false);
    });

    it('should allow localhost in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.resetModules();

      const { isOriginAllowed } = await import('@/lib/cors');

      expect(isOriginAllowed('http://localhost:3000')).toBe(true);
      expect(isOriginAllowed('http://localhost:5173')).toBe(true);
      expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(true);
    });

    it('should block localhost in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.resetModules();

      const { isOriginAllowed } = await import('@/lib/cors');

      expect(isOriginAllowed('http://localhost:3000')).toBe(false);
    });
  });

  describe('getCorsHeaders', () => {
    it('should include standard CORS headers', async () => {
      const { getCorsHeaders } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test', {
        headers: { origin: 'https://app.example.com' },
      });

      const headers = getCorsHeaders(request);

      expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
      expect(headers['Access-Control-Allow-Headers']).toBe(
        'Content-Type, Authorization, X-Request-ID',
      );
      expect(headers['Access-Control-Max-Age']).toBe('86400');
    });

    it('should set Access-Control-Allow-Origin for allowed origins', async () => {
      const { getCorsHeaders } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test', {
        headers: { origin: 'https://app.example.com' },
      });

      const headers = getCorsHeaders(request);

      expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    });

    it('should not set Allow-Origin for disallowed origins', async () => {
      const { getCorsHeaders } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test', {
        headers: { origin: 'https://evil.com' },
      });

      const headers = getCorsHeaders(request);

      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should not set Allow-Origin for null origin', async () => {
      const { getCorsHeaders } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test');
      // No origin header

      const headers = getCorsHeaders(request);

      // Origin is allowed (null), but no header is set since it's same-origin
      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    });
  });

  describe('getSecurityHeaders', () => {
    it('should include all security headers', async () => {
      const { getSecurityHeaders } = await import('@/lib/cors');

      const headers = getSecurityHeaders();

      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    });
  });

  describe('handleCorsPreflightRequest', () => {
    it('should return null for non-OPTIONS requests', async () => {
      const { handleCorsPreflightRequest } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test', {
        method: 'GET',
        headers: { origin: 'https://app.example.com' },
      });

      const response = handleCorsPreflightRequest(request);

      expect(response).toBeNull();
    });

    it('should return 204 response for valid OPTIONS request', async () => {
      const { handleCorsPreflightRequest } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.com' },
      });

      const response = handleCorsPreflightRequest(request);

      expect(response).not.toBeNull();
      expect(response!.status).toBe(204);
    });

    it('should return 403 for OPTIONS from disallowed origin', async () => {
      const { handleCorsPreflightRequest } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.com' },
      });

      const response = handleCorsPreflightRequest(request);

      expect(response).not.toBeNull();
      expect(response!.status).toBe(403);
    });

    it('should include CORS headers in preflight response', async () => {
      const { handleCorsPreflightRequest } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.com' },
      });

      const response = handleCorsPreflightRequest(request);

      expect(response!.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
      expect(response!.headers.get('Access-Control-Allow-Methods')).toBeDefined();
    });

    it('should include security headers in preflight response', async () => {
      const { handleCorsPreflightRequest } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.com' },
      });

      const response = handleCorsPreflightRequest(request);

      expect(response!.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response!.headers.get('X-Frame-Options')).toBe('DENY');
    });
  });

  describe('withCorsAndSecurityHeaders', () => {
    it('should add CORS and security headers to response', async () => {
      const { withCorsAndSecurityHeaders } = await import('@/lib/cors');
      const { NextResponse } = await import('next/server');

      const request = new NextRequest('https://example.com/api/test', {
        headers: { origin: 'https://app.example.com' },
      });

      const response = NextResponse.json({ success: true });
      const enhancedResponse = withCorsAndSecurityHeaders(response, request);

      expect(enhancedResponse.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://app.example.com',
      );
      expect(enhancedResponse.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });

  describe('jsonResponseWithCors', () => {
    it('should create JSON response with CORS headers', async () => {
      const { jsonResponseWithCors } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test', {
        headers: { origin: 'https://app.example.com' },
      });

      const response = jsonResponseWithCors(request, { data: 'test' });
      const body = await response.json();

      expect(body.data).toBe('test');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    });

    it('should allow custom status code', async () => {
      const { jsonResponseWithCors } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test', {
        headers: { origin: 'https://app.example.com' },
      });

      const response = jsonResponseWithCors(request, { error: 'Not found' }, { status: 404 });

      expect(response.status).toBe(404);
    });

    it('should allow additional headers', async () => {
      const { jsonResponseWithCors } = await import('@/lib/cors');

      const request = new NextRequest('https://example.com/api/test', {
        headers: { origin: 'https://app.example.com' },
      });

      const response = jsonResponseWithCors(
        request,
        { data: 'test' },
        { headers: { 'X-Custom-Header': 'custom-value' } },
      );

      expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
    });
  });
});
