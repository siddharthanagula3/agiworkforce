import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';

const stripeMocks = vi.hoisted(() => ({
  retrievePrice: vi.fn(),
}));

const originalEnv = { ...process.env };

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/price-tier-mapping', () => ({
  getConfiguredStripePriceIds: vi.fn(() => ['price_configured']),
}));

vi.mock('stripe', () => ({
  default: class MockStripe {
    products = {
      list: vi.fn().mockResolvedValue({ data: [] }),
    };
    prices = {
      retrieve: stripeMocks.retrievePrice,
    };
  },
}));

const mockNeonQuery = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: mockNeonQuery,
    execute: vi.fn().mockResolvedValue(1),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

import { GET } from '@/app/api/health/route';

describe('Health Check API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_123';
    stripeMocks.retrievePrice.mockResolvedValue({
      active: true,
      type: 'recurring',
      recurring: { interval: 'month' },
    });
    mockNeonQuery.mockResolvedValue([{ '?column?': 1 }]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('GET /api/health', () => {
    it('should return healthy status when all checks pass', async () => {
      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
      expect(data.checks).toBeDefined();
      expect(data.checks.database.status).toBe('healthy');
      expect(data.checks.stripe.status).toBe('healthy');
      expect(data.checks.environment.status).toBe('healthy');
    });

    it('should return unhealthy status when database check fails', async () => {
      mockNeonQuery.mockRejectedValueOnce(new Error('Connection failed'));

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.status).toBe('unhealthy');
      expect(data.checks.database.status).toBe('unhealthy');
      expect(data.checks.database.message).toBe('unavailable');
    });

    it('should return unhealthy status when Stripe check fails', async () => {
      delete process.env['STRIPE_SECRET_KEY'];

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);

      const data = await response.json();
      expect(data.checks.stripe.status).toBe('unhealthy');
      expect(data.checks.stripe.message).toBe('unavailable');
    });

    it('reports Stripe degraded when a configured Price is unreachable under the key', async () => {
      stripeMocks.retrievePrice.mockRejectedValueOnce(
        new Error('Configured Price is not available to this Stripe account or mode'),
      );

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('degraded');
      expect(data.checks.stripe).toEqual({ status: 'unhealthy', message: 'unavailable' });
    });

    it('should return unhealthy status when environment variables are missing', async () => {
      delete process.env['DATABASE_URL'];
      delete process.env['AGI_DATABASE_URL'];

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);

      const data = await response.json();
      expect(data.checks.environment.status).toBe('unhealthy');
      expect(data.checks.environment.missingCount).toBeGreaterThan(0);
    });

    it('should handle empty result from DB as healthy (no rows found)', async () => {
      mockNeonQuery.mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);

      const data = await response.json();
      expect(data.checks.database.status).toBe('healthy');
    });

    it('forbids caching so an external monitor cannot be answered from a stale copy', async () => {
      const healthy = await GET(new NextRequest('http://localhost/api/health', { method: 'GET' }));
      expect(healthy.status).toBe(200);
      expect(healthy.headers.get('cache-control')).toBe('no-store');

      mockNeonQuery.mockRejectedValueOnce(new Error('Connection failed'));
      const down = await GET(new NextRequest('http://localhost/api/health', { method: 'GET' }));
      expect(down.status).toBe(503);
      expect(down.headers.get('cache-control')).toBe('no-store');
    });

    it('should include timestamp in response', async () => {
      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
      const timestamp = new Date(data.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it('should handle missing Stripe key gracefully', async () => {
      delete process.env['STRIPE_SECRET_KEY'];

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data.checks.stripe.status).toBe('unhealthy');
      expect(data.checks.stripe.message).toBe('unavailable');
    });

    it('should handle DB connection failure gracefully', async () => {
      mockNeonQuery.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data.checks.database.status).toBe('unhealthy');
      expect(data.checks.database.message).toBe('unavailable');
    });
  });
});

describe('public health route load shape', () => {
  // The checks make 1 + N Stripe API calls plus a database round trip and the
  // answer is identical for every caller, so running them per request turned a
  // public URL into a traffic-proportional load generator against the exact
  // dependencies an incident is already straining. `no-store` on the response
  // means no CDN can dedupe it either, so the memoisation has to be server-side.
  it('serves from the memoised checks, not a fresh run per request', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/health/route.ts'),
      'utf8',
    );
    expect(source).toContain('getCachedHealthChecks');
    expect(source).not.toMatch(/\bawait runHealthChecks\(/);
  });

  it('declares its own duration ceiling instead of inheriting dashboard state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/health/route.ts'),
      'utf8',
    );
    expect(source).toMatch(/export const maxDuration = \d+/);
  });
});
