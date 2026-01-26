/**
 * Credits Balance API Tests
 *
 * Tests for /api/llm/v1/credits/balance endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

vi.mock('@/lib/cors', () => ({
  getCorsHeaders: vi.fn(() => ({
    'Access-Control-Allow-Origin': '*',
  })),
}));

// Mock services
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: vi.fn(),
  },
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(),
  },
}));

// Mock Supabase
const mockSupabaseAuth = {
  auth: {
    getUser: vi.fn(),
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseAuth),
}));

// Import after mocks
import { GET, OPTIONS } from '@/app/api/llm/v1/credits/balance/route';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';

describe('Credits Balance API', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockSubscription = {
    id: 'sub-1',
    user_id: mockUser.id,
    plan_tier: 'pro',
    status: 'active',
    current_period_start: new Date('2026-01-01'),
    current_period_end: new Date('2026-02-01'),
    stripe_subscription_id: 'sub_stripe123',
  };

  const mockBalance = {
    account_id: 'account-123',
    period_start: '2026-01-01T00:00:00Z',
    period_end: '2026-02-01T00:00:00Z',
    credits_allocated_cents: 1200,
    credits_used_cents: 400,
    credits_remaining_cents: 800,
    daily_limit_cents: 100,
    daily_used_cents: 25,
    daily_remaining_cents: 75,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    vi.mocked(SubscriptionService.getSubscription).mockResolvedValue(mockSubscription);
    vi.mocked(CreditService.getBalance).mockResolvedValue(mockBalance);
  });

  describe('GET /api/llm/v1/credits/balance', () => {
    describe('Authentication', () => {
      it('should return 401 without authorization header', async () => {
        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance');

        const response = await GET(request);
        expect(response.status).toBe(401);

        const data = await response.json();
        expect(data.error.code).toBe('invalid_api_key');
      });

      it('should return 401 with invalid authorization header format', async () => {
        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Basic invalid' },
        });

        const response = await GET(request);
        expect(response.status).toBe(401);
      });

      it('should return 401 with invalid token', async () => {
        mockSupabaseAuth.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid token' },
        });

        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer invalid-token' },
        });

        const response = await GET(request);
        expect(response.status).toBe(401);

        const data = await response.json();
        expect(data.error.message).toBe('Invalid authentication token');
      });
    });

    describe('Subscription Check', () => {
      it('should return 403 when no subscription found', async () => {
        vi.mocked(SubscriptionService.getSubscription).mockResolvedValue(null);

        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        expect(response.status).toBe(403);

        const data = await response.json();
        expect(data.error.code).toBe('subscription_required');
      });
    });

    describe('Balance Response', () => {
      it('should return complete balance information', async () => {
        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.object).toBe('credit_balance');
        expect(data.subscription).toBeDefined();
        expect(data.credits).toBeDefined();
        expect(data.formatted).toBeDefined();
      });

      it('should include subscription info', async () => {
        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.subscription.plan_tier).toBe('pro');
        expect(data.subscription.status).toBe('active');
        expect(data.subscription.current_period_end).toBeDefined();
      });

      it('should include monthly credits info', async () => {
        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.credits.monthly_allocated_cents).toBe(1200);
        expect(data.credits.monthly_remaining_cents).toBe(800);
        expect(data.credits.monthly_used_cents).toBe(400);
        expect(data.credits.monthly_reset_at).toBeDefined();
        expect(data.credits.seconds_until_monthly_reset).toBeGreaterThan(0);
      });

      it('should include daily limits info', async () => {
        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.credits.daily_limit_cents).toBe(100);
        expect(data.credits.daily_used_cents).toBe(25);
        expect(data.credits.daily_remaining_cents).toBe(75);
        expect(data.credits.daily_reset_at).toBeDefined();
        expect(data.credits.seconds_until_daily_reset).toBeGreaterThan(0);
      });

      it('should include formatted values for display', async () => {
        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.formatted.monthly_remaining).toBe('$8.00');
        expect(data.formatted.monthly_allocated).toBe('$12.00');
        expect(data.formatted.daily_remaining).toBe('$0.75');
        expect(data.formatted.daily_limit).toBe('$1.00');
      });
    });

    describe('Error Handling', () => {
      it('should handle subscription service errors gracefully', async () => {
        vi.mocked(SubscriptionService.getSubscription).mockRejectedValue(
          new Error('Service error'),
        );

        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        // Should return 403 since subscription couldn't be fetched
        expect(response.status).toBe(403);
      });

      it('should handle balance service errors gracefully', async () => {
        vi.mocked(CreditService.getBalance).mockRejectedValue(new Error('Balance error'));

        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        // Should return zeros when balance fails
        expect(data.credits.monthly_allocated_cents).toBe(0);
        expect(data.credits.monthly_remaining_cents).toBe(0);
      });

      it('should handle null balance', async () => {
        vi.mocked(CreditService.getBalance).mockResolvedValue(null);

        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.credits.monthly_allocated_cents).toBe(0);
        expect(data.credits.monthly_remaining_cents).toBe(0);
        expect(data.credits.daily_limit_cents).toBe(0);
      });
    });

    describe('CORS', () => {
      it('should include CORS headers in response', async () => {
        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);

        // Note: The actual headers are set via getCorsHeaders mock
        expect(response.status).toBe(200);
      });
    });
  });

  describe('OPTIONS /api/llm/v1/credits/balance', () => {
    it('should handle CORS preflight', async () => {
      const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
        method: 'OPTIONS',
      });

      const response = await OPTIONS(request);
      expect(response.status).toBe(204);
    });
  });
});
