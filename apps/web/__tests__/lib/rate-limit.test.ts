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

// Mock security audit
vi.mock('@/lib/security-audit', () => ({
  logRateLimitExceeded: vi.fn(),
}));

// Mock Upstash Redis
const mockRateLimitInstance = {
  limit: vi.fn(),
};

vi.mock('@upstash/ratelimit', () => {
  const MockRatelimit = vi.fn().mockImplementation(() => mockRateLimitInstance) as ReturnType<
    typeof vi.fn
  > & { slidingWindow: ReturnType<typeof vi.fn> };
  // Add static methods
  MockRatelimit.slidingWindow = vi.fn().mockReturnValue({});
  return {
    Ratelimit: MockRatelimit,
  };
});

vi.mock('@upstash/redis', () => {
  class MockRedis {
    constructor() {
      // Empty constructor
    }
  }
  return {
    Redis: MockRedis,
  };
});

// Set up environment variables before importing
const originalEnv = process.env;

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset modules to pick up env changes
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Rate Limit Configuration Tests
  // =========================================================================
  describe('Rate Limit Configurations', () => {
    it('should have correct checkout rate limit config', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      expect(rateLimitConfigs.checkout).toEqual({
        limit: 15,
        window: '1 m',
        failClosed: false,
      });
    });

    it('should have correct credit-topup rate limit config', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      expect(rateLimitConfigs['credit-topup']).toEqual({
        limit: 15,
        window: '1 m',
        failClosed: false,
      });
    });

    it('should have correct device-link rate limit config', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      expect(rateLimitConfigs['device-link']).toEqual({
        limit: 10,
        window: '1 m',
        failClosed: true,
      });
    });

    it('should have correct device-poll rate limit config', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      expect(rateLimitConfigs['device-poll']).toEqual({
        limit: 10,
        window: '1 s',
        failClosed: false,
      });
    });

    it('should have correct claim-offer rate limit config', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      expect(rateLimitConfigs['claim-offer']).toEqual({
        limit: 3,
        window: '1 h',
        failClosed: true,
      });
    });

    it('should have correct me endpoint rate limit config', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      expect(rateLimitConfigs.me).toEqual({
        limit: 60,
        window: '1 m',
        failClosed: false,
      });
    });

    it('should have correct sync-subscription rate limit config', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      expect(rateLimitConfigs['sync-subscription']).toEqual({
        limit: 10,
        window: '1 m',
        failClosed: false,
      });
    });

    it('should have correct portal rate limit config', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      expect(rateLimitConfigs.portal).toEqual({
        limit: 10,
        window: '1 m',
        failClosed: false,
      });
    });

    it('should have correct health-check rate limit config', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      expect(rateLimitConfigs['health-check']).toEqual({
        limit: 30,
        window: '1 m',
        failClosed: false,
      });
    });

    it('should have correct default rate limit config', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      expect(rateLimitConfigs.default).toEqual({
        limit: 100,
        window: '1 m',
        failClosed: false,
      });
    });
  });

  // =========================================================================
  // Security-Sensitive Endpoints (failClosed: true) Tests
  // =========================================================================
  describe('Security-Sensitive Endpoints (failClosed)', () => {
    it('should have failClosed=false for checkout endpoint (business-critical)', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');
      // Checkout is fail-open because blocking payments is worse than allowing retries
      expect(rateLimitConfigs.checkout.failClosed).toBe(false);
    });

    it('should have failClosed=true for device-link endpoint', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');
      expect(rateLimitConfigs['device-link'].failClosed).toBe(true);
    });

    it('should have failClosed=true for claim-offer endpoint', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');
      expect(rateLimitConfigs['claim-offer'].failClosed).toBe(true);
    });

    it('should have failClosed=false for non-security endpoints', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');
      expect(rateLimitConfigs['device-poll'].failClosed).toBe(false);
      expect(rateLimitConfigs.me.failClosed).toBe(false);
      expect(rateLimitConfigs['sync-subscription'].failClosed).toBe(false);
      expect(rateLimitConfigs.portal.failClosed).toBe(false);
      expect(rateLimitConfigs['health-check'].failClosed).toBe(false);
      expect(rateLimitConfigs.default.failClosed).toBe(false);
      // Business-critical payment endpoints are fail-open
      expect(rateLimitConfigs.checkout.failClosed).toBe(false);
      expect(rateLimitConfigs['credit-topup'].failClosed).toBe(false);
    });
  });

  // =========================================================================
  // checkRateLimit Tests (In-Memory Fallback)
  // =========================================================================
  describe('checkRateLimit - In-Memory Fallback', () => {
    beforeEach(() => {
      // Ensure Redis env vars are not set
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();
    });

    it('should allow request under rate limit', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      });

      const result = await checkRateLimit(request, 'default');

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(99); // 100 - 1
      expect(result.limit).toBe(100);
    });

    it('should block request when rate limit exceeded', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit');

      // Simulate many requests from same IP
      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: {
          'x-forwarded-for': '192.168.1.100', // Different IP to avoid collision
        },
      });

      // Make 100 requests (the limit)
      for (let i = 0; i < 100; i++) {
        await checkRateLimit(request, 'default');
      }

      // 101st request should be blocked
      const result = await checkRateLimit(request, 'default');

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track different identifiers separately', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit');

      const request1 = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: { 'x-forwarded-for': '10.0.0.1' },
      });

      const request2 = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: { 'x-forwarded-for': '10.0.0.2' },
      });

      // First IP makes 50 requests
      for (let i = 0; i < 50; i++) {
        await checkRateLimit(request1, 'default');
      }

      // Second IP should still have full limit
      const result = await checkRateLimit(request2, 'default');

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('should use user ID when available', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: {
          'x-user-id': 'user-123',
          'x-forwarded-for': '192.168.1.1',
        },
      });

      const result = await checkRateLimit(request, 'default');

      expect(result.success).toBe(true);
    });

    it('should include rate limit headers in response', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: { 'x-forwarded-for': '10.0.1.1' },
      });

      const result = await checkRateLimit(request, 'default');

      expect(result.headers['X-RateLimit-Limit']).toBe('100');
      expect(result.headers['X-RateLimit-Remaining']).toBeDefined();
      expect(result.headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('should include Retry-After header when limit exceeded', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: { 'x-forwarded-for': '10.0.2.1' },
      });

      // Exhaust the limit
      for (let i = 0; i < 100; i++) {
        await checkRateLimit(request, 'default');
      }

      const result = await checkRateLimit(request, 'default');

      expect(result.success).toBe(false);
      expect(result.headers['Retry-After']).toBeDefined();
    });
  });

  // =========================================================================
  // withRateLimit Tests
  // =========================================================================
  describe('withRateLimit', () => {
    beforeEach(() => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();
    });

    it('should return null when rate limit not exceeded', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.1.0.1' },
      });

      const result = await withRateLimit(request, 'checkout');

      expect(result).toBeNull();
    });

    it('should return 429 response when rate limit exceeded', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.1.0.2' },
      });

      // Exhaust the checkout limit (15 requests)
      for (let i = 0; i < 15; i++) {
        await withRateLimit(request, 'checkout');
      }

      const result = await withRateLimit(request, 'checkout');

      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);

      const data = await result?.json();
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should log rate limit exceeded to security audit', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');
      const { logRateLimitExceeded } = await import('@/lib/security-audit');

      const request = new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.1.0.3' },
      });

      // Exhaust the limit (15 requests)
      for (let i = 0; i < 15; i++) {
        await withRateLimit(request, 'checkout');
      }

      await withRateLimit(request, 'checkout');

      expect(logRateLimitExceeded).toHaveBeenCalled();
    });

    it('should use custom identifier when provided', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: { 'x-forwarded-for': '10.1.0.4' },
      });

      const result = await withRateLimit(request, 'default', 'custom-identifier');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // withRateLimitHandler Tests
  // =========================================================================
  describe('withRateLimitHandler', () => {
    beforeEach(() => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();
    });

    it('should call handler when rate limit not exceeded', async () => {
      const { withRateLimitHandler } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');

      const mockHandler = vi.fn().mockResolvedValue(NextResponse.json({ success: true }));

      const wrappedHandler = withRateLimitHandler(mockHandler, 'default');

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: { 'x-forwarded-for': '10.2.0.1' },
      });

      const result = await wrappedHandler(request);
      const data = await result.json();

      expect(mockHandler).toHaveBeenCalled();
      expect(data.success).toBe(true);
    });

    it('should return 429 without calling handler when rate limited', async () => {
      const { withRateLimitHandler } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');

      const mockHandler = vi.fn().mockResolvedValue(NextResponse.json({ success: true }));

      const wrappedHandler = withRateLimitHandler(mockHandler, 'checkout');

      const request = new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.2.0.2' },
      });

      // Exhaust limit (15 requests)
      for (let i = 0; i < 15; i++) {
        await wrappedHandler(request);
      }

      // Reset mock to track only the rate-limited call
      mockHandler.mockClear();

      const result = await wrappedHandler(request);

      expect(result.status).toBe(429);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should use custom identifier function', async () => {
      const { withRateLimitHandler } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');

      const mockHandler = vi.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const getIdentifier = vi.fn().mockReturnValue('custom-id');

      const wrappedHandler = withRateLimitHandler(mockHandler, 'default', getIdentifier);

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: { 'x-forwarded-for': '10.2.0.3' },
      });

      await wrappedHandler(request);

      expect(getIdentifier).toHaveBeenCalledWith(request);
    });
  });

  // =========================================================================
  // Fail-Closed Behavior Tests
  // =========================================================================
  describe('Fail-Closed Behavior', () => {
    // Note: The fail-closed behavior is tested via configuration validation
    // Actually simulating Redis failures requires complex module-level mocking
    // that interferes with Vitest's module isolation

    it('should have failClosed configuration documented for security endpoints', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      // Security-critical endpoints should have failClosed=true
      // This means they will block requests if Redis is unavailable
      // Note: checkout is fail-open (business-critical payment flow)
      const securityEndpoints = ['device-link', 'claim-offer'];

      for (const endpoint of securityEndpoints) {
        const config = rateLimitConfigs[endpoint as keyof typeof rateLimitConfigs];
        expect(config.failClosed).toBe(true);
      }
    });

    it('should have failClosed=false for non-security endpoints (fail-open)', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');

      // Non-security endpoints should have failClosed=false
      // This means they will allow requests if Redis is unavailable
      const nonSecurityEndpoints = [
        'device-poll',
        'me',
        'sync-subscription',
        'portal',
        'health-check',
        'default',
      ];

      for (const endpoint of nonSecurityEndpoints) {
        const config = rateLimitConfigs[endpoint as keyof typeof rateLimitConfigs];
        expect(config.failClosed).toBe(false);
      }
    });
  });

  // =========================================================================
  // RateLimitInfo Interface Tests
  // =========================================================================
  describe('RateLimitInfo Interface', () => {
    beforeEach(() => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();
    });

    it('should return all required fields', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: { 'x-forwarded-for': '10.4.0.1' },
      });

      const result = await checkRateLimit(request, 'default');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('reset');
      expect(result).toHaveProperty('headers');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.limit).toBe('number');
      expect(typeof result.remaining).toBe('number');
      expect(typeof result.reset).toBe('number');
      expect(typeof result.headers).toBe('object');
    });
  });

  // =========================================================================
  // Window Parsing Tests (Implicit via behavior)
  // =========================================================================
  describe('Window Configuration', () => {
    beforeEach(() => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();
    });

    it('should handle second-based windows (device-poll: 1 s)', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');
      expect(rateLimitConfigs['device-poll'].window).toBe('1 s');
    });

    it('should handle minute-based windows (checkout: 1 m)', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');
      expect(rateLimitConfigs.checkout.window).toBe('1 m');
    });

    it('should handle hour-based windows (claim-offer: 1 h)', async () => {
      const { rateLimitConfigs } = await import('@/lib/rate-limit');
      expect(rateLimitConfigs['claim-offer'].window).toBe('1 h');
    });
  });

  // =========================================================================
  // Identifier Extraction Tests
  // =========================================================================
  describe('Identifier Extraction', () => {
    beforeEach(() => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();
    });

    it('should prefer user ID over IP address', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: {
          'x-user-id': 'authenticated-user',
          'x-forwarded-for': '10.5.0.1',
        },
      });

      // Make many requests as authenticated user
      for (let i = 0; i < 50; i++) {
        await checkRateLimit(request, 'default');
      }

      // Same IP but different user should have full limit
      const request2 = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: {
          'x-user-id': 'different-user',
          'x-forwarded-for': '10.5.0.1', // Same IP
        },
      });

      const result = await checkRateLimit(request2, 'default');

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('should use x-real-ip as fallback', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: {
          'x-real-ip': '10.5.0.2',
        },
      });

      const result = await checkRateLimit(request, 'default');

      expect(result.success).toBe(true);
    });

    it('should handle requests with no IP headers', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
      });

      const result = await checkRateLimit(request, 'default');

      expect(result.success).toBe(true);
    });

    it('should use first IP from x-forwarded-for when multiple present', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit');

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
        headers: {
          'x-forwarded-for': '10.5.0.3, 10.5.0.4, 10.5.0.5',
        },
      });

      const result = await checkRateLimit(request, 'default');

      expect(result.success).toBe(true);
    });
  });
});
