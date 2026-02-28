/**
 * Subscription Service Tests
 *
 * Tests for subscription management, credit allocation, and Stripe sync
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// server-only must be mocked before the service import
vi.mock('server-only', () => ({}));

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock CreditService
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getOrCreateAccount: vi.fn().mockResolvedValue('account-123'),
    resetForPeriod: vi.fn().mockResolvedValue('account-123'),
  },
}));

// Mock price-tier-mapping
vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: vi.fn((metadata, priceId) => {
    if (metadata?.plan_tier) return metadata.plan_tier;
    if (priceId?.includes('hobby')) return 'hobby';
    if (priceId?.includes('pro')) return 'pro';
    if (priceId?.includes('max')) return 'max';
    return null;
  }),
  isValidPlanTier: vi.fn((tier) => ['free', 'hobby', 'pro', 'max', 'enterprise'].includes(tier)),
}));

// Mock Supabase
const mockSupabaseClient = {
  from: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Mock Stripe
const mockStripe = {
  customers: {
    list: vi.fn(),
    create: vi.fn(),
  },
  subscriptions: {
    list: vi.fn(),
  },
};

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(function () {
    return mockStripe;
  }),
}));

// Mock stripe-types helpers
vi.mock('@/lib/stripe-types', () => ({
  getSubscriptionPeriod: vi.fn(() => ({ start: 1704067200, end: 1706745600 })),
  getSubscriptionCouponId: vi.fn(() => null),
}));

// Mock utils/env (requireEnv used by getSupabaseClient in subscription-service)
vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((key: string) => `mock-${key}`),
}));

// Import after mocks
import { SubscriptionService } from '@/lib/services/subscription-service';
import { CreditService } from '@/lib/services/credit-service';

describe('Subscription Service', () => {
  const mockUserId = 'user-123';

  const mockSubscription = {
    id: 'sub-1',
    user_id: mockUserId,
    plan_tier: 'pro',
    status: 'active',
    current_period_start: '2026-01-01T00:00:00Z',
    current_period_end: '2026-02-01T00:00:00Z',
    stripe_subscription_id: 'sub_stripe123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSubscription', () => {
    it('should return subscription for user', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockSubscription, error: null }),
          }),
        }),
      });

      const subscription = await SubscriptionService.getSubscription(mockUserId);

      expect(subscription).toBeDefined();
      expect(subscription?.plan_tier).toBe('pro');
      expect(subscription?.status).toBe('active');
    });

    it('should return null when no subscription found (PGRST116)', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'No rows found' },
            }),
          }),
        }),
      });

      const subscription = await SubscriptionService.getSubscription(mockUserId);
      expect(subscription).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'OTHER', message: 'DB error' },
            }),
          }),
        }),
      });

      await expect(SubscriptionService.getSubscription(mockUserId)).rejects.toMatchObject({
        message: 'DB error',
      });
    });

    it('should default plan_tier to free if null', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...mockSubscription, plan_tier: null },
              error: null,
            }),
          }),
        }),
      });

      const subscription = await SubscriptionService.getSubscription(mockUserId);
      expect(subscription?.plan_tier).toBe('free');
    });

    it('should default status to none if null', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...mockSubscription, status: null },
              error: null,
            }),
          }),
        }),
      });

      const subscription = await SubscriptionService.getSubscription(mockUserId);
      expect(subscription?.status).toBe('none');
    });
  });

  describe('allocateCreditsForPeriod', () => {
    const periodStart = new Date('2026-01-01');
    const periodEnd = new Date('2026-02-01');

    it('should allocate credits for hobby tier (350 cents)', async () => {
      await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'hobby',
        periodStart,
        periodEnd,
      );

      expect(CreditService.getOrCreateAccount).toHaveBeenCalledWith(
        mockUserId,
        'sub-1',
        periodStart,
        periodEnd,
        350,
      );
    });

    it('should allocate credits for pro tier (1200 cents)', async () => {
      await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'pro',
        periodStart,
        periodEnd,
      );

      expect(CreditService.getOrCreateAccount).toHaveBeenCalledWith(
        mockUserId,
        'sub-1',
        periodStart,
        periodEnd,
        1200,
      );
    });

    it('should allocate credits for max tier (15000 cents)', async () => {
      await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'max',
        periodStart,
        periodEnd,
      );

      expect(CreditService.getOrCreateAccount).toHaveBeenCalledWith(
        mockUserId,
        'sub-1',
        periodStart,
        periodEnd,
        15000,
      );
    });

    it('should not allocate credits for free tier', async () => {
      const result = await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'free',
        periodStart,
        periodEnd,
      );

      expect(result).toBe('');
      expect(CreditService.getOrCreateAccount).not.toHaveBeenCalled();
    });

    it('should allocate credits for enterprise tier (100000 cents)', async () => {
      await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'enterprise',
        periodStart,
        periodEnd,
      );

      expect(CreditService.getOrCreateAccount).toHaveBeenCalledWith(
        mockUserId,
        'sub-1',
        periodStart,
        periodEnd,
        100000,
      );
    });

    it('should handle case-insensitive tier names', async () => {
      await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'PRO',
        periodStart,
        periodEnd,
      );

      expect(CreditService.getOrCreateAccount).toHaveBeenCalledWith(
        mockUserId,
        'sub-1',
        periodStart,
        periodEnd,
        1200,
      );
    });
  });

  describe('resetCreditsForNewPeriod', () => {
    const periodStart = new Date('2026-02-01');
    const periodEnd = new Date('2026-03-01');

    it('should reset credits for pro tier', async () => {
      await SubscriptionService.resetCreditsForNewPeriod(
        mockUserId,
        'sub-1',
        'pro',
        periodStart,
        periodEnd,
      );

      expect(CreditService.resetForPeriod).toHaveBeenCalledWith(
        mockUserId,
        'sub-1',
        periodStart,
        periodEnd,
        1200,
      );
    });

    it('should not reset credits for free tier', async () => {
      const result = await SubscriptionService.resetCreditsForNewPeriod(
        mockUserId,
        'sub-1',
        'free',
        periodStart,
        periodEnd,
      );

      expect(result).toBe('');
      expect(CreditService.resetForPeriod).not.toHaveBeenCalled();
    });
  });

  describe('getCreditAllocation', () => {
    it('should return correct credits for each tier', () => {
      expect(SubscriptionService.getCreditAllocation('free')).toBe(0);
      expect(SubscriptionService.getCreditAllocation('hobby')).toBe(350);
      expect(SubscriptionService.getCreditAllocation('pro')).toBe(1200);
      expect(SubscriptionService.getCreditAllocation('max')).toBe(15000);
      expect(SubscriptionService.getCreditAllocation('enterprise')).toBe(100000);
    });

    it('should return 0 for unknown tier', () => {
      expect(SubscriptionService.getCreditAllocation('unknown')).toBe(0);
    });

    it('should handle case-insensitive tier names', () => {
      expect(SubscriptionService.getCreditAllocation('PRO')).toBe(1200);
      expect(SubscriptionService.getCreditAllocation('Hobby')).toBe(350);
    });
  });

  // =========================================================================
  // syncWithStripe
  // =========================================================================
  describe('syncWithStripe', () => {
    const mockUserId = 'user-sync-123';
    const mockEmail = 'user@example.com';
    const mockCustomerId = 'cus_test123';

    // A valid active Stripe subscription object
    const makeStripeSubscription = (
      overrides: Partial<{
        id: string;
        status: string;
        metadata: Record<string, string>;
        cancel_at_period_end: boolean;
        canceled_at: number | null;
        items: { data: Array<{ price: { id: string } }> };
      }> = {},
    ) => ({
      id: 'sub_stripe_active',
      status: 'active',
      metadata: { plan_tier: 'pro' },
      cancel_at_period_end: false,
      canceled_at: null,
      items: {
        data: [{ price: { id: 'price_pro123' } }],
      },
      ...overrides,
    });

    // A reusable upsert chain that succeeds
    function makeUpsertChain(returnData: Record<string, unknown> = {}) {
      return {
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'sub-db-1',
                user_id: mockUserId,
                plan_tier: 'pro',
                status: 'active',
                current_period_start: '2024-01-01T00:00:00Z',
                current_period_end: '2024-02-01T00:00:00Z',
                stripe_subscription_id: 'sub_stripe_active',
                ...returnData,
              },
              error: null,
            }),
          }),
        }),
      };
    }

    // A reusable profile select chain returning no customer id
    function makeProfileSelectChain(customerId: string | null = null) {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: customerId ? { stripe_customer_id: customerId } : { stripe_customer_id: null },
              error: null,
            }),
          }),
        }),
      };
    }

    // Profile check for ensureProfileExists — profile exists
    function makeProfileExistsChain() {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: mockUserId }, error: null }),
          }),
        }),
      };
    }

    beforeEach(() => {
      vi.clearAllMocks();
      // Default: STRIPE_SECRET_KEY is set
      process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    });

    afterEach(() => {
      delete process.env.STRIPE_SECRET_KEY;
    });

    it('returns null when STRIPE_SECRET_KEY is not set', async () => {
      delete process.env.STRIPE_SECRET_KEY;

      const result = await SubscriptionService.syncWithStripe(mockUserId, mockEmail);

      expect(result).toBeNull();
    });

    it('uses stripe_customer_id from profiles when available (best practice path)', async () => {
      // Profile has customer ID
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return makeProfileSelectChain(mockCustomerId);
        }
        return makeUpsertChain();
      });

      // Active subscription found via direct status lookup
      mockStripe.subscriptions.list
        .mockResolvedValueOnce({ data: [makeStripeSubscription()] }) // active
        .mockResolvedValueOnce({ data: [] }); // trialing (won't be reached)

      // Second call to profiles for ensureProfileExists
      let profileCallCount = 0;
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          profileCallCount++;
          if (profileCallCount === 1) {
            return makeProfileSelectChain(mockCustomerId);
          }
          return makeProfileExistsChain();
        }
        return makeUpsertChain();
      });

      const result = await SubscriptionService.syncWithStripe(mockUserId, mockEmail);

      expect(result).not.toBeNull();
      expect(mockStripe.customers.list).not.toHaveBeenCalled();
      expect(result?.plan_tier).toBe('pro');
    });

    it('falls back to email search when no stripe_customer_id in profile', async () => {
      let profileCallCount = 0;
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          profileCallCount++;
          if (profileCallCount === 1) {
            // First call: no customer ID
            return makeProfileSelectChain(null);
          }
          if (profileCallCount === 2) {
            // update call (store customer ID)
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          // ensureProfileExists
          return makeProfileExistsChain();
        }
        return makeUpsertChain();
      });

      mockStripe.customers.list.mockResolvedValueOnce({
        data: [{ id: mockCustomerId, email: mockEmail }],
      });

      mockStripe.subscriptions.list.mockResolvedValueOnce({ data: [makeStripeSubscription()] }); // active

      const result = await SubscriptionService.syncWithStripe(mockUserId, mockEmail);

      expect(mockStripe.customers.list).toHaveBeenCalledWith({ email: mockEmail, limit: 1 });
      expect(result).not.toBeNull();
    });

    it('returns null when no Stripe customer exists for the email', async () => {
      mockSupabaseClient.from.mockImplementation(() => makeProfileSelectChain(null));
      mockStripe.customers.list.mockResolvedValueOnce({ data: [] });

      const result = await SubscriptionService.syncWithStripe(mockUserId, mockEmail);

      expect(result).toBeNull();
    });

    it('syncs an active subscription and allocates credits', async () => {
      let profileCallCount = 0;
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          profileCallCount++;
          if (profileCallCount === 1) return makeProfileSelectChain(mockCustomerId);
          return makeProfileExistsChain();
        }
        return makeUpsertChain();
      });

      mockStripe.subscriptions.list.mockResolvedValueOnce({
        data: [makeStripeSubscription({ status: 'active', metadata: { plan_tier: 'pro' } })],
      });

      const result = await SubscriptionService.syncWithStripe(mockUserId, mockEmail);

      expect(result).not.toBeNull();
      expect(result?.plan_tier).toBe('pro');
      expect(result?.status).toBe('active');
      expect(CreditService.getOrCreateAccount).toHaveBeenCalled();
    });

    it('syncs a trialing subscription and allocates credits', async () => {
      let profileCallCount = 0;
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          profileCallCount++;
          if (profileCallCount === 1) return makeProfileSelectChain(mockCustomerId);
          return makeProfileExistsChain();
        }
        return makeUpsertChain({ status: 'trialing', plan_tier: 'hobby' });
      });

      mockStripe.subscriptions.list
        .mockResolvedValueOnce({ data: [] }) // active — none
        .mockResolvedValueOnce({
          data: [makeStripeSubscription({ status: 'trialing', metadata: { plan_tier: 'hobby' } })],
        }); // trialing

      const result = await SubscriptionService.syncWithStripe(mockUserId, mockEmail);

      expect(result).not.toBeNull();
      expect(CreditService.getOrCreateAccount).toHaveBeenCalled();
    });

    it('does NOT allocate credits for a past_due subscription (regression guard for H3)', async () => {
      // Regression guard: past_due is deliberately excluded from validStatusSet.
      // A customer with only past_due subscriptions should get null returned
      // (no subscription synced, no credits allocated).
      mockSupabaseClient.from.mockImplementation(() => makeProfileSelectChain(mockCustomerId));

      // active → none, trialing → none
      mockStripe.subscriptions.list
        .mockResolvedValueOnce({ data: [] }) // active
        .mockResolvedValueOnce({ data: [] }) // trialing
        // recentSubs fallback — only past_due
        .mockResolvedValueOnce({
          data: [makeStripeSubscription({ status: 'past_due' })],
        });

      const result = await SubscriptionService.syncWithStripe(mockUserId, mockEmail);

      expect(result).toBeNull();
      expect(CreditService.getOrCreateAccount).not.toHaveBeenCalled();
    });

    it('returns null when no valid subscriptions exist for the customer', async () => {
      let profileCallCount = 0;
      mockSupabaseClient.from.mockImplementation(() => {
        profileCallCount++;
        if (profileCallCount === 1) return makeProfileSelectChain(mockCustomerId);
        return makeProfileExistsChain();
      });

      mockStripe.subscriptions.list
        .mockResolvedValueOnce({ data: [] }) // active
        .mockResolvedValueOnce({ data: [] }) // trialing
        .mockResolvedValueOnce({ data: [] }); // recentSubs

      const result = await SubscriptionService.syncWithStripe(mockUserId, mockEmail);

      expect(result).toBeNull();
      expect(CreditService.getOrCreateAccount).not.toHaveBeenCalled();
    });

    it('retries upsert with minimal fields when Supabase returns error code 42703', async () => {
      let profileCallCount = 0;
      let subscriptionsCallCount = 0;

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          profileCallCount++;
          if (profileCallCount === 1) return makeProfileSelectChain(mockCustomerId);
          return makeProfileExistsChain();
        }

        if (table === 'subscriptions') {
          subscriptionsCallCount++;
          if (subscriptionsCallCount === 1) {
            // First upsert: column error
            return {
              upsert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: '42703', message: 'column "stripe_coupon_id" does not exist' },
                  }),
                }),
              }),
            };
          }
          // Second upsert (fallback with minimal fields): success
          return makeUpsertChain();
        }

        return makeProfileExistsChain();
      });

      mockStripe.subscriptions.list.mockResolvedValueOnce({
        data: [makeStripeSubscription({ status: 'active', metadata: { plan_tier: 'pro' } })],
      });

      const result = await SubscriptionService.syncWithStripe(mockUserId, mockEmail);

      expect(result).not.toBeNull();
      // Both upsert calls should have been made
      expect(subscriptionsCallCount).toBe(2);
    });

    it('returns null (not throws) for Stripe resource_missing errors', async () => {
      mockSupabaseClient.from.mockImplementation(() => makeProfileSelectChain(mockCustomerId));

      mockStripe.subscriptions.list.mockRejectedValueOnce(
        new Error('No such customer: resource_missing'),
      );

      const result = await SubscriptionService.syncWithStripe(mockUserId, mockEmail);

      expect(result).toBeNull();
    });

    it('propagates unexpected Stripe errors (does not swallow them)', async () => {
      mockSupabaseClient.from.mockImplementation(() => makeProfileSelectChain(mockCustomerId));

      mockStripe.subscriptions.list.mockRejectedValueOnce(new Error('Unexpected API failure'));

      await expect(SubscriptionService.syncWithStripe(mockUserId, mockEmail)).rejects.toThrow(
        'Unexpected API failure',
      );
    });
  });
});
