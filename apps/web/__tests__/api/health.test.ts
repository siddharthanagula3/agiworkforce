/**
 * Health Check API Tests
 *
 * Tests for the health endpoint that checks database, Stripe, and environment
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const stripeMocks = vi.hoisted(() => ({
  retrievePrice: vi.fn(),
}));

// Store original env vars
const originalEnv = { ...process.env };

// Mock dependencies
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

// Mock Stripe - must be a class for 'new Stripe()' to work
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

// Mock Neon DB
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

// Import after mocks
import { GET } from '@/app/api/health/route';

describe('Health Check API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env vars — health route checks DATABASE_URL (Neon)
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_123';
    stripeMocks.retrievePrice.mockResolvedValue({
      active: true,
      type: 'recurring',
      recurring: { interval: 'month' },
    });
    // Re-apply mockNeonQuery default after clearAllMocks
    mockNeonQuery.mockResolvedValue([{ '?column?': 1 }]);
  });

  afterEach(() => {
    // Restore original env
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
      // Override Neon mock to throw an error
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
      // Remove Stripe key to trigger unhealthy status
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
      // Remove required Neon env vars
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
      // Neon returning an empty array is a successful query — DB is reachable
      mockNeonQuery.mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);

      const data = await response.json();
      expect(data.checks.database.status).toBe('healthy');
    });

    it('should include timestamp in response', async () => {
      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
      // Verify it's a valid ISO date
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
