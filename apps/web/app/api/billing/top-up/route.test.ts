import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  createSession: vi.fn(),
  retrieveSubscription: vi.fn(async () => ({ currency: 'usd' })),
  audit: vi.fn(),
  getUserScopedDb: vi.fn(),
  evaluateActiveWorkspacePolicy: vi.fn(
    async (
      ..._args: unknown[]
    ): Promise<{
      allowed: boolean;
      code: string;
      reason: string;
      obligations: unknown[];
      organizationId: string | null;
    }> => ({
      allowed: true,
      code: 'unscoped',
      reason: 'No workspace policy applies to this request.',
      obligations: [],
      organizationId: null,
    }),
  ),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.getUserScopedDb(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  evaluateActiveWorkspacePolicy: (...args: unknown[]) =>
    mocks.evaluateActiveWorkspacePolicy(...args),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mocks.audit(...args),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@shared/utils/env', () => ({
  getOptionalEnv: vi.fn((name: string) =>
    name === 'STRIPE_SECRET_KEY' ? 'sk_test_dummy' : undefined,
  ),
  requireEnv: vi.fn((name: string) =>
    name === 'NEXT_PUBLIC_APP_URL' ? 'https://agiworkforce.com' : 'sk_test_dummy',
  ),
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    checkout = { sessions: { create: mocks.createSession } };
    subscriptions = { retrieve: mocks.retrieveSubscription };
  },
}));

import { POST } from './route';

function request(amountUsd: number) {
  return new NextRequest('https://agiworkforce.com/api/billing/top-up', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'topup-request-123',
    },
    body: JSON.stringify({ amountUsd }),
  });
}

describe('POST /api/billing/top-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['STRIPE_CHECKOUT_ENABLED'] = '1';
    mocks.getUserScopedDb.mockResolvedValue({
      db: { query: mocks.query },
      userId: 'user_123',
      organizationId: null,
    });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regprocedure')) return [{ ready: true }];
      return [
        {
          plan_tier: 'pro',
          status: 'active',
          stripe_customer_id: 'cus_123',
          stripe_subscription_id: 'sub_123',
        },
      ];
    });
    mocks.createSession.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.com/c/pay/cs_123',
    });
  });

  it('creates a $10 checkout for exactly 500 units with charge-visible metadata', async () => {
    const response = await POST(request(10));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ amountUsd: 10, topUpUnits: 500 });
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        currency: 'usd',
        customer: 'cus_123',
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({ currency: 'usd', unit_amount: 1_000 }),
          }),
        ],
        metadata: expect.objectContaining({
          type: 'credit_topup',
          user_id: 'user_123',
          credit_amount_cents: '1000',
          top_up_units: '500',
        }),
        payment_intent_data: {
          metadata: expect.objectContaining({
            type: 'credit_topup',
            credit_amount_cents: '1000',
            top_up_units: '500',
          }),
        },
        automatic_tax: { enabled: true },
      }),
      { idempotencyKey: 'topup:user_123:10:topup-request-123' },
    );
  });

  it('rejects an amount below the $10 minimum before Stripe', async () => {
    const response = await POST(request(9));
    expect(response.status).toBe(400);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('fails closed before Stripe when the carry/refund migration is not ready', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regprocedure')) return [{ ready: false }];
      return [
        {
          plan_tier: 'pro',
          status: 'active',
          stripe_customer_id: 'cus_123',
          stripe_subscription_id: 'sub_123',
        },
      ];
    });

    const response = await POST(request(10));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('refuses a top-up when the subscription is billed in a currency other than USD', async () => {
    mocks.retrieveSubscription.mockResolvedValueOnce({ currency: 'INR' });

    const response = await POST(request(10));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringContaining('INR') },
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('fails closed without charging when Stripe cannot confirm the billing currency', async () => {
    mocks.retrieveSubscription.mockRejectedValueOnce(new Error('stripe unreachable'));

    const response = await POST(request(10));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('refuses a top-up once the workspace billing hold blocks new paid usage', async () => {
    mocks.evaluateActiveWorkspacePolicy.mockResolvedValueOnce({
      allowed: false,
      code: 'billing_past_due',
      reason: 'New paid usage is on hold: payment is 65 days past due.',
      obligations: [],
      organizationId: 'org_1',
    });

    const response = await POST(request(10));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringContaining('65 days past due') },
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('rejects accounts that are not actively billed by Stripe', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regprocedure')) return [{ ready: true }];
      return [
        {
          plan_tier: 'pro',
          status: 'active',
          stripe_customer_id: null,
          stripe_subscription_id: null,
        },
      ];
    });

    const response = await POST(request(10));
    expect(response.status).toBe(400);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
