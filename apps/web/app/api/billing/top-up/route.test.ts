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
import { createError } from '@/lib/errors';
import {
  WITHDRAWAL_CONSENT_STATEMENT,
  WITHDRAWAL_CONSENT_VERSION,
} from '@/lib/billing/withdrawal-consent';

const BILLING_ROW = {
  plan_tier: 'pro',
  status: 'active',
  stripe_customer_id: 'cus_123',
  stripe_subscription_id: 'sub_123',
};

function request(amountUsd: unknown) {
  return new NextRequest('https://agiworkforce.com/api/billing/top-up', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'topup-request-123',
    },
    body: JSON.stringify({ amountUsd }),
  });
}

function ledgerState(state: {
  ready?: boolean;
  billing?: Record<string, unknown> | null;
  purchasedTodayMicrousd?: number;
}) {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('to_regprocedure')) return [{ ready: state.ready ?? true }];
    if (sql.includes('from subscriptions'))
      return state.billing === null ? [] : [state.billing ?? BILLING_ROW];
    if (sql.includes('from credit_transactions')) {
      return [{ purchased_microusd: String(state.purchasedTodayMicrousd ?? 0) }];
    }
    return [];
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
    ledgerState({});
    mocks.createSession.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.com/c/pay/cs_123',
    });
  });

  it('creates a $20 checkout for exactly 1,000 credits with charge-visible metadata', async () => {
    const response = await POST(request(20));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_123',
      amountUsd: 20,
      topUpUnits: 1_000,
      priceCents: 2_000,
      discountPercent: 0,
    });
    const metadata = {
      type: 'credit_topup',
      user_id: 'user_123',
      conversion: 'usd_1_to_credits_50_v2',
      amount_usd: '20',
      price_cents: '2000',
      discount_percent: '0',
      credit_amount_cents: '500',
      top_up_units: '1000',
      auto_reload: 'false',
      withdrawal_consent_version: WITHDRAWAL_CONSENT_VERSION,
    };
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        currency: 'usd',
        customer: 'cus_123',
        client_reference_id: 'user_123',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: 2_000,
              product_data: { name: 'AGI top-up, 1,000 credits', description: '1,000 credits' },
            },
          },
        ],
        metadata,
        payment_intent_data: { metadata },
        automatic_tax: { enabled: true },
        consent_collection: { terms_of_service: 'required' },
        custom_text: {
          terms_of_service_acceptance: {
            message: expect.stringContaining(WITHDRAWAL_CONSENT_STATEMENT),
          },
        },
      }),
      { idempotencyKey: 'topup:user_123:20:topup-request-123' },
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_123',
        eventType: 'checkout_started',
        detail: expect.objectContaining({ resourceType: 'credit_topup', count: 1_000 }),
      }),
    );
  });

  it('charges the discounted pack price while granting the full pack', async () => {
    const response = await POST(request(100));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      amountUsd: 100,
      topUpUnits: 5_000,
      priceCents: 9_000,
      discountPercent: 10,
    });
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 9_000,
              product_data: {
                name: 'AGI top-up, 5,000 credits',
                description: '5,000 credits, 10% off',
              },
            }),
          }),
        ],
        metadata: expect.objectContaining({
          price_cents: '9000',
          discount_percent: '10',
          credit_amount_cents: '2500',
          top_up_units: '5000',
        }),
      }),
      expect.anything(),
    );
  });

  it.each([19, 1_001, 20.5, '20', null])(
    'rejects %s outside whole dollars from $20 to $1,000 before Stripe',
    async (amountUsd) => {
      const response = await POST(request(amountUsd));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { message: 'Choose a whole-dollar top-up from $20 to $1000.' },
      });
      expect(mocks.createSession).not.toHaveBeenCalled();
    },
  );

  it('refuses a pack that would take the day past $2,000 of top-ups', async () => {
    ledgerState({ purchasedTodayMicrousd: 95_000 * 5_000 });

    const response = await POST(request(250));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringContaining('100,000 credits a day') },
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('still sells the pack that exactly reaches the daily limit', async () => {
    ledgerState({ purchasedTodayMicrousd: 87_500 * 5_000 });

    const response = await POST(request(250));

    expect(response.status).toBe(200);
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
  });

  it('refuses checkout while paid checkout is switched off', async () => {
    process.env['STRIPE_CHECKOUT_ENABLED'] = 'false';

    const response = await POST(request(20));

    expect(response.status).toBe(503);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('refuses a caller with no session before reading anything', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    const response = await POST(request(20));

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('fails closed before Stripe when the carry/refund migration is not ready', async () => {
    ledgerState({ ready: false });

    const response = await POST(request(20));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('refuses a top-up when the subscription is billed in a currency other than USD', async () => {
    mocks.retrieveSubscription.mockResolvedValueOnce({ currency: 'INR' });

    const response = await POST(request(20));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringContaining('INR') },
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('fails closed without charging when Stripe cannot confirm the billing currency', async () => {
    mocks.retrieveSubscription.mockRejectedValueOnce(new Error('stripe unreachable'));

    const response = await POST(request(20));

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

    const response = await POST(request(20));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringContaining('65 days past due') },
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('refuses a top-up with a 503 when the workspace billing status cannot be confirmed', async () => {
    mocks.evaluateActiveWorkspacePolicy.mockResolvedValueOnce({
      allowed: false,
      code: 'workspace_policy_unavailable',
      reason: 'We could not confirm your workspace billing status, so this purchase was stopped.',
      obligations: [],
      organizationId: null,
    });

    const response = await POST(request(20));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('rejects a plan with no Stripe or store billing owner, such as an organization-managed one', async () => {
    ledgerState({
      billing: { ...BILLING_ROW, stripe_customer_id: null, stripe_subscription_id: null },
    });

    const response = await POST(request(20));
    expect(response.status).toBe(400);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('rejects a Free account, which has no plan to add credits to', async () => {
    ledgerState({ billing: { ...BILLING_ROW, plan_tier: 'free' } });

    const response = await POST(request(20));
    expect(response.status).toBe(400);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
