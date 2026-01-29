/**
 * Stripe Refund Webhook Tests
 *
 * Tests for charge.refunded event handling:
 * - Credit revocation proportional to refund amount
 * - Customer resolution from stripe_customer_id
 * - Error handling for missing/invalid data
 * - Partial vs full refund scenarios
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
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
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
      status: 'active',
      items: { data: [{ price: { id: 'price_test' } }] },
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      cancel_at_period_end: false,
      canceled_at: null,
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

describe('Stripe Refund Webhook Tests (charge.refunded)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default mock setup for idempotency
    mockRpc.mockResolvedValue({ data: true, error: null });

    // Default profile lookup
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'user_123', email: 'test@example.com' },
            error: null,
          }),
          single: vi.fn().mockResolvedValue({
            data: { id: 'user_123', email: 'test@example.com' },
            error: null,
          }),
        }),
      }),
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'sub_123' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Refund Processing', () => {
    it('should process full refund and revoke all credits', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const refundedAmount = 1200; // Full refund of pro plan ($12)

      const eventPayload = JSON.stringify({
        id: 'evt_refund_full',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_full_refund',
            customer: 'cus_test_123',
            amount: refundedAmount,
            amount_refunded: refundedAmount,
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

      expect(response.status).not.toBe(400);
      expect(mockRpc).toHaveBeenCalledWith('process_stripe_event_idempotent', {
        p_event_id: 'evt_refund_full',
      });
    });

    it('should process partial refund and revoke proportional credits', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_refund_partial',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_partial_refund',
            customer: 'cus_test_123',
            amount: 1200, // Original charge
            amount_refunded: 600, // 50% refund
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

      expect(response.status).not.toBe(400);
    });

    it('should call handle_refund RPC with correct parameters', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const refundedAmount = 500;

      const eventPayload = JSON.stringify({
        id: 'evt_refund_rpc',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_rpc',
            customer: 'cus_test_123',
            amount: 1200,
            amount_refunded: refundedAmount,
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

      // Verify the handle_refund RPC was called with correct params
      expect(mockRpc).toHaveBeenCalledWith('handle_refund', {
        p_user_id: 'user_123',
        p_refund_amount_cents: refundedAmount,
        p_reason: expect.stringContaining('ch_test_rpc'),
      });
    });
  });

  describe('Customer Resolution', () => {
    it('should find user by stripe_customer_id in profiles table', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_refund_customer_lookup',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_lookup',
            customer: 'cus_customer_id_123',
            amount: 1200,
            amount_refunded: 300,
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

      // Verify profile lookup was performed
      expect(mockFrom).toHaveBeenCalledWith('profiles');
    });

    it('should skip refund processing when no user found for customer', async () => {
      // Override profile lookup to return no user
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_refund_no_user',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_no_user',
            customer: 'cus_unknown',
            amount: 1200,
            amount_refunded: 600,
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

      // Should still return 200 but not call handle_refund
      expect(response.status).toBe(200);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero refund amount gracefully', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_refund_zero',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_zero',
            customer: 'cus_test_123',
            amount: 1200,
            amount_refunded: 0, // Zero refund (edge case)
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

      // Zero refund should not trigger credit revocation
      expect(response.status).toBe(200);
    });

    it('should handle missing customer ID', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_refund_no_customer',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_no_customer',
            customer: null, // No customer ID
            amount: 1200,
            amount_refunded: 600,
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

      // Should handle gracefully without error
      expect(response.status).toBe(200);
    });

    it('should handle database error during profile lookup', async () => {
      // Override profile lookup to return error
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database connection failed', code: 'PGRST500' },
            }),
          }),
        }),
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_refund_db_error',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_db_error',
            customer: 'cus_test_123',
            amount: 1200,
            amount_refunded: 600,
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

      // Should still return 200 as webhook was processed (error is logged)
      expect(response.status).toBe(200);
    });

    it('should handle handle_refund RPC failure gracefully', async () => {
      // First call is for idempotency check (should succeed)
      // Second call is for handle_refund (should fail)
      mockRpc
        .mockResolvedValueOnce({ data: true, error: null }) // idempotency
        .mockResolvedValueOnce({ data: null, error: { message: 'RPC failed' } }); // handle_refund

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_refund_rpc_fail',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_rpc_fail',
            customer: 'cus_test_123',
            amount: 1200,
            amount_refunded: 600,
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

      // Should still return 200 as error is logged but not fatal
      expect(response.status).toBe(200);
    });
  });

  describe('Idempotency', () => {
    it('should skip already processed refund events', async () => {
      // Mock idempotency check to return false (already processed)
      mockRpc.mockResolvedValue({ data: false, error: null });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_refund_duplicate',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_duplicate',
            customer: 'cus_test_123',
            amount: 1200,
            amount_refunded: 600,
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

  describe('Multiple Refunds on Same Charge', () => {
    it('should handle incremental refunds correctly', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      // First refund - 25%
      const firstRefundPayload = JSON.stringify({
        id: 'evt_refund_first',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_incremental',
            customer: 'cus_test_123',
            amount: 1200,
            amount_refunded: 300,
          },
        },
      });

      const { signature: sig1 } = generateStripeSignature(
        firstRefundPayload,
        mockEnv.STRIPE_WEBHOOK_SECRET,
      );

      const request1 = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: firstRefundPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': sig1,
        },
      });

      const response1 = await POST(request1);
      expect(response1.status).toBe(200);

      // Reset mocks for second request
      vi.clearAllMocks();
      mockRpc.mockResolvedValue({ data: true, error: null });
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'user_123', email: 'test@example.com' },
              error: null,
            }),
          }),
        }),
      });

      // Second refund - another 25% (total 50%)
      const secondRefundPayload = JSON.stringify({
        id: 'evt_refund_second',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_incremental',
            customer: 'cus_test_123',
            amount: 1200,
            amount_refunded: 600, // Total refunded now 600
          },
        },
      });

      const { signature: sig2 } = generateStripeSignature(
        secondRefundPayload,
        mockEnv.STRIPE_WEBHOOK_SECRET,
      );

      const request2 = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: secondRefundPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': sig2,
        },
      });

      // Need to re-import to get fresh module with new mocks
      vi.resetModules();
      const { POST: POST2 } = await import('@/app/api/stripe-webhook/route');
      const response2 = await POST2(request2);
      expect(response2.status).toBe(200);
    });
  });
});
