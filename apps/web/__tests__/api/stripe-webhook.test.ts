import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

const mockEnv = {
  STRIPE_SECRET_KEY: 'sk_test_mock_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
};

vi.stubEnv('STRIPE_SECRET_KEY', mockEnv.STRIPE_SECRET_KEY);
vi.stubEnv('STRIPE_WEBHOOK_SECRET', mockEnv.STRIPE_WEBHOOK_SECRET);

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
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
  // The webhook runs on a pool of its own so a slow Stripe call cannot starve
  // the clients every signed-in request needs for `assertAccountActive`.
  getStripeWebhookDb: vi.fn(() => mockDb),
}));

const mockAllocateCredits = vi.fn();
const mockResetCredits = vi.fn();

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: (...args: unknown[]) => mockAllocateCredits(...args),
    resetCreditsForNewPeriod: (...args: unknown[]) => mockResetCredits(...args),
  },
}));

const mockGetBalance = vi.fn();
const mockDeductCredits = vi.fn();

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
    deductCredits: (...args: unknown[]) => mockDeductCredits(...args),
  },
}));

vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: vi.fn(() => 'pro'),
  isValidPlanTier: vi.fn(() => true),
  getTierMapping: vi.fn(() => ({})),
  isPriceIdRegistered: vi.fn(() => true),
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

vi.mock('stripe', () => {
  return {
    default: MockStripe,
  };
});

