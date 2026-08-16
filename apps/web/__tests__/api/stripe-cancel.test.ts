
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

const mockEnv = {
  STRIPE_SECRET_KEY: 'sk_test_mock_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
};

vi.stubEnv('STRIPE_SECRET_KEY', mockEnv.STRIPE_SECRET_KEY);
vi.stubEnv('STRIPE_WEBHOOK_SECRET', mockEnv.STRIPE_WEBHOOK_SECRET);

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

vi.mock('@/lib/security-audit', () => ({
  logInvalidSignature: vi.fn().mockResolvedValue(undefined),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockQuery = vi.fn();
const mockExecute = vi.fn();
const mockDb = {
  query: mockQuery,
  execute: mockExecute,
  transaction: vi.fn((fn: (db: unknown) => unknown) =>
    fn({ query: mockQuery, execute: mockExecute }),
  ),
  withUser: vi.fn(() => mockDb),
  dispose: vi.fn(),
};

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => mockDb),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: vi.fn().mockResolvedValue(undefined),
    resetCreditsForNewPeriod: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockGetBalance = vi.fn();
const mockDeductCredits = vi.fn();

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: mockGetBalance,
    deductCredits: mockDeductCredits,
  },
}));

vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: vi.fn(() => 'pro'),
  isValidPlanTier: vi.fn(() => true),
  getTierMapping: vi.fn(() => ({})),
}));

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

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const neonModule = await import('@/lib/server/neon-db');
    (neonModule.getNeonDb as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('process_stripe_event_idempotent')) {
        return Promise.resolve([{ process_stripe_event_idempotent: true }]);
      }
      if (sql.includes('select id, user_id from subscriptions')) {
        return Promise.resolve([{ id: 'sub_db_123', user_id: 'user_123' }]);
      }
      return Promise.resolve([]);
    });

    mockExecute.mockResolvedValue(1);

    mockGetBalance.mockResolvedValue({
      credits_remaining_cents: 500,
      account_id: 'acc_123',
    });

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
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("status = 'canceled'"),
        expect.anything(),
      );
    });

    it('should NOT revoke remaining credits on cancellation (runs to billing end)', async () => {
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
      expect(mockGetBalance).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
    });

    it('should use Stripe canceled_at timestamp', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const specificCanceledAt = 1704067200;

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

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({ stripeSubId: 'sub_stripe_timestamp' }),
        expect.any(String),
      );
    });
  });

  describe('Subscription Lookup', () => {
    it('should update the subscription row by stripe_subscription_id', async () => {
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

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('subscriptions'),
        expect.arrayContaining(['sub_unique_stripe_id']),
      );
    });

    it('should handle subscription not found in database', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('process_stripe_event_idempotent')) {
          return Promise.resolve([{ process_stripe_event_idempotent: true }]);
        }
        return Promise.resolve([]);
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

      expect(response.status).toBe(200);
    });
  });

  describe('Credit Revocation', () => {
    it('should never touch the credit balance on cancellation, regardless of balance', async () => {
      mockGetBalance.mockResolvedValue({
        credits_remaining_cents: 500,
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

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockGetBalance).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
    });

    it('should cancel cleanly even if the credit service would have errored', async () => {
      mockGetBalance.mockRejectedValue(new Error('Database connection failed'));
      mockDeductCredits.mockRejectedValue(new Error('Deduction failed'));

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

      expect(response.status).toBe(200);
      expect(mockGetBalance).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
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

      expect(response.status).toBe(200);
    });

    it('should handle database execute error gracefully', async () => {
      mockExecute.mockRejectedValue(new Error('Update failed'));

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

      expect(response.status).toBe(500);
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('should handle cancellation for subscription without user_id', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('process_stripe_event_idempotent')) {
          return Promise.resolve([{ process_stripe_event_idempotent: true }]);
        }
        if (sql.includes('select id, user_id from subscriptions')) {
          return Promise.resolve([{ id: 'sub_db_123', user_id: null }]);
        }
        return Promise.resolve([]);
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
      expect(mockGetBalance).not.toHaveBeenCalled();
    });
  });

  describe('Idempotency', () => {
    it('should skip already processed cancellation events', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('process_stripe_event_idempotent')) {
          return Promise.resolve([{ process_stripe_event_idempotent: false }]);
        }
        if (sql.includes('processed_stripe_events')) {
          return Promise.resolve([{ status: 'succeeded' }]);
        }
        return Promise.resolve([]);
      });

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
      expect(mockDeductCredits).not.toHaveBeenCalled();
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

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({ stripeSubId: 'sub_logging_test' }),
        'Subscription deleted',
      );
    });

    it('should NOT log any credit revocation on cancellation', async () => {
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

      expect(mockLoggerInfo).not.toHaveBeenCalledWith(
        expect.objectContaining({ revokedCents: expect.anything() }),
        'Credits revoked for canceled subscription',
      );
      expect(mockDeductCredits).not.toHaveBeenCalled();
    });
  });
});
