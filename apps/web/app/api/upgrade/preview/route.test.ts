import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const stripeMocks = vi.hoisted(() => ({
  retrieveSubscription: vi.fn(),
  listSubscriptions: vi.fn(),
  createInvoicePreview: vi.fn(),
}));

const pricingMocks = vi.hoisted(() => ({
  getPriceSelectionForCurrency: vi.fn(),
  getLocalizedPricingCatalog: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_123' })) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@shared/utils/env', () => ({
  requireEnv: vi.fn(() => 'sk_test_dummy'),
}));
vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: vi.fn((_metadata, priceId: string | null) =>
    priceId === 'price_max_monthly' ? 'max' : null,
  ),
}));
vi.mock('@/lib/server/localized-pricing-service', () => ({
  getPriceSelectionForCurrency: (...args: unknown[]) =>
    pricingMocks.getPriceSelectionForCurrency(...args),
  getLocalizedPricingCatalog: (...args: unknown[]) =>
    pricingMocks.getLocalizedPricingCatalog(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: dbMocks.query, execute: dbMocks.execute }),
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    subscriptions = {
      retrieve: stripeMocks.retrieveSubscription,
      list: stripeMocks.listSubscriptions,
    };
    invoices = {
      createPreview: stripeMocks.createInvoicePreview,
    };
  },
}));

import { POST } from './route';

function makeRequest(billingInterval: 'monthly' | 'yearly' = 'monthly') {
  return new NextRequest('https://agiworkforce.com/api/upgrade/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'max_15x', billingInterval }),
  });
}

function makeStripeSubscription() {
  return {
    id: 'sub_live123',
    customer: 'cus_123',
    status: 'active',
    currency: 'usd',
    metadata: { user_id: 'user_123', plan_tier: 'max' },
    items: {
      data: [
        {
          id: 'si_123',
          price: {
            id: 'price_max_monthly',
            recurring: { interval: 'month', interval_count: 1 },
          },
        },
      ],
    },
  };
}

function mockSubscriptionRow(row: Record<string, unknown>) {
  // Authentication reads profiles before the route reads subscriptions, so a
  // one-shot DB result would be consumed before it reaches the owner guard.
  dbMocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('from subscriptions')) return [row];
    if (sql.includes('from profiles')) {
      return [{ stripe_customer_id: row['stripe_customer_id'] ?? null }];
    }
    return [];
  });
}

