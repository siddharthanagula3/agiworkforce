/**
 * Me API Tests
 *
 * Tests for the /api/me endpoint that returns user profile and subscription info
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

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

// Clerk auth mock — hoisted so it survives clearAllMocks
const mockClerkAuth = vi.fn(() => Promise.resolve({ userId: 'user-123' }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

// cloud database service client mock (used by SubscriptionService/CreditService)
vi.mock('@/lib/neon-db', () => ({
  getServiceClient: vi.fn(() => ({})),
}));

// Neon DB mock (used for routing_preferences)
const mockNeonQuery = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (sql: string, params: unknown[]) => {
      // assertAccountActive() in getClerkAuthUser issues its own account_status
      // lookup ahead of the route's real query; keep it out of mockNeonQuery's queue.
      if (typeof sql === 'string' && sql.includes('account_status')) {
        return Promise.resolve([]);
      }
      return mockNeonQuery(sql, params);
    },
    execute: vi.fn().mockResolvedValue(1),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

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

// Import after mocks
import { GET, OPTIONS } from '@/app/api/me/route';

describe('Me API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish auth mock defaults after clearAllMocks
    mockClerkAuth.mockResolvedValue({ userId: 'user-123' });

    // Neon: routing_preferences returns empty by default
    mockNeonQuery.mockResolvedValue([{ routing_preferences: null }]);

    // Re-establish service mock defaults after clearAllMocks
    mockMeGetSubscription.mockResolvedValue({
      id: 'sub-test',
      user_id: 'user-123',
      plan_tier: 'pro',
      status: 'active',
      current_period_start: new Date('2024-12-01T00:00:00Z'),
      current_period_end: new Date('2024-12-31T00:00:00Z'),
      stripe_subscription_id: 'sub_test123',
      stripe_price_id: 'price_pro_monthly',
    });
    mockMeGetBalance.mockResolvedValue({
      available_cents: 1000,
      used_cents: 200,
      total_cents: 1200,
    });
  });

  describe('GET /api/me', () => {
    describe('Authentication', () => {
      it('should return 200 for authenticated request', async () => {
        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.id).toBe('user-123');
      });

      it('should return 401 for unauthenticated request', async () => {
        mockClerkAuth.mockResolvedValueOnce({ userId: null as unknown as string });

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        expect(response.status).toBe(401);
      });

      it('should return user id from Clerk', async () => {
        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.id).toBe('user-123');
      });
    });

    describe('Plan Information', () => {
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

      it('should default to free tier when subscription is missing', async () => {
        mockMeGetSubscription.mockResolvedValueOnce(null);

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.plan.tier).toBe('free');
        expect(data.plan.status).toBe('none');
      });
    });

    describe('Feature Flags', () => {
      it('should include feature flags', async () => {
        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.feature_flags).toBeDefined();
        expect(data.feature_flags.beta_features).toBe(true);
        // Pro tier exposes the Advanced-mode manual picker
        expect(data.feature_flags.advanced_model_access).toBe(true);
      });

      it('should set advanced_model_access true for hobby/basic tier (2026-07-16 ladder: basic carries pro policy)', async () => {
        mockMeGetSubscription.mockResolvedValueOnce({
          id: 'sub-test',
          user_id: 'user-123',
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

        expect(data.feature_flags.advanced_model_access).toBe(true);
      });

      it('should enable advanced_model_access for max tier', async () => {
        mockMeGetSubscription.mockResolvedValueOnce({
          id: 'sub-test-max',
          user_id: 'user-123',
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

    describe('Managed usage privacy', () => {
      it('does not expose private credit balance operands', async () => {
        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data).not.toHaveProperty('credits');
        expect(mockMeGetBalance).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should handle subscription fetch error gracefully', async () => {
        mockMeGetSubscription.mockRejectedValueOnce(new Error('Subscription fetch failed'));

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.plan.tier).toBe('free'); // Falls back to free
      });
    });

    describe('Routing Preferences', () => {
      it('should include routing_preferences from Neon', async () => {
        mockNeonQuery.mockResolvedValueOnce([{ routing_preferences: { us_only: true } }]);

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.routing_preferences).toEqual({ us_only: true });
      });

      it('should return empty routing_preferences when DB query fails', async () => {
        mockNeonQuery.mockRejectedValueOnce(new Error('DB error'));

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.routing_preferences).toEqual({});
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
