import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const stripeMocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createCustomer: vi.fn(),
  listSubscriptions: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(
    async (
      callback: (tx: { query: typeof dbMocks.query; execute: typeof dbMocks.execute }) => unknown,
    ) => callback({ query: dbMocks.query, execute: dbMocks.execute }),
  ),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@shared/utils/env', () => ({
  getOptionalEnv: vi.fn(() => 'sk_test_dummy'),
  requireEnv: vi.fn(() => 'sk_test_dummy'),
}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'user_123' })),
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: vi.fn(async () => ({
        primaryEmailAddressId: 'email_1',
        emailAddresses: [{ id: 'email_1', emailAddress: 'investor@example.com' }],
      })),
    },
  })),
}));
vi.mock('@/lib/server/localized-pricing-service', () => ({
  getCheckoutPriceSelection: vi.fn(async () => ({
    priceId: 'price_max_15x_monthly',
    currency: 'usd',
    amountMinor: 20_000,
  })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: dbMocks.query,
      execute: dbMocks.execute,
      transaction: dbMocks.transaction,
    },
    userId: 'user_123',
    organizationId: null,
  })),
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    customers = {
      create: stripeMocks.createCustomer,
    };
    subscriptions = {
      list: stripeMocks.listSubscriptions,
    };
    checkout = {
      sessions: {
        create: stripeMocks.createCheckoutSession,
      },
    };
  },
}));

import { POST } from './route';
import { getUserScopedDb } from '@/lib/server/rls-db';

function makeRequest(plan: 'pro' | 'max_15x' = 'max_15x') {
  return new NextRequest('https://agiworkforce.com/api/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-vercel-ip-country': 'US',
    },
    body: JSON.stringify({ plan, billingInterval: 'monthly' }),
  });
}

