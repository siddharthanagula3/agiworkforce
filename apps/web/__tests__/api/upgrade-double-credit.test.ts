import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const stripeMocks = vi.hoisted(() => ({
  retrieveSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  retrieveCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}));

const pricingMocks = vi.hoisted(() => ({
  getPriceSelectionForCurrency: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user-123' })) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/localized-pricing-service', () => ({
  getPriceSelectionForCurrency: (...args: unknown[]) =>
    pricingMocks.getPriceSelectionForCurrency(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: dbMocks.query, execute: dbMocks.execute }),
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    customers = {
      retrieve: stripeMocks.retrieveCustomer,
      update: stripeMocks.updateCustomer,
    };
    subscriptions = {
      retrieve: stripeMocks.retrieveSubscription,
      update: stripeMocks.updateSubscription,
    };
  },
}));

import { POST } from '@/app/api/upgrade/route';

const SUB_ROW = {
  id: 'sub-db-1',
  status: 'active',
  plan_tier: 'pro',
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'sub_1',
  stripe_price_id: 'price_pro_monthly',
};

function makeRequest(plan: 'max' | 'max_15x' | 'team' = 'max', country = 'US') {
  return new NextRequest('http://localhost/api/upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-ip-country': country },
    body: JSON.stringify({ plan, billingInterval: 'monthly' }),
  });
}

function stripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    metadata: { plan_tier: 'pro', user_id: 'user-123' },
    items: {
      data: [
        {
          id: 'si_1',
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          price: { id: 'price_pro_monthly' },
        },
      ],
    },
    latest_invoice: null,
    currency: 'usd',
    pending_update: null,
    cancel_at_period_end: false,
    canceled_at: null,
    discounts: [],
    ...overrides,
  };
}

describe('POST /api/upgrade — payment-safe idempotent upgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_dummy';
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) return [SUB_ROW];
      return [];
    });
    dbMocks.execute.mockResolvedValue(1);
    pricingMocks.getPriceSelectionForCurrency.mockResolvedValue({
      priceId: 'price_max_monthly',
      currency: 'usd',
    });
    stripeMocks.retrieveSubscription.mockResolvedValue(stripeSubscription());
    stripeMocks.updateSubscription.mockResolvedValue(
      stripeSubscription({
        metadata: { plan_tier: 'max', user_id: 'user-123' },
        items: {
          data: [
            {
              id: 'si_1',
              current_period_start: 1_700_100_000,
              current_period_end: 1_702_692_000,
              price: { id: 'price_max_monthly' },
            },
          ],
        },
        latest_invoice: { id: 'in_upgrade', status: 'paid', confirmation_secret: null },
      }),
    );
  });

  it('charges a full target cycle now with Stripe time credit and payment-safe activation', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(stripeMocks.updateSubscription).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({
        items: [{ id: 'si_1', price: 'price_max_monthly' }],
        billing_cycle_anchor: 'now',
        proration_behavior: 'always_invoice',
        payment_behavior: 'pending_if_incomplete',
        expand: ['latest_invoice.confirmation_secret'],
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(stripeMocks.retrieveCustomer).not.toHaveBeenCalled();
    expect(stripeMocks.updateCustomer).not.toHaveBeenCalled();
    expect(dbMocks.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('add_credits'),
      expect.anything(),
    );

    const body = await response.json();
    expect(body).not.toHaveProperty('creditApplied');
    expect(body).not.toHaveProperty('creditAppliedUsd');
  });

  it('keeps the existing subscription currency when selecting the replacement price', async () => {
    pricingMocks.getPriceSelectionForCurrency.mockResolvedValueOnce({
      priceId: 'price_max_monthly_inr',
      currency: 'inr',
    });
    stripeMocks.retrieveSubscription.mockResolvedValueOnce(stripeSubscription({ currency: 'inr' }));
    stripeMocks.updateSubscription.mockResolvedValueOnce(
      stripeSubscription({
        metadata: { plan_tier: 'max', user_id: 'user-123' },
        items: {
          data: [
            {
              id: 'si_1',
              current_period_start: 1_700_100_000,
              current_period_end: 1_702_692_000,
              price: { id: 'price_max_monthly_inr' },
            },
          ],
        },
        latest_invoice: { id: 'in_upgrade', status: 'paid', confirmation_secret: null },
      }),
    );

    const response = await POST(makeRequest('max', 'US'));

    expect(response.status).toBe(200);
    expect(pricingMocks.getPriceSelectionForCurrency).toHaveBeenCalledWith('max', 'monthly', 'inr');
    expect(stripeMocks.updateSubscription).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({
        items: [{ id: 'si_1', price: 'price_max_monthly_inr' }],
      }),
      expect.anything(),
    );
  });

  it('does not activate locally when Stripe leaves the upgrade pending payment', async () => {
    stripeMocks.updateSubscription.mockResolvedValue(
      stripeSubscription({
        pending_update: { expires_at: 1_700_086_400 },
        latest_invoice: {
          id: 'in_pending',
          status: 'open',
          confirmation_secret: { type: 'payment_intent', client_secret: 'pi_secret_123' },
        },
      }),
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        success: false,
        paymentActionRequired: true,
        clientSecret: 'pi_secret_123',
      }),
    );
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  it('leaves the old plan and usage untouched when Stripe rejects payment', async () => {
    stripeMocks.updateSubscription.mockRejectedValue(new Error('card declined'));

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    expect(dbMocks.execute).not.toHaveBeenCalled();
    expect(stripeMocks.updateCustomer).not.toHaveBeenCalled();
  });

  it('rejects Team before touching the personal-subscription upgrade path', async () => {
    const response = await POST(makeRequest('team'));

    expect(response.status).toBe(400);
    expect(dbMocks.query).not.toHaveBeenCalled();
    expect(stripeMocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(stripeMocks.updateSubscription).not.toHaveBeenCalled();
  });
});