describe('POST /api/upgrade/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) {
        return [
          {
            status: 'active',
            plan_tier: 'max',
            stripe_subscription_id: 'sub_live123',
            stripe_customer_id: 'cus_123',
          },
        ];
      }
      if (sql.includes('from profiles')) return [{ stripe_customer_id: 'cus_123' }];
      return [];
    });
    dbMocks.execute.mockResolvedValue(1);
    stripeMocks.retrieveSubscription.mockResolvedValue(makeStripeSubscription());
    stripeMocks.listSubscriptions.mockResolvedValue({ data: [makeStripeSubscription()] });
    pricingMocks.getPriceSelectionForCurrency.mockResolvedValue({
      priceId: 'price_max_15x_monthly',
      currency: 'usd',
      amountMinor: 20_000,
    });
    pricingMocks.getLocalizedPricingCatalog.mockResolvedValue({
      country: 'US',
      requestedCurrency: 'usd',
      plans: {
        max_15x: {
          monthly: {
            amountMinor: 20_000,
            currency: 'usd',
            checkoutReady: true,
          },
        },
      },
    });
    stripeMocks.createInvoicePreview.mockResolvedValue({
      amount_due: 10_042,
      currency: 'usd',
    });
  });

  it('previews an owned live Stripe subscription', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      amountDueNowCents: 10_042,
      recurringAmountCents: 20_000,
      currency: 'usd',
      previewToken: expect.any(String),
    });
    expect(stripeMocks.retrieveSubscription).toHaveBeenCalledWith('sub_live123', {
      expand: ['items.data.price'],
    });
    const subscriptionDetails =
      stripeMocks.createInvoicePreview.mock.calls[0]?.[0]?.subscription_details;
    expect(subscriptionDetails).toMatchObject({
      proration_behavior: 'always_invoice',
    });
    // Must be stated, not omitted. This assertion previously required the
    // property to be ABSENT, on the assumption that omitting it preserves the
    // renewal anchor. `invoices.createPreview` actually defaults it to `now`,
    // which Stripe then refuses to combine with `proration_date` — so every
    // upgrade preview returned 500 in production while this test passed.
    expect(subscriptionDetails).toMatchObject({ billing_cycle_anchor: 'unchanged' });
    expect(
      stripeMocks.createInvoicePreview.mock.calls[0]?.[0]?.subscription_details?.proration_date,
    ).toEqual(expect.any(Number));
  });

  it('returns localized full-price checkout for an ended organization-managed plan', async () => {
    mockSubscriptionRow({
      status: 'canceled',
      plan_tier: 'max',
      stripe_subscription_id: null,
      stripe_customer_id: null,
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'checkout_required',
      },
      checkout: {
        amountDueNowCents: 20_000,
        recurringAmountCents: 20_000,
        currency: 'usd',
      },
    });
    expect(pricingMocks.getLocalizedPricingCatalog).toHaveBeenCalledWith('US');
    expect(stripeMocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(stripeMocks.listSubscriptions).not.toHaveBeenCalled();
  });

  it('sends a genuine free user to localized full-price checkout', async () => {
    dbMocks.query.mockImplementation(async (sql: string) =>
      sql.includes('from subscriptions') ? [] : [],
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'checkout_required' },
      checkout: {
        amountDueNowCents: 20_000,
        recurringAmountCents: 20_000,
        currency: 'usd',
      },
    });
    expect(stripeMocks.listSubscriptions).not.toHaveBeenCalled();
    expect(stripeMocks.createInvoicePreview).not.toHaveBeenCalled();
  });

  it('fails closed when subscription state cannot be verified', async () => {
    dbMocks.query.mockReset().mockRejectedValue(new Error('database unavailable'));

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(stripeMocks.listSubscriptions).not.toHaveBeenCalled();
    expect(stripeMocks.createInvoicePreview).not.toHaveBeenCalled();
  });

  it('does not recover an active subscription whose billing owner is unverified', async () => {
    mockSubscriptionRow({
      status: 'active',
      plan_tier: 'max',
      stripe_subscription_id: 'not-a-stripe-subscription-id',
      stripe_customer_id: 'cus_123',
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(409);
    expect(stripeMocks.listSubscriptions).not.toHaveBeenCalled();
    expect(stripeMocks.createInvoicePreview).not.toHaveBeenCalled();
  });

  it('sends an ended Apple subscription to full-price checkout, never Stripe proration', async () => {
    mockSubscriptionRow({
      status: 'expired',
      plan_tier: 'max',
      stripe_subscription_id: null,
      stripe_customer_id: null,
      apple_original_transaction_id: 'apple-tx-ended',
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'checkout_required' } });
    expect(stripeMocks.listSubscriptions).not.toHaveBeenCalled();
    expect(stripeMocks.createInvoicePreview).not.toHaveBeenCalled();
  });

  describe('Team seat changes', () => {
    function teamSubscription(quantity: number) {
      return {
        id: 'sub_live123',
        customer: 'cus_123',
        status: 'active',
        currency: 'usd',
        metadata: { user_id: 'user_123', plan_tier: 'team' },
        items: {
          data: [
            {
              id: 'si_123',
              price: {
                id: 'price_team_usd',
                recurring: { interval: 'month', interval_count: 1 },
              },
              quantity,
            },
          ],
        },
      };
    }

    function teamRequest(seats?: number, billingInterval: 'monthly' | 'yearly' = 'monthly') {
      return new NextRequest('https://agiworkforce.com/api/upgrade/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'team',
          billingInterval,
          ...(seats === undefined ? {} : { seats }),
        }),
      });
    }

    beforeEach(() => {
      dbMocks.query.mockImplementation(async (sql: string) => {
        if (sql.includes('from subscriptions')) {
          return [
            {
              status: 'active',
              plan_tier: 'team',
              stripe_subscription_id: 'sub_live123',
              stripe_customer_id: 'cus_123',
            },
          ];
        }
        if (sql.includes('from profiles')) return [{ stripe_customer_id: 'cus_123' }];
        return [];
      });
      stripeMocks.retrieveSubscription.mockResolvedValue(teamSubscription(5));
      pricingMocks.getPriceSelectionForCurrency.mockResolvedValue({
        priceId: 'price_team_usd',
        currency: 'usd',
        amountMinor: 2_000,
      });
    });

    it('prices a seat increase at the requested quantity, not the current one', async () => {
      const response = await POST(teamRequest(12));

      expect(response.status).toBe(200);
      expect(stripeMocks.createInvoicePreview).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_details: expect.objectContaining({
            items: [{ id: 'si_123', price: 'price_team_usd', quantity: 12 }],
          }),
        }),
      );
    });

    it('quotes the recurring amount as unit price x seats', async () => {
      const response = await POST(teamRequest(12));

      // 12 seats at 2000 minor units each. Publishing the unit amount would
      // understate the org's going-forward bill twelve-fold.
      expect(await response.json()).toMatchObject({
        recurringAmountCents: 24_000,
        seats: 12,
      });
    });

    it('refuses a cadence change because Stripe would reset the renewal date', async () => {
      const response = await POST(teamRequest(12, 'yearly'));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { message: expect.stringMatching(/keep your current monthly billing cadence/i) },
      });
      expect(stripeMocks.createInvoicePreview).not.toHaveBeenCalled();
    });

    it('refuses a seat reduction rather than issuing an unscoped credit', async () => {
      const response = await POST(teamRequest(2));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { message: expect.stringMatching(/billing management/i) },
      });
      expect(stripeMocks.createInvoicePreview).not.toHaveBeenCalled();
    });

    it('refuses a no-op seat change', async () => {
      const response = await POST(teamRequest(5));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { message: expect.stringMatching(/already has 5 seats/i) },
      });
      expect(stripeMocks.createInvoicePreview).not.toHaveBeenCalled();
    });

    it('refuses a Team preview with no seat count', async () => {
      const response = await POST(teamRequest());

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { message: expect.stringMatching(/seats/i) },
      });
      expect(stripeMocks.createInvoicePreview).not.toHaveBeenCalled();
    });
  });
});