describe('POST /api/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://agiworkforce.com';
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) return [];
      if (sql.includes('from profiles')) return [];
      return [];
    });
    dbMocks.execute.mockResolvedValue(1);
    stripeMocks.createCustomer.mockResolvedValue({ id: 'cus_123' });
    stripeMocks.listSubscriptions.mockResolvedValue({ data: [] });
    stripeMocks.createCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/cs_test_123',
    });
  });

  it('reads and writes the profile row on the caller connection, never the bare pool', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(dbMocks.query).toHaveBeenCalledWith(
      'select stripe_customer_id from profiles where id = $1 limit 1',
      ['user_123'],
    );
    expect(dbMocks.execute).toHaveBeenCalledWith(
      'update profiles set stripe_customer_id = $1 where id = $2',
      ['cus_123', 'user_123'],
    );
  });

  it('returns successful checkout to billing so subscription state can refresh', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(stripeMocks.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url:
          'https://agiworkforce.com/billing?success=true&session_id={CHECKOUT_SESSION_ID}',
      }),
    );
  });

  it('passes a validated caller idempotency key into Stripe session creation', async () => {
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-ip-country': 'US',
          'Idempotency-Key': 'agi.checkout.desktop.request-1',
        },
        body: JSON.stringify({ plan: 'max_15x', billingInterval: 'monthly' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(stripeMocks.createCheckoutSession).toHaveBeenCalledWith(expect.any(Object), {
      idempotencyKey: 'checkout:user_123:max_15x:1:agi.checkout.desktop.request-1',
    });
  });

  it('refuses an active organization-managed entitlement before creating Stripe state', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) {
        return [
          {
            status: 'active',
            plan_tier: 'max',
            stripe_customer_id: 'cus_123',
            stripe_subscription_id: null,
          },
        ];
      }
      if (sql.includes('from profiles')) return [{ stripe_customer_id: 'cus_123' }];
      return [];
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(409);
    expect(stripeMocks.createCustomer).not.toHaveBeenCalled();
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it.each([
    ['apple_original_transaction_id', 'apple-tx-1'],
    ['google_purchase_token', 'play-token-1'],
  ])(
    'refuses to sell over a subscription the store still bills (%s)',
    async (storeIdColumn, storeId) => {
      dbMocks.query.mockImplementation(async (sql: string) => {
        if (sql.includes('from subscriptions')) {
          return [
            {
              status: 'active',
              plan_tier: 'pro',
              stripe_customer_id: null,
              stripe_subscription_id: null,
              [storeIdColumn]: storeId,
            },
          ];
        }
        if (sql.includes('from profiles')) return [];
        return [];
      });

      const response = await POST(makeRequest('max_15x'));

      expect(response.status).toBe(409);
      expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['apple_original_transaction_id', 'apple-tx-ended'],
    ['google_purchase_token', 'play-token-ended'],
  ])('allows a fresh checkout after the %s subscription ended', async (storeIdColumn, storeId) => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) {
        return [
          {
            status: 'expired',
            plan_tier: 'pro',
            stripe_customer_id: null,
            stripe_subscription_id: null,
            [storeIdColumn]: storeId,
          },
        ];
      }
      if (sql.includes('from profiles')) return [];
      return [];
    });

    const response = await POST(makeRequest('max_15x'));

    expect(response.status).toBe(200);
    expect(stripeMocks.createCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the row contains contradictory billing owners', async () => {
    dbMocks.query.mockImplementation(async (sql: string) =>
      sql.includes('from subscriptions')
        ? [
            {
              status: 'canceled',
              plan_tier: 'pro',
              stripe_customer_id: 'cus_123',
              stripe_subscription_id: 'sub_live123',
              apple_original_transaction_id: 'apple-tx-1',
            },
          ]
        : [],
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(409);
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('does not let an unlinked paid entitlement bypass downgrade controls', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) {
        return [
          {
            status: 'active',
            plan_tier: 'max',
            stripe_customer_id: 'cus_123',
            stripe_subscription_id: null,
          },
        ];
      }
      if (sql.includes('from profiles')) return [{ stripe_customer_id: 'cus_123' }];
      return [];
    });

    const response = await POST(makeRequest('pro'));

    expect(response.status).toBe(409);
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('refuses to replace a negotiated enterprise entitlement with a self-serve plan', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) {
        return [
          {
            status: 'active',
            plan_tier: 'enterprise',
            stripe_customer_id: 'cus_123',
            stripe_subscription_id: null,
          },
        ];
      }
      if (sql.includes('from profiles')) return [{ stripe_customer_id: 'cus_123' }];
      return [];
    });

    const response = await POST(makeRequest('pro'));

    expect(response.status).toBe(409);
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  describe('duplicate purchase against a delayed webhook', () => {
    function returningCustomerWithNoRecordedSubscription() {
      dbMocks.query.mockImplementation(async (sql: string) => {
        if (sql.includes('from subscriptions')) return [];
        if (sql.includes('from profiles')) return [{ stripe_customer_id: 'cus_123' }];
        return [];
      });
    }

    it('refuses a second checkout while Stripe is already billing the customer', async () => {
      returningCustomerWithNoRecordedSubscription();
      stripeMocks.listSubscriptions.mockImplementation(async ({ status }: { status: string }) =>
        status === 'active' ? { data: [{ id: 'sub_live_1', status: 'active' }] } : { data: [] },
      );

      const response = await POST(makeRequest());

      expect(response.status).toBe(409);
      expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('refuses on a trialing or past_due subscription too', async () => {
      for (const liveStatus of ['trialing', 'past_due']) {
        vi.clearAllMocks();
        returningCustomerWithNoRecordedSubscription();
        stripeMocks.listSubscriptions.mockImplementation(async ({ status }: { status: string }) =>
          status === liveStatus
            ? { data: [{ id: 'sub_live_1', status: liveStatus }] }
            : { data: [] },
        );

        const response = await POST(makeRequest());

        expect(response.status, liveStatus).toBe(409);
        expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
      }
    });

    it('lets a returning customer with no live Stripe subscription buy', async () => {
      returningCustomerWithNoRecordedSubscription();

      const response = await POST(makeRequest());

      expect(response.status).toBe(200);
      expect(stripeMocks.createCheckoutSession).toHaveBeenCalledTimes(1);
    });

    it('does not create checkout when Stripe subscription state cannot be read', async () => {
      returningCustomerWithNoRecordedSubscription();
      stripeMocks.listSubscriptions.mockRejectedValue(new Error('stripe unavailable'));

      const response = await POST(makeRequest());

      expect(response.status).toBe(503);
      expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('does not spend a Stripe call on a first-time buyer', async () => {
      const response = await POST(makeRequest());

      expect(response.status).toBe(200);
      expect(stripeMocks.listSubscriptions).not.toHaveBeenCalled();
    });

    // Production, 2026-08-20: every customer created against the test-mode key
    // became an id the live account does not have, and the unreadable-state
    // branch above turned that into a permanent 503 for those accounts.
    it('replaces a stored customer this Stripe account does not have', async () => {
      returningCustomerWithNoRecordedSubscription();
      // A distinct id so the assertions below cannot pass on the stale one.
      stripeMocks.createCustomer.mockResolvedValue({ id: 'cus_new_1' });
      stripeMocks.listSubscriptions.mockRejectedValue(
        Object.assign(new Error("No such customer: 'cus_123'"), { code: 'resource_missing' }),
      );

      const response = await POST(makeRequest());

      expect(response.status).toBe(200);
      expect(stripeMocks.createCustomer).toHaveBeenCalledTimes(1);
      // The dead link must not outlive the request that found it.
      expect(dbMocks.execute).toHaveBeenCalledWith(
        expect.stringContaining('update profiles set stripe_customer_id'),
        expect.arrayContaining(['cus_new_1']),
      );
      expect(stripeMocks.createCheckoutSession).toHaveBeenCalledTimes(1);
    });
  });

  it('does not create a customer or checkout when billing state cannot be verified', async () => {
    dbMocks.query.mockReset().mockRejectedValue(new Error('database unavailable'));

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(stripeMocks.createCustomer).not.toHaveBeenCalled();
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  describe('Team per-seat checkout', () => {
    function teamRequest(body: Record<string, unknown>, idempotencyKey?: string) {
      return new NextRequest('https://agiworkforce.com/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-ip-country': 'US',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });
    }

    it('charges the purchased seat count as the Stripe line-item quantity', async () => {
      const response = await POST(
        teamRequest({ plan: 'team', billingInterval: 'monthly', seats: 25 }),
      );

      expect(response.status).toBe(200);
      expect(stripeMocks.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_max_15x_monthly', quantity: 25 }],
        }),
      );
    });

    it('records the requested seat count in metadata for reconciliation', async () => {
      await POST(teamRequest({ plan: 'team', billingInterval: 'monthly', seats: 3 }));

      expect(stripeMocks.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ plan_tier: 'team', requested_seats: '3' }),
          subscription_data: {
            metadata: expect.objectContaining({ plan_tier: 'team', requested_seats: '3' }),
          },
        }),
      );
    });

    it('refuses a Team checkout with no seat count instead of billing one seat', async () => {
      const response = await POST(teamRequest({ plan: 'team', billingInterval: 'monthly' }));

      expect(response.status).toBe(400);
      expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('refuses a seat count on a per-account plan', async () => {
      const response = await POST(
        teamRequest({ plan: 'pro', billingInterval: 'monthly', seats: 50 }),
      );

      expect(response.status).toBe(400);
      expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('refuses a zero or fractional seat count', async () => {
      for (const seats of [0, -1, 2.5]) {
        vi.clearAllMocks();
        stripeMocks.createCheckoutSession.mockResolvedValue({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.test/cs_test_123',
        });
        const response = await POST(
          teamRequest({ plan: 'team', billingInterval: 'monthly', seats }),
        );
        expect(response.status, `seats=${seats}`).toBe(400);
        expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
      }
    });

    it('keeps the seat count inside the Stripe idempotency key', async () => {
      await POST(
        teamRequest({ plan: 'team', billingInterval: 'monthly', seats: 5 }, 'agi.team.request-1'),
      );
      await POST(
        teamRequest({ plan: 'team', billingInterval: 'monthly', seats: 40 }, 'agi.team.request-1'),
      );

      const keys = stripeMocks.createCheckoutSession.mock.calls.map(
        (call) => (call[1] as { idempotencyKey: string }).idempotencyKey,
      );
      expect(keys).toEqual([
        'checkout:user_123:team:5:agi.team.request-1',
        'checkout:user_123:team:40:agi.team.request-1',
      ]);
      expect(new Set(keys).size).toBe(2);
    });
  });
});
