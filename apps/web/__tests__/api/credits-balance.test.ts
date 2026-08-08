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

const mockGetFreeTrialPublicUsage = vi.fn();
vi.mock('@/lib/services/free-trial-service', () => ({
  getFreeTrialPublicUsage: (...args: unknown[]) => mockGetFreeTrialPublicUsage(...args),
}));

// Mock errors — real implementations so createError.* returns proper AppError instances
vi.mock('@/lib/errors', async () => {
  const actual = await vi.importActual<typeof import('@/lib/errors')>('@/lib/errors');
  return {
    createError: actual.createError,
    AppError: actual.AppError,
    isAppError: actual.isAppError,
  };
});

// Mock Clerk auth
const mockGetClerkAuthUser = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

// Mock cloud database service client (used by CreditService/SubscriptionService)
vi.mock('@/lib/neon-db', () => ({
  getServiceClient: vi.fn(() => ({})),
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
    stripe_price_id: 'price_hobby_monthly',
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

    mockGetClerkAuthUser.mockResolvedValue({ userId: mockUser.id, email: mockUser.email });

    vi.mocked(SubscriptionService.getSubscription).mockResolvedValue(mockSubscription);
    vi.mocked(CreditService.getBalance).mockResolvedValue(mockBalance);
    mockGetFreeTrialPublicUsage.mockResolvedValue({
      usagePercentage: 0,
      resetAt: null,
      hasUsageRemaining: true,
    });
  });

  describe('GET /api/llm/v1/credits/balance', () => {
    describe('Authentication', () => {
      it('should return 401 without authorization header', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance');

        const response = await GET(request);
        expect(response.status).toBe(401);
      });

      it('should return 401 with invalid authorization header format', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Basic invalid' },
        });

        const response = await GET(request);
        expect(response.status).toBe(401);
      });

      it('should return 401 with invalid token', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized('Invalid token'));

        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer invalid-token' },
        });

        const response = await GET(request);
        expect(response.status).toBe(401);
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
      it('should return the public usage contract', async () => {
        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        expect(response.status).toBe(200);
        expect(mockGetClerkAuthUser).toHaveBeenCalledWith(request, {
          apiKeyScope: 'usage:read',
        });

        const data = await response.json();
        expect(data.object).toBe('credit_balance');
        expect(data.subscription).toBeDefined();
        expect(data.credits).toBeDefined();
        expect(data).not.toHaveProperty('formatted');
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

      it('should expose only percentage, reset, and availability fields', async () => {
        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.credits.usage_percentage).toBe(33.33);
        expect(data.credits.has_usage_remaining).toBe(true);
        expect(data.credits.reset_at).toBeDefined();
        expect(data.credits.seconds_until_reset).toBeGreaterThanOrEqual(0);
        expect(data.credits.usage_visible).toBe(true);
        expect(Object.keys(data.credits).sort()).toEqual([
          'has_usage_remaining',
          'reset_at',
          'seconds_until_reset',
          'usage_percentage',
          'usage_visible',
        ]);
        expect(JSON.stringify(data)).not.toMatch(
          /_cents|monthly_allocated|monthly_remaining|formatted|\$/i,
        );
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
        expect(data.credits.usage_percentage).toBe(0);
        expect(data.credits.has_usage_remaining).toBe(false);
      });

      it('should handle null balance', async () => {
        vi.mocked(CreditService.getBalance).mockResolvedValue(null);

        const request = new NextRequest('http://localhost/api/llm/v1/credits/balance', {
          headers: { Authorization: 'Bearer valid-token' },
        });

        const response = await GET(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.credits.usage_percentage).toBe(0);
        expect(data.credits.has_usage_remaining).toBe(false);
      });

      it('uses the rolling Free daily snapshot when no paid ledger exists', async () => {
        vi.mocked(SubscriptionService.getSubscription).mockResolvedValue({
          ...mockSubscription,
          plan_tier: 'free',
        });
        vi.mocked(CreditService.getBalance).mockResolvedValue(null);
        mockGetFreeTrialPublicUsage.mockResolvedValue({
          usagePercentage: 75,
          resetAt: '2026-07-19T12:00:00.000Z',
          hasUsageRemaining: true,
        });

        const response = await GET(
          new NextRequest('http://localhost/api/llm/v1/credits/balance', {
            headers: { Authorization: 'Bearer valid-token' },
          }),
        );
        const data = await response.json();

        // Free still meters and still reports whether it may continue and when
        // the window resets — but its allowance is internal (2026-08-08), so no
        // percentage is published even though the service computed 75.
        expect(data.credits).toMatchObject({
          usage_percentage: null,
          usage_visible: false,
          reset_at: '2026-07-19T12:00:00.000Z',
          has_usage_remaining: true,
        });
        expect(mockGetFreeTrialPublicUsage).toHaveBeenCalledWith(mockUser.id);
      });

      it('never leaks a Free allowance number anywhere in the payload', async () => {
        // Suppression is at the API boundary, not the UI: the response is
        // readable in devtools, so a hidden meter would not withhold anything.
        vi.mocked(SubscriptionService.getSubscription).mockResolvedValue({
          ...mockSubscription,
          plan_tier: 'free',
        });
        vi.mocked(CreditService.getBalance).mockResolvedValue(null);
        mockGetFreeTrialPublicUsage.mockResolvedValue({
          usagePercentage: 93,
          resetAt: '2026-07-19T12:00:00.000Z',
          hasUsageRemaining: true,
        });

        const response = await GET(
          new NextRequest('http://localhost/api/llm/v1/credits/balance', {
            headers: { Authorization: 'Bearer valid-token' },
          }),
        );
        const body = JSON.stringify(await response.json());

        expect(body).not.toContain('93');
        expect(body).not.toMatch(/_cents|allocated|remaining_units/i);
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
