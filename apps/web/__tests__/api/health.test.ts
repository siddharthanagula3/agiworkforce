/**
 * Health Check API Tests
 *
 * Tests for the health endpoint that checks database, Stripe, and environment
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

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

// Mock Stripe - must be a class for 'new Stripe()' to work
vi.mock('stripe', () => ({
  default: class MockStripe {
    products = {
      list: vi.fn().mockResolvedValue({ data: [] }),
    };
  },
}));

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
  })),
}));

// Import after mocks
import { GET } from '@/app/api/health/route';

describe('Health Check API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env vars
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://test.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'test-anon-key';
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key';
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_123';
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
      // Override Supabase mock to return error
      const { createClient } = await import('@supabase/supabase-js');
      vi.mocked(createClient).mockReturnValueOnce({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Connection failed', code: 'UNKNOWN' },
            }),
          })),
        })),
      } as never);

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

    it('should return unhealthy status when environment variables are missing', async () => {
      // Remove required env vars
      delete process.env['NEXT_PUBLIC_SUPABASE_URL'];
      delete process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);

      const data = await response.json();
      expect(data.checks.environment.status).toBe('unhealthy');
      expect(data.checks.environment.missingCount).toBeGreaterThan(0);
    });

    it('should handle PGRST116 error as healthy (no rows found)', async () => {
      // PGRST116 is "not found" which is fine for health check
      const { createClient } = await import('@supabase/supabase-js');
      vi.mocked(createClient).mockReturnValueOnce({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'No rows found' },
            }),
          })),
        })),
      } as never);

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

    it('should handle missing Supabase credentials gracefully', async () => {
      delete process.env['NEXT_PUBLIC_SUPABASE_URL'];
      delete process.env['SUPABASE_SERVICE_ROLE_KEY'];

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