describe('Stripe Webhook Security Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const neonModule = await import('@/lib/server/neon-db');
    (neonModule.getNeonDb as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('process_stripe_event_idempotent')) {
        return Promise.resolve([{ process_stripe_event_idempotent: true }]);
      }
      if (sql.includes('subscriptions')) {
        return Promise.resolve([{ id: 'sub_db_123', user_id: 'user_123' }]);
      }
      if (sql.includes('profiles')) {
        return Promise.resolve([{ id: 'user_123' }]);
      }
      return Promise.resolve([]);
    });

    mockExecute.mockResolvedValue(1);

    mockAllocateCredits.mockResolvedValue(undefined);
    mockResetCredits.mockResolvedValue(undefined);
    mockGetBalance.mockResolvedValue({ credits_remaining_cents: 0 });
    mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Signature Verification', () => {
    it('should reject requests with missing stripe-signature header', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_test_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: { user_id: 'user_123', plan_tier: 'pro' },
          },
        },
      });

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          // No stripe-signature header
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing Stripe signature');
    });

    it('should reject requests with invalid signature', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_test_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
          },
        },
      });

      const { signature } = generateStripeSignature(eventPayload, 'wrong_secret');

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

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid signature');
    });

    it('should accept requests with valid signature', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_test_valid',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: { user_id: 'user_123', plan_tier: 'pro' },
            line_items: { data: [{ price: { id: 'price_test' } }] },
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

    it('should reject replay attacks with old timestamps', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_test_replay',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
          },
        },
      });

      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
      const { signature } = generateStripeSignature(
        eventPayload,
        mockEnv.STRIPE_WEBHOOK_SECRET,
        oldTimestamp,
      );

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

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid signature');
    });

    it('should reject malformed signature format', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_test_malformed',
        type: 'checkout.session.completed',
        data: { object: {} },
      });

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'malformed_signature_without_proper_format',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid signature');
    });
  });

  describe('Idempotency', () => {
    it('should skip already processed events', async () => {
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
        id: 'evt_already_processed',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_123' } },
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
      const data = await response.json();
      expect(data.message).toContain('already processed');
    });

    it('should request a retry while another delivery still owns the processing lock', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('process_stripe_event_idempotent')) {
          return Promise.resolve([{ process_stripe_event_idempotent: false }]);
        }
        if (sql.includes('processed_stripe_events')) {
          return Promise.resolve([{ status: 'processing' }]);
        }
        return Promise.resolve([]);
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');
      const eventPayload = JSON.stringify({
        id: 'evt_processing',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_processing' } },
      });
      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);
      const response = await POST(
        new NextRequest('http://localhost/api/stripe-webhook', {
          method: 'POST',
          body: eventPayload,
          headers: {
            'content-type': 'application/json',
            'stripe-signature': signature,
          },
        }),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('10');
    });

    it('should fail closed when the durable succeeded marker cannot be committed', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Succeeded marker unavailable'));

      const { POST } = await import('@/app/api/stripe-webhook/route');
      const eventPayload = JSON.stringify({
        id: 'evt_mark_failure',
        type: 'test.unhandled',
        data: { object: {} },
      });
      const { signature } = generateStripeSignature(eventPayload, mockEnv.STRIPE_WEBHOOK_SECRET);
      const response = await POST(
        new NextRequest('http://localhost/api/stripe-webhook', {
          method: 'POST',
          body: eventPayload,
          headers: {
            'content-type': 'application/json',
            'stripe-signature': signature,
          },
        }),
      );

      expect(response.status).toBe(500);
      expect(mockExecute).toHaveBeenCalledWith('select mark_stripe_event_failed($1, $2)', [
        'evt_mark_failure',
        'Succeeded marker unavailable',
      ]);
    });
  });

  describe('Event Type Handling', () => {
    it('should handle checkout.session.completed events', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_checkout_complete',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_checkout',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: { user_id: 'user_123', plan_tier: 'pro' },
            line_items: { data: [{ price: { id: 'price_pro' } }] },
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

    it('should handle customer.subscription.deleted events', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_sub_deleted',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test_deleted',
            customer: 'cus_test_123',
            canceled_at: Math.floor(Date.now() / 1000),
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

    it('should handle invoice.payment_failed events', async () => {
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_payment_failed',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_failed',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
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

  describe('Billing owner handoff', () => {
    const futureIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    function stubEntitledStoreOwner(storeRow: Record<string, unknown>) {
      const executedSql: string[] = [];
      mockQuery.mockImplementation((sql: string) => {
        executedSql.push(sql);
        if (sql.includes('process_stripe_event_idempotent')) {
          return Promise.resolve([{ process_stripe_event_idempotent: true }]);
        }
        if (sql.includes('apple_original_transaction_id')) {
          return Promise.resolve([
            {
              plan_tier: 'pro',
              status: 'active',
              stripe_subscription_id: null,
              apple_original_transaction_id: null,
              google_purchase_token: null,
              current_period_end: futureIso,
              ...storeRow,
            },
          ]);
        }
        if (sql.includes('from subscriptions where stripe_subscription_id = $1')) {
          return Promise.resolve([]);
        }
        if (sql.includes('profiles')) {
          return Promise.resolve([{ id: 'user_123' }]);
        }
        if (sql.includes('subscriptions')) {
          return Promise.resolve([{ id: 'sub_db_123', user_id: 'user_123' }]);
        }
        return Promise.resolve([]);
      });
      return executedSql;
    }

    function signedRequest(payload: string) {
      const { signature } = generateStripeSignature(payload, mockEnv.STRIPE_WEBHOOK_SECRET);
      return new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: payload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });
    }

    it('refuses a checkout session that would stack Stripe on an entitled Apple subscription', async () => {
      const executedSql = stubEntitledStoreOwner({
        apple_original_transaction_id: 'apple-tx-1',
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const response = await POST(
        signedRequest(
          JSON.stringify({
            id: 'evt_checkout_stacked_apple',
            type: 'checkout.session.completed',
            data: {
              object: {
                id: 'cs_test_stacked',
                customer: 'cus_test_123',
                subscription: 'sub_test_123',
                metadata: { user_id: 'user_123', plan_tier: 'pro' },
                line_items: { data: [{ price: { id: 'price_test' } }] },
              },
            },
          }),
        ),
      );

      expect(response.status).toBe(500);
      expect(executedSql.some((sql) => sql.includes('insert into subscriptions'))).toBe(false);
      expect(mockAllocateCredits).not.toHaveBeenCalled();
      expect(mockExecute).toHaveBeenCalledWith('select mark_stripe_event_failed($1, $2)', [
        'evt_checkout_stacked_apple',
        'This account already has a subscription managed by another billing provider.',
      ]);
    });

    it('refuses a new Stripe subscription that would stack on an entitled Google subscription', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const executedSql = stubEntitledStoreOwner({ google_purchase_token: 'play-token-1' });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const response = await POST(
        signedRequest(
          JSON.stringify({
            id: 'evt_subscription_stacked_google',
            type: 'customer.subscription.updated',
            created: nowSeconds,
            data: {
              object: {
                id: 'sub_test_stacked',
                customer: 'cus_test_123',
                status: 'active',
                metadata: { user_id: 'user_123', plan_tier: 'pro' },
                items: { data: [{ price: { id: 'price_test' } }] },
                current_period_start: nowSeconds,
                current_period_end: nowSeconds + 30 * 24 * 60 * 60,
                cancel_at_period_end: false,
                canceled_at: null,
              },
            },
          }),
        ),
      );

      expect(response.status).toBe(500);
      expect(executedSql.some((sql) => sql.includes('insert into subscriptions'))).toBe(false);
      expect(mockAllocateCredits).not.toHaveBeenCalled();
    });

    it('still provisions Stripe once the store subscription is no longer entitled', async () => {
      const executedSql = stubEntitledStoreOwner({
        apple_original_transaction_id: 'apple-tx-1',
        status: 'expired',
      });

      const { POST } = await import('@/app/api/stripe-webhook/route');

      const response = await POST(
        signedRequest(
          JSON.stringify({
            id: 'evt_checkout_after_apple_expiry',
            type: 'checkout.session.completed',
            data: {
              object: {
                id: 'cs_test_handoff',
                customer: 'cus_test_123',
                subscription: 'sub_test_123',
                metadata: { user_id: 'user_123', plan_tier: 'pro' },
                line_items: { data: [{ price: { id: 'price_test' } }] },
              },
            },
          }),
        ),
      );

      expect(response.status).toBe(200);
      expect(executedSql.some((sql) => sql.includes('insert into subscriptions'))).toBe(true);
    });
  });

  describe('Security Audit Logging', () => {
    it('should log invalid signature attempts', async () => {
      const { logInvalidSignature } = await import('@/lib/security-audit');
      const { POST } = await import('@/app/api/stripe-webhook/route');

      const eventPayload = JSON.stringify({
        id: 'evt_test_audit',
        type: 'checkout.session.completed',
        data: { object: {} },
      });

      const { signature } = generateStripeSignature(eventPayload, 'wrong_secret');

      const request = new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: eventPayload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
      });

      await POST(request);

      expect(logInvalidSignature).toHaveBeenCalled();
    });
  });
});

describe('Stripe Signature Generation Utility Tests', () => {
  it('should generate valid signature format', () => {
    const payload = '{"test": "data"}';
    const secret = 'test_secret';
    const { signature, timestamp } = generateStripeSignature(payload, secret);

    expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(timestamp).toBeGreaterThan(0);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';
    const { signature: sig1 } = generateStripeSignature('{"a": 1}', secret);
    const { signature: sig2 } = generateStripeSignature('{"b": 2}', secret);

    expect(sig1).not.toBe(sig2);
  });

  it('should generate different signatures for different secrets', () => {
    const payload = '{"test": "data"}';
    const { signature: sig1 } = generateStripeSignature(payload, 'secret1');
    const { signature: sig2 } = generateStripeSignature(payload, 'secret2');

    expect(sig1).not.toBe(sig2);
  });

  it('should use provided timestamp when specified', () => {
    const payload = '{"test": "data"}';
    const secret = 'test_secret';
    const customTimestamp = 1234567890;
    const { signature, timestamp } = generateStripeSignature(payload, secret, customTimestamp);

    expect(timestamp).toBe(customTimestamp);
    expect(signature).toContain(`t=${customTimestamp}`);
  });
});
