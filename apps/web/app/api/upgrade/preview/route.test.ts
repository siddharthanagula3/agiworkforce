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

function makeRequest() {
  return new NextRequest('https://agiworkforce.com/api/upgrade/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'max_15x', billingInterval: 'monthly' }),
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
          price: { id: 'price_max_monthly' },
        },
      ],
    },
  };
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
            stripe_subscription_id: null,
            stripe_customer_id: 'cus_123',
          },
        ];
      }
      if (sql.includes('from profiles')) return [{ stripe_customer_id: 'cus_123' }];
      return [];
    });
    dbMocks.execute.mockResolvedValue(1);
    stripeMocks.listSubscriptions.mockResolvedValue({ data: [makeStripeSubscription()] });
    pricingMocks.getPriceSelectionForCurrency.mockResolvedValue({
      priceId: 'price_max_15x_monthly',
      currency: 'usd',
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

  it('recovers an owned live subscription before falling back to full-price checkout', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      amountDueNowCents: 10_042,
      currency: 'usd',
      previewToken: expect.any(String),
    });
    expect(stripeMocks.listSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        status: 'all',
      }),
    );
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('stripe_subscription_id'),
      expect.arrayContaining(['sub_live123', 'cus_123', 'user_123']),
    );
    expect(stripeMocks.createInvoicePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_details: expect.objectContaining({
          billing_cycle_anchor: 'now',
        }),
      }),
    );
    expect(
      stripeMocks.createInvoicePreview.mock.calls[0]?.[0]?.subscription_details,
    ).not.toHaveProperty('proration_date');
  });

  it('returns the localized full price when no prior Stripe charge can be credited', async () => {
    stripeMocks.listSubscriptions.mockResolvedValueOnce({ data: [] });

    const response = await POST(makeRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'checkout_required',
      },
      checkout: {
        amountDueNowCents: 20_000,
        currency: 'usd',
      },
    });
    expect(pricingMocks.getLocalizedPricingCatalog).toHaveBeenCalledWith('US');
  });
});
