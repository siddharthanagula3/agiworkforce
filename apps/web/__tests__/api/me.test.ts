/**
 * Me API Tests
 *
 * Tests for the /api/me endpoint that returns user profile and subscription info
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
  handleCorsPreflightRequest: vi.fn(() => null),
}));

// Mock environment variables
vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((key: string) => {
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') return 'https://test.supabase.co';
    if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') return 'test-anon-key';
    return 'test-value';
  }),
}));

// Mock user data
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  user_metadata: {
    full_name: 'Test User',
    avatar_url: 'https://example.com/avatar.png',
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-06-01T00:00:00Z',
};

// Mock services — use vi.hoisted() so they're available in vi.mock() factories
const { mockMeGetSubscription, mockMeGetBalance } = vi.hoisted(() => ({
  mockMeGetSubscription: vi.fn(),
  mockMeGetBalance: vi.fn(),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: mockMeGetSubscription,
  },
}));

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: mockMeGetBalance,
  },
}));

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn((name: string) => {
      if (name === 'sb-test-auth-token') {
        return { value: 'mock-token' };
      }
      return undefined;
    }),
    set: vi.fn(),
  }),
}));

// Module-level mock fns for Supabase auth — hoisted so they're available in vi.mock()
const { mockSsrGetUser, mockJsGetUser } = vi.hoisted(() => ({
  mockSsrGetUser: vi.fn(),
  mockJsGetUser: vi.fn(),
}));

// Mock Supabase SSR client — the route calls auth.getUser() (not getSession)
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockSsrGetUser,
    },
  })),
}));

// Mock Supabase JS client for Bearer token auth
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockJsGetUser,
    },
  })),
}));

// Import after mocks
import { GET, OPTIONS } from '@/app/api/me/route';

describe('Me API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish auth mock defaults after clearAllMocks
    mockSsrGetUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
    mockJsGetUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    // Re-establish service mock defaults after clearAllMocks
    mockMeGetSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_end: '2024-12-31T00:00:00Z',
    });
    mockMeGetBalance.mockResolvedValue({
      available_cents: 1000,
      used_cents: 200,
      total_cents: 1200,
    });
  });

  describe('GET /api/me', () => {
    describe('Cookie-based Authentication (Web)', () => {
      it('should return user profile with subscription info', async () => {
        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.id).toBe('user-123');
        expect(data.email).toBe('test@example.com');
        expect(data.name).toBe('Test User');
        expect(data.avatar_url).toBe('https://example.com/avatar.png');
      });

      it('should include plan information', async () => {
        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.plan).toBeDefined();
        expect(data.plan.tier).toBe('pro');
        expect(data.plan.status).toBe('active');
        expect(data.plan.display_name).toBe('Pro');
      });

      it('should include feature flags', async () => {
        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.feature_flags).toBeDefined();
        expect(data.feature_flags.beta_features).toBe(true);
        // Pro tier exposes the Advanced-mode manual picker per
        // parallel-spinning-hedgehog §6 (Round 13 — Task #26 consolidation).
        expect(data.feature_flags.advanced_model_access).toBe(true);
      });

      it('should include credit balance', async () => {
        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.credits).toBeDefined();
        expect(data.credits.available_cents).toBe(1000);
      });

      it('should return 401 for unauthenticated request', async () => {
        // Override mock to return no user
        mockSsrGetUser.mockResolvedValueOnce({
          data: { user: null },
          error: { message: 'No session' },
        });

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        expect(response.status).toBe(401);
      });
    });

    describe('Bearer Token Authentication (Desktop/Mobile)', () => {
      it('should authenticate with Bearer token', async () => {
        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer valid-token-123',
          },
        });

        const response = await GET(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.id).toBe('user-123');
      });

      it('should return 401 for invalid Bearer token', async () => {
        // Override mock to return error for Bearer token auth
        mockJsGetUser.mockResolvedValueOnce({
          data: { user: null },
          error: { message: 'Invalid token' },
        });

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer invalid-token',
          },
        });

        const response = await GET(request);
        expect(response.status).toBe(401);
      });
    });

    describe('Error Handling', () => {
      it('should handle subscription fetch error gracefully', async () => {
        const { SubscriptionService } = await import('@/lib/services/subscription-service');
        vi.mocked(SubscriptionService.getSubscription).mockRejectedValueOnce(
          new Error('Subscription fetch failed'),
        );

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.plan.tier).toBe('free'); // Falls back to free
      });

      it('should handle credit balance fetch error gracefully', async () => {
        const { CreditService } = await import('@/lib/services/credit-service');
        vi.mocked(CreditService.getBalance).mockRejectedValueOnce(new Error('Credit fetch failed'));

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.credits).toBeNull();
      });
    });

    describe('User Data', () => {
      it('should use email username when full_name is not set', async () => {
        const userWithoutName = {
          ...mockUser,
          user_metadata: {},
        };

        mockSsrGetUser.mockResolvedValueOnce({
          data: { user: userWithoutName },
          error: null,
        });

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.name).toBe('test'); // From test@example.com
      });

      it('should convert timestamps to Unix seconds', async () => {
        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        // created_at should be Unix timestamp in seconds
        expect(typeof data.created_at).toBe('number');
        expect(data.created_at).toBeGreaterThan(0);
      });
    });

    describe('Feature Flags', () => {
      it('should set advanced_model_access based on plan tier', async () => {
        // Test with free tier
        const { SubscriptionService } = await import('@/lib/services/subscription-service');
        vi.mocked(SubscriptionService.getSubscription).mockResolvedValueOnce({
          id: 'sub-test',
          user_id: mockUser.id,
          plan_tier: 'hobby',
          status: 'active',
          current_period_start: new Date('2024-12-01T00:00:00Z'),
          current_period_end: new Date('2024-12-31T00:00:00Z'),
          stripe_subscription_id: 'sub_test123',
          stripe_price_id: 'price_hobby_monthly',
        });

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.feature_flags.advanced_model_access).toBe(false); // hobby tier
      });

      it('should enable advanced_model_access for max tier', async () => {
        const { SubscriptionService } = await import('@/lib/services/subscription-service');
        vi.mocked(SubscriptionService.getSubscription).mockResolvedValueOnce({
          id: 'sub-test-max',
          user_id: mockUser.id,
          plan_tier: 'max',
          status: 'active',
          current_period_start: new Date('2024-12-01T00:00:00Z'),
          current_period_end: new Date('2024-12-31T00:00:00Z'),
          stripe_subscription_id: 'sub_test_max',
          stripe_price_id: 'price_max_monthly',
        });

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.feature_flags.advanced_model_access).toBe(true);
      });
    });
  });

  describe('OPTIONS /api/me', () => {
    it('should handle CORS preflight', async () => {
      const request = new NextRequest('http://localhost/api/me', {
        method: 'OPTIONS',
      });

      const response = await OPTIONS(request);
      expect(response.status).toBe(204);
    });
  });
});
