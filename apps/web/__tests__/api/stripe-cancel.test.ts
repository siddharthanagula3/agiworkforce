/**
 * Stripe Subscription Cancellation Webhook Tests
 *
 * Tests for customer.subscription.deleted event handling:
 * - Subscription status update to 'canceled'
 * - Credit revocation for canceled subscriptions
 * - Handling canceled_at timestamp from Stripe
 * - Error handling for missing/invalid data
 * - Edge cases for already-canceled subscriptions
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

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: mockLoggerWarn,
    debug: vi.fn(),
  },
}));

// Mock security audit
vi.mock('@/lib/security-audit', () => ({
  logInvalidSignature: vi.fn().mockResolvedValue(undefined),
}));

// Mock Supabase client factory
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockUpdate = vi.fn();

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
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: vi.fn().mockResolvedValue(undefined),
    resetCreditsForNewPeriod: vi.fn().mockResolvedValue(undefined),
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

// Mock price tier mapping
vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: vi.fn(() => 'pro'),
  isValidPlanTier: vi.fn(() => true),
  getTierMapping: vi.fn(() => ({})),
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

    const timestamp = parseInt(timestampPart.split('=')[1], 10);
    const providedSignature = signaturePart.split('=')[1];

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
    retrieve: vi.fn().mockResolvedValue({
      id: 'sub_test_123',
      status: 'canceled',
      items: { data: [{ price: { id: 'price_test' } }] },
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      cancel_at_period_end: false,
      canceled_at: Math.floor(Date.now() / 1000),
    }),
  };
  customers = {
    retrieve: vi.fn().mockResolvedValue({
      id: 'cus_test_123',
      email: 'test@example.com',
      deleted: false,
    }),
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

describe('Stripe Subscription Cancellation Webhook Tests (customer.subscription.deleted)', () => {
  const canceledAt = Math.floor(Date.now() / 1000);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default mock setup for idempotency
    mockRpc.mockResolvedValue({ data: true, error: null });

    // Default mock for update operations
    mockUpdate.mockResolvedValue({ data: null, error: null });

    // Default subscription lookup
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'sub_db_123', user_id: 'user_123' },
            error: null,
          }),
          single: vi.fn().mockResolvedValue({
            data: { id: 'sub_db_123', user_id: 'user_123' },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'sub_db_123' }, error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    // Default credit balance (has credits to revoke)
    mockGetBalance.mockResolvedValue({
      credits_remaining_cents: 500,
      account_id: 'acc_123',
    });

    // Default successful deduction
    mockDeductCredits.mockResolvedValue({
      success: true,
      remaining_cents: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Cancellation Processing', () => {
    it('should update subscription status to canceled', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_success',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_stripe_cancel_123',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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
      expect(mockFrom).toHaveBeenCalledWith('subscriptions');
    });

    it('should revoke remaining credits on cancellation', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_credits',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_stripe_credits',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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
      // Verify CreditService.getBalance was called to check remaining credits
      expect(mockGetBalance).toHaveBeenCalledWith('user_123');
      // Verify credits were deducted (revoked)
      expect(mockDeductCredits).toHaveBeenCalledWith(
        'user_123',
        500, // Remaining credits
        'Credits revoked due to subscription cancellation',
        { type: 'revocation', reason: 'subscription_canceled' },
      );
    });

    it('should use Stripe canceled_at timestamp', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const specificCanceledAt = 1704067200; // 2024-01-01 00:00:00 UTC

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_timestamp',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_stripe_timestamp',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: specificCanceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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

      // Verify logger was called with subscription ID
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({ stripeSubId: 'sub_stripe_timestamp' }),
        expect.any(String),
      );
    });
  });

  describe('Subscription Lookup', () => {
    it('should find subscription by stripe_subscription_id', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_lookup',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_unique_stripe_id',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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

      expect(mockFrom).toHaveBeenCalledWith('subscriptions');
    });

    it('should handle subscription not found in database', async () => {
      // Override subscription lookup to return no subscription
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_not_found',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_nonexistent',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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

      // Should still return 200 (event processed, just no local subscription)
      expect(response.status).toBe(200);
    });
  });

  describe('Credit Revocation', () => {
    it('should not revoke credits if user has zero balance', async () => {
      // Override to return zero balance
      mockGetBalance.mockResolvedValue({
        credits_remaining_cents: 0,
        account_id: 'acc_123',
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_zero_balance',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_zero_balance',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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

      // Should check balance
      expect(mockGetBalance).toHaveBeenCalledWith('user_123');
      // Should NOT call deductCredits since balance is 0
      expect(mockDeductCredits).not.toHaveBeenCalled();
    });

    it('should handle credit revocation failure gracefully', async () => {
      // Override to make deduction fail
      mockDeductCredits.mockResolvedValue({
        success: false,
        error: 'Deduction failed',
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_credit_fail',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_credit_fail',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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

      // Should still return 200 (subscription was canceled, credit error is logged)
      expect(response.status).toBe(200);
    });

    it('should handle getBalance failure gracefully', async () => {
      // Override to make getBalance throw
      mockGetBalance.mockRejectedValue(new Error('Database connection failed'));

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_balance_fail',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_balance_fail',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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

      // Should still return 200
      expect(response.status).toBe(200);
      // Error should be logged
      expect(mockLoggerError).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle cancellation without canceled_at timestamp', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_no_timestamp',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_no_timestamp',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: null, // No canceled_at provided
            items: { data: [{ price: { id: 'price_pro' } }] },
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

      // Should use current timestamp as fallback
      expect(response.status).toBe(200);
    });

    it('should handle database update error', async () => {
      // Override to make update fail
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'sub_db_123', user_id: 'user_123' },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Update failed', code: 'PGRST500' },
          }),
        }),
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_update_fail',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_update_fail',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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

      // Should still process (error is logged)
      expect(response.status).toBe(200);
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('should handle cancellation for subscription without user_id', async () => {
      // Override to return subscription without user_id
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'sub_db_123', user_id: null },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_no_user',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_no_user',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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
      // Should not attempt to revoke credits without user_id
      expect(mockGetBalance).not.toHaveBeenCalled();
    });
  });

  describe('Idempotency', () => {
    it('should skip already processed cancellation events', async () => {
      // Mock idempotency check to return false (already processed)
      mockRpc.mockResolvedValue({ data: false, error: null });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_duplicate',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_duplicate',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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
      // Should not attempt credit revocation for duplicate event
      expect(mockGetBalance).not.toHaveBeenCalled();
    });
  });

  describe('Cancellation Reasons', () => {
    it('should handle immediate cancellation (not at period end)', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_immediate',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_immediate',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            cancel_at_period_end: false, // Immediate cancellation
            items: { data: [{ price: { id: 'price_pro' } }] },
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
      // Should revoke credits immediately
      expect(mockDeductCredits).toHaveBeenCalled();
    });

    it('should handle cancellation at period end', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_period_end',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_period_end',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            cancel_at_period_end: true, // Scheduled cancellation
            items: { data: [{ price: { id: 'price_pro' } }] },
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

  describe('Logging', () => {
    it('should log subscription cancellation with relevant details', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_logging',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_logging_test',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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
        expect.objectContaining({ stripeSubId: 'sub_logging_test' }),
        'Subscription deleted',
      );
    });

    it('should log credit revocation details', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_cancel_credit_log',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_credit_log',
            customer: 'cus_test_123',
            status: 'canceled',
            canceled_at: canceledAt,
            items: { data: [{ price: { id: 'price_pro' } }] },
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

      // Verify credit revocation is logged
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user_123',
          revokedCents: 500,
        }),
        'Credits revoked for canceled subscription',
      );
    });
  });
});
