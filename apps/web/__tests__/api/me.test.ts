import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

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
  withCorsRoute: (handler: (...args: unknown[]) => unknown) => handler,
}));

const mockClerkAuth = vi.fn(() => Promise.resolve({ userId: 'user-123' }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

vi.mock('@/lib/neon-db', () => ({
  getServiceClient: vi.fn(() => ({})),
}));

const mockNeonQuery = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('account_status')) {
        return Promise.resolve([]);
      }
      if (typeof sql === 'string' && sql.includes('user_settings')) {
        return Promise.resolve([]);
      }
      return mockNeonQuery(sql, params);
    },
    execute: vi.fn().mockResolvedValue(1),
    transaction: vi.fn(async (fn: (db: unknown) => unknown) =>
      fn({
        query: (sql: string, params: unknown[]) => {
          if (typeof sql === 'string' && sql.includes('set_config')) {
            return Promise.resolve([]);
          }
          return mockNeonQuery(sql, params);
        },
        execute: (sql: string) => {
          if (sql === 'set local role app_rls') {
            return Promise.resolve(0);
          }
          return Promise.resolve(1);
        },
      }),
    ),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

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

import { GET, OPTIONS } from '@/app/api/me/route';

describe('Me API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockClerkAuth.mockResolvedValue({ userId: 'user-123' });

    mockNeonQuery.mockResolvedValue([{ routing_preferences: null }]);

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
      it('fails closed when subscription entitlement cannot be verified', async () => {
        mockMeGetSubscription.mockRejectedValueOnce(new Error('Subscription fetch failed'));

        const request = new NextRequest('http://localhost/api/me', {
          method: 'GET',
        });

        const response = await GET(request);
        expect(response.status).toBe(500);
        const data = await response.json();
        expect(data).not.toHaveProperty('plan');
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
