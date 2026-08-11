import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const stripeMocks = vi.hoisted(() => ({
  retrieveSubscription: vi.fn(),
  listSubscriptions: vi.fn(),
  updateSubscription: vi.fn(),
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
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_123' })) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@shared/utils/env', () => ({ requireEnv: vi.fn(() => 'sk_test_dummy') }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/server/localized-pricing-service', () => ({
  getPriceSelectionForCurrency: (...args: unknown[]) =>
    pricingMocks.getPriceSelectionForCurrency(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: dbMocks.query, execute: dbMocks.execute }),
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    subscriptions = {
      retrieve: stripeMocks.retrieveSubscription,
      list: stripeMocks.listSubscriptions,
      update: stripeMocks.updateSubscription,
    };
  },
}));

import { POST } from './route';
import { createUpgradePreviewToken } from '@/lib/server/stripe-upgrade-preview-token';

const SECRET = 'sk_test_dummy';
const PRORATION_DATE = Math.floor(Date.parse('2026-08-04T00:00:00.000Z') / 1000);

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

function tokenFor(seats: number, plan: 'team' | 'max' = 'team') {
  return createUpgradePreviewToken(
    {
      userId: 'user_123',
      plan,
      billingInterval: 'monthly',
      stripeSubscriptionId: 'sub_live123',
      seats,
      prorationDate: PRORATION_DATE,
    },
    SECRET,
  );
}

function request(body: Record<string, unknown>) {
  return new NextRequest('https://agiworkforce.com/api/upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/upgrade — Team seat quantity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    dbMocks.execute.mockResolvedValue(1);
    stripeMocks.retrieveSubscription.mockResolvedValue(teamSubscription(5));
    pricingMocks.getPriceSelectionForCurrency.mockResolvedValue({
      priceId: 'price_team_usd',
      currency: 'usd',
      amountMinor: 2_000,
    });
    stripeMocks.updateSubscription.mockResolvedValue({
      id: 'sub_live123',
      pending_update: null,
      items: {
        data: [
          {
            price: {
              id: 'price_team_usd',
              recurring: { interval: 'month', interval_count: 1 },
            },
            quantity: 20,
          },
        ],
      },
    });
  });

  it('applies the requested seat count as the subscription item quantity', async () => {
    const response = await POST(
      request({
        plan: 'team',
        billingInterval: 'monthly',
        seats: 20,
        previewToken: tokenFor(20),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, newPlan: 'team', seats: 20 });
    expect(stripeMocks.updateSubscription).toHaveBeenCalledWith(
      'sub_live123',
      expect.objectContaining({
        items: [{ id: 'si_123', price: 'price_team_usd', quantity: 20 }],
      }),
      expect.any(Object),
    );
  });

  it('puts the seat count in the Stripe idempotency key', async () => {
    // Same subscription, same prices, same proration second, different seat
    // count: without quantity in the key Stripe replays the first result and the
    // org gets seats it did not pay for.
    await POST(
      request({
        plan: 'team',
        billingInterval: 'monthly',
        seats: 20,
        previewToken: tokenFor(20),
      }),
    );

    const options = stripeMocks.updateSubscription.mock.calls[0]?.[2] as {
      idempotencyKey: string;
    };
    expect(options.idempotencyKey).toBe(
      `upgrade:sub_live123:price_team_usd:price_team_usd:20:${PRORATION_DATE}`,
    );
    expect(options.idempotencyKey).toContain(':20:');
  });

  it('refuses a preview token issued for a different seat count', async () => {
    // Forgery guard: previewing 6 seats and applying 200 would charge the
    // 6-seat proration for a 200-seat subscription.
    const response = await POST(
      request({
        plan: 'team',
        billingInterval: 'monthly',
        seats: 200,
        previewToken: tokenFor(6),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringMatching(/preview/i) },
    });
    expect(stripeMocks.updateSubscription).not.toHaveBeenCalled();
  });

  it('refuses a seat reduction before any Stripe mutation', async () => {
    const response = await POST(
      request({
        plan: 'team',
        billingInterval: 'monthly',
        seats: 2,
        previewToken: tokenFor(2),
      }),
    );

    expect(response.status).toBe(400);
    expect(stripeMocks.updateSubscription).not.toHaveBeenCalled();
  });

  it('refuses a cadence change before charging because Stripe would reset renewal', async () => {
    const response = await POST(
      request({
        plan: 'team',
        billingInterval: 'yearly',
        seats: 20,
        previewToken: tokenFor(20),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringMatching(/keep your current monthly billing cadence/i) },
    });
    expect(stripeMocks.updateSubscription).not.toHaveBeenCalled();
  });

  it('fails the upgrade when Stripe did not apply the requested seat count', async () => {
    stripeMocks.updateSubscription.mockResolvedValue({
      id: 'sub_live123',
      pending_update: null,
      items: {
        data: [
          {
            price: {
              id: 'price_team_usd',
              recurring: { interval: 'month', interval_count: 1 },
            },
            quantity: 5,
          },
        ],
      },
    });

    const response = await POST(
      request({
        plan: 'team',
        billingInterval: 'monthly',
        seats: 20,
        previewToken: tokenFor(20),
      }),
    );

    // Reporting success here would tell the buyer they own 20 seats while Stripe
    // bills 5.
    expect(response.status).toBe(500);
  });

  it('still refuses a Team apply with no seat count', async () => {
    const response = await POST(
      request({ plan: 'team', billingInterval: 'monthly', previewToken: tokenFor(3) }),
    );

    expect(response.status).toBe(400);
    expect(stripeMocks.updateSubscription).not.toHaveBeenCalled();
  });
});
