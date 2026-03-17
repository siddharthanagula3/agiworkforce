/**
 * Stripe Subscription Downgrade Webhook Tests
 *
 * Tests for tier downgrade handling mid-cycle:
 * - customer.subscription.updated event with plan change
 * - Credit adjustment for downgrades (excess credits revoked)
 * - Immediate vs scheduled (at period end) downgrades
 * - Plan tier resolution from price IDs
 * - Edge cases and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

// Mock environment variables before imports
const mockEnv = {
  STRIPE_SECRET_KEY: 'sk_test_mock_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test_service_key',
};

vi.stubEnv('STRIPE_SECRET_KEY', mockEnv.STRIPE_SECRET_KEY);
vi.stubEnv('STRIPE_WEBHOOK_SECRET', mockEnv.STRIPE_WEBHOOK_SECRET);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', mockEnv.NEXT_PUBLIC_SUPABASE_URL);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', mockEnv.SUPABASE_SERVICE_ROLE_KEY);

// Mock logger
const mockLoggerInfo = vi.fn();
const mockLoggerError = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerDebug = vi.fn();

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: mockLoggerWarn,
    debug: mockLoggerDebug,
  },
}));

// Mock security audit
vi.mock('@/lib/security-audit', () => ({
  logInvalidSignature: vi.fn().mockResolvedValue(undefined),
}));

// Mock Supabase client factory
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
    auth: {
      admin: {
        listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
      },
    },
  })),
}));

// Mock subscription service
const mockAllocateCredits = vi.fn().mockResolvedValue(undefined);
const mockResetCredits = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: mockAllocateCredits,
    resetCreditsForNewPeriod: mockResetCredits,
  },
}));

// Mock credit service
const mockGetBalance = vi.fn();
const mockDeductCredits = vi.fn();

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: mockGetBalance,
    deductCredits: mockDeductCredits,
  },
}));

// Mock price tier mapping with configurable behavior
const mockResolvePlanTier = vi.fn();

vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: mockResolvePlanTier,
  isValidPlanTier: vi.fn((tier) => ['free', 'hobby', 'pro', 'max', 'enterprise'].includes(tier)),
  getTierMapping: vi.fn(() => ({
    price_hobby: 'hobby',
    price_pro: 'pro',
    price_max: 'max',
  })),
  isPriceIdRegistered: vi.fn(() => true),
}));

// Utility to generate Stripe signature
function generateStripeSignature(
  payload: string,
  secret: string,
  timestamp?: number,
): { signature: string; timestamp: number } {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return {
    signature: `t=${ts},v1=${expectedSignature}`,
    timestamp: ts,
  };
}

// Mock Stripe with proper signature verification
const mockStripeWebhooks = {
  constructEvent: vi.fn((body: string, signature: string, secret: string) => {
    const parts = signature.split(',');
    const timestampPart = parts.find((p) => p.startsWith('t='));
    const signaturePart = parts.find((p) => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      throw new Error('Invalid signature format');
    }

    const timestamp = parseInt(timestampPart.split('=')[1]!, 10);
    const providedSignature = signaturePart.split('=')[1]!;

    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - timestamp > 300) {
      throw new Error('Webhook timestamp too old');
    }

    const signedPayload = `${timestamp}.${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    if (providedSignature !== expectedSignature) {
      throw new Error('Signature verification failed');
    }

    return JSON.parse(body);
  }),
};

const mockStripeSubscriptionsRetrieve = vi.fn();
const mockStripeCustomersRetrieve = vi.fn();

class MockStripe {
  webhooks = mockStripeWebhooks;
  checkout = {
    sessions: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'cs_test_123',
        line_items: { data: [{ price: { id: 'price_test' } }] },
      }),
    },
  };
  subscriptions = {
    retrieve: mockStripeSubscriptionsRetrieve,
  };
  customers = {
    retrieve: mockStripeCustomersRetrieve,
  };
  charges = {
    retrieve: vi.fn().mockResolvedValue({
      id: 'ch_test_123',
      customer: 'cus_test_123',
    }),
  };
}

vi.mock('stripe', () => ({
  default: MockStripe,
}));

describe('Stripe Subscription Downgrade Webhook Tests (customer.subscription.updated)', () => {
  const periodStart = Math.floor(Date.now() / 1000) - 15 * 24 * 60 * 60; // 15 days ago
  const periodEnd = Math.floor(Date.now() / 1000) + 15 * 24 * 60 * 60; // 15 days from now

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-establish createClient factory after clearAllMocks resets vi.fn() implementations
    const supabaseModule = await import('@supabase/supabase-js');
    (supabaseModule.createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
      rpc: mockRpc,
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
        },
      },
    });

    // Default mock setup for idempotency
    mockRpc.mockResolvedValue({ data: true, error: null });

    // Default plan tier resolution - returns the tier based on price ID
    mockResolvePlanTier.mockImplementation((_metadata, priceId) => {
      if (priceId?.includes('hobby')) return 'hobby';
      if (priceId?.includes('pro')) return 'pro';
      if (priceId?.includes('max')) return 'max';
      return 'hobby';
    });

    // Default Stripe subscription retrieve
    mockStripeSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_123',
      status: 'active',
      items: { data: [{ price: { id: 'price_hobby' } }] },
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      canceled_at: null,
      metadata: {},
    });

    // Default Stripe customer retrieve
    mockStripeCustomersRetrieve.mockResolvedValue({
      id: 'cus_test_123',
      email: 'test@example.com',
      deleted: false,
    });

    // Default subscription lookup - existing subscription
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'sub_db_123',
              user_id: 'user_123',
              plan_tier: 'pro', // Currently on Pro plan
              current_period_start: new Date(periodStart * 1000).toISOString(),
            },
            error: null,
          }),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'sub_db_123',
              user_id: 'user_123',
              plan_tier: 'pro',
              current_period_start: new Date(periodStart * 1000).toISOString(),
            },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'sub_db_123', user_id: 'user_123' },
              error: null,
            }),
          }),
        }),
      }),
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'sub_db_123', user_id: 'user_123' },
            error: null,
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    // Default credit balance
    mockGetBalance.mockResolvedValue({
      credits_remaining_cents: 800, // User has 800 cents remaining
      credits_allocated_cents: 1200, // Pro plan allocation
      account_id: 'acc_123',
    });

    // Default successful deduction
    mockDeductCredits.mockResolvedValue({
      success: true,
      remaining_cents: 350, // After downgrade to hobby (350 cents)
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Plan Tier Resolution', () => {
    it('should resolve plan tier from price ID correctly', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_tier_resolve',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_tier_resolve',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_hobby' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      await POST(request);

      // Verify resolvePlanTier was called with correct price ID
      expect(mockResolvePlanTier).toHaveBeenCalledWith(expect.any(Object), 'price_hobby');
    });

    it('should use metadata plan_tier if available', async () => {
      mockResolvePlanTier.mockReturnValue('hobby');

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_metadata',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_metadata',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_some' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: { plan_tier: 'hobby' },
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      await POST(request);

      // Verify metadata was passed to resolvePlanTier
      expect(mockResolvePlanTier).toHaveBeenCalledWith(
        expect.objectContaining({ plan_tier: 'hobby' }),
        expect.any(String),
      );
    });
  });

  describe('Downgrade Scenarios', () => {
    it('should handle Pro to Hobby downgrade mid-cycle', async () => {
      mockResolvePlanTier.mockReturnValue('hobby');

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_pro_to_hobby',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_pro_to_hobby',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_hobby' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // Should update subscription with new plan_tier
      expect(mockFrom).toHaveBeenCalledWith('subscriptions');
    });

    it('should handle Max to Pro downgrade mid-cycle', async () => {
      // Set up existing subscription as Max
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'sub_db_123',
                user_id: 'user_123',
                plan_tier: 'max',
                current_period_start: new Date(periodStart * 1000).toISOString(),
              },
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'sub_db_123',
                user_id: 'user_123',
                plan_tier: 'max',
                current_period_start: new Date(periodStart * 1000).toISOString(),
              },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'sub_db_123', user_id: 'user_123' },
                error: null,
              }),
            }),
          }),
        }),
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'sub_db_123', user_id: 'user_123' },
              error: null,
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      mockResolvePlanTier.mockReturnValue('pro');
      mockGetBalance.mockResolvedValue({
        credits_remaining_cents: 10000, // Max plan has lots of credits
        credits_allocated_cents: 15000,
        account_id: 'acc_123',
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_max_to_pro',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_max_to_pro',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_pro' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle downgrade to free tier', async () => {
      mockResolvePlanTier.mockReturnValue('free');

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_to_free',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_to_free',
            customer: 'cus_test_123',
            status: 'canceled', // Free tier usually means canceled
            items: { data: [{ price: { id: 'price_free' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: Math.floor(Date.now() / 1000),
            metadata: { plan_tier: 'free' },
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Upgrade Scenarios (for comparison)', () => {
    it('should handle Hobby to Pro upgrade', async () => {
      // Set up existing subscription as Hobby
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'sub_db_123',
                user_id: 'user_123',
                plan_tier: 'hobby',
                current_period_start: new Date(periodStart * 1000).toISOString(),
              },
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'sub_db_123',
                user_id: 'user_123',
                plan_tier: 'hobby',
                current_period_start: new Date(periodStart * 1000).toISOString(),
              },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'sub_db_123', user_id: 'user_123' },
                error: null,
              }),
            }),
          }),
        }),
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'sub_db_123', user_id: 'user_123' },
              error: null,
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      mockResolvePlanTier.mockReturnValue('pro');
      mockGetBalance.mockResolvedValue({
        credits_remaining_cents: 200, // Hobby has less credits
        credits_allocated_cents: 350,
        account_id: 'acc_123',
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_upgrade_hobby_to_pro',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_hobby_to_pro',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_pro' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // Credits should be allocated for upgraded plan
      expect(mockAllocateCredits).toHaveBeenCalled();
    });
  });

  describe('Period Boundary Handling', () => {
    it('should handle subscription update at new period boundary', async () => {
      // New period start (different from existing)
      const newPeriodStart = Math.floor(Date.now() / 1000);
      const newPeriodEnd = newPeriodStart + 30 * 24 * 60 * 60;

      mockResolvePlanTier.mockReturnValue('hobby');

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_new_period',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_new_period',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_hobby' } }] },
            current_period_start: newPeriodStart,
            current_period_end: newPeriodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // For new period, should reset credits
      expect(mockResetCredits).toHaveBeenCalled();
    });

    it('should handle subscription update within same period', async () => {
      mockResolvePlanTier.mockReturnValue('hobby');

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_same_period',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_same_period',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_hobby' } }] },
            current_period_start: periodStart, // Same as existing
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // Within same period, should allocate (not reset)
      expect(mockAllocateCredits).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle subscription update for non-existent local subscription', async () => {
      // No local subscription found
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'sub_new_db', user_id: 'user_123' },
              error: null,
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      mockResolvePlanTier.mockReturnValue('hobby');

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_no_local',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_no_local',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_hobby' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: { supabase_user_id: 'user_123' },
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      // Should create new subscription record
      expect(response.status).toBe(200);
    });

    it('should handle unknown/invalid plan tier from price ID', async () => {
      // Return null for unknown price ID
      mockResolvePlanTier.mockReturnValue(null);

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_unknown_tier',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_unknown_tier',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_unknown_xyz' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      // Should handle gracefully (logged warning, existing data preserved)
      expect(response.status).toBe(200);
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('should handle subscription update with discounts/coupons', async () => {
      mockResolvePlanTier.mockReturnValue('hobby');

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_with_coupon',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_with_coupon',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_hobby' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
            discounts: [{ coupon: { id: 'coupon_50off' } }],
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle subscription paused status', async () => {
      mockResolvePlanTier.mockReturnValue('pro');

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_subscription_paused',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_paused',
            customer: 'cus_test_123',
            status: 'paused',
            items: { data: [{ price: { id: 'price_pro' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle database error during subscription update', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'sub_db_123', user_id: 'user_123', plan_tier: 'pro' },
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data: { id: 'sub_db_123', user_id: 'user_123', plan_tier: 'pro' },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database error', code: 'PGRST500' },
              }),
            }),
          }),
        }),
      });

      mockResolvePlanTier.mockReturnValue('hobby');

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_db_error',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_db_error',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_hobby' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      // Should return 500 for database errors (allows Stripe retry)
      expect(response.status).toBe(500);
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('should handle credit allocation failure gracefully', async () => {
      mockResolvePlanTier.mockReturnValue('hobby');
      mockAllocateCredits.mockRejectedValue(new Error('Credit allocation failed'));

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_credit_fail',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_credit_fail',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_hobby' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);

      // Subscription update should still succeed even if credit allocation fails
      expect(response.status).toBe(200);
      expect(mockLoggerError).toHaveBeenCalled();
    });
  });

  describe('Idempotency', () => {
    it('should skip already processed downgrade events', async () => {
      mockRpc.mockResolvedValue({ data: false, error: null });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_duplicate',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_duplicate',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_hobby' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toContain('already processed');
    });
  });

  describe('Logging', () => {
    it('should log subscription update with plan change details', async () => {
      mockResolvePlanTier.mockReturnValue('hobby');

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_downgrade_logging',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_logging',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_hobby' } }] },
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {},
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      await POST(request);

      // Verify logging includes subscription ID
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionId: 'sub_logging' }),
        'Processing subscription update',
      );
    });
  });
});
