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

const trialMocks = vi.hoisted(() => ({ trialDays: vi.fn((_plan: string): number | null => null) }));
const waitlistAccessMocks = vi.hoisted(() => ({
  hasAccess: vi.fn(async () => true),
}));

vi.mock('server-only', () => ({}));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  getPlanTrialDays: trialMocks.trialDays,
}));
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
vi.mock('@/lib/server/billing-waitlist-access', () => ({
  hasBillingWaitlistAccess: waitlistAccessMocks.hasAccess,
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

function makeRequest() {
  return new NextRequest('https://agiworkforce.com/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-ip-country': 'US' },
    body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
  });
}

function sessionParams(): Record<string, unknown> {
  return stripeMocks.createCheckoutSession.mock.calls[0]?.[0] as Record<string, unknown>;
}

function subscriptionData(): Record<string, unknown> {
  return sessionParams()['subscription_data'] as Record<string, unknown>;
}

describe('POST /api/checkout, trials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://agiworkforce.com';
    trialMocks.trialDays.mockReturnValue(null);
    dbMocks.query.mockImplementation(async () => []);
    dbMocks.execute.mockResolvedValue(1);
    stripeMocks.createCustomer.mockResolvedValue({ id: 'cus_123' });
    stripeMocks.listSubscriptions.mockResolvedValue({ data: [] });
    stripeMocks.createCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/cs_test_123',
    });
    waitlistAccessMocks.hasAccess.mockResolvedValue(true);
  });

  it('starts no trial while the catalog sets no trial length', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(subscriptionData()).not.toHaveProperty('trial_period_days');
    expect(sessionParams()).not.toHaveProperty('payment_method_collection');
  });

  it('gives a first-time subscriber the catalog trial and cancels it without a card', async () => {
    trialMocks.trialDays.mockReturnValue(14);

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(trialMocks.trialDays).toHaveBeenCalledWith('pro');
    expect(subscriptionData()).toMatchObject({
      trial_period_days: 14,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    });
    expect(sessionParams()['payment_method_collection']).toBe('always');
  });

  it('gives no second trial to an account that already had a subscription', async () => {
    trialMocks.trialDays.mockReturnValue(14);
    dbMocks.query.mockImplementation(async (sql: string) =>
      sql.includes('from subscriptions')
        ? [
            {
              status: 'canceled',
              plan_tier: 'free',
              stripe_customer_id: 'cus_123',
              stripe_subscription_id: 'sub_1OldSubscriptionAbc123',
              apple_original_transaction_id: null,
              google_purchase_token: null,
              current_period_end: null,
            },
          ]
        : [],
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(subscriptionData()).not.toHaveProperty('trial_period_days');
  });

  it('gives no trial to a returning Stripe customer with subscription history', async () => {
    trialMocks.trialDays.mockReturnValue(14);
    dbMocks.query.mockImplementation(async (sql: string) =>
      sql.includes('from profiles') ? [{ stripe_customer_id: 'cus_123' }] : [],
    );
    stripeMocks.listSubscriptions.mockImplementation(async ({ status }: { status: string }) =>
      status === 'all' ? { data: [{ id: 'sub_old_1', status: 'canceled' }] } : { data: [] },
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(subscriptionData()).not.toHaveProperty('trial_period_days');
  });

  it('checks out without a trial when trial history cannot be read', async () => {
    trialMocks.trialDays.mockReturnValue(14);
    dbMocks.query.mockImplementation(async (sql: string) =>
      sql.includes('from profiles') ? [{ stripe_customer_id: 'cus_123' }] : [],
    );
    stripeMocks.listSubscriptions.mockImplementation(async ({ status }: { status: string }) => {
      if (status === 'all') throw new Error('stripe unavailable');
      return { data: [] };
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(subscriptionData()).not.toHaveProperty('trial_period_days');
  });
});
