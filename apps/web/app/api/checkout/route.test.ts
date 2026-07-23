import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const stripeMocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createCustomer: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
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
  })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: dbMocks.query, execute: dbMocks.execute }),
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    customers = {
      create: stripeMocks.createCustomer,
    };
    checkout = {
      sessions: {
        create: stripeMocks.createCheckoutSession,
      },
    };
  },
}));

import { POST } from './route';

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
    stripeMocks.createCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/cs_test_123',
    });
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

  it('marks a full-price replacement so existing usage can be carried forward', async () => {
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

    expect(response.status).toBe(200);
    expect(stripeMocks.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          user_id: 'user_123',
          plan_tier: 'max_15x',
          upgrade_from: 'max',
          replace_unlinked_entitlement: 'true',
        }),
        subscription_data: {
          metadata: expect.objectContaining({
            user_id: 'user_123',
            plan_tier: 'max_15x',
            upgrade_from: 'max',
            replace_unlinked_entitlement: 'true',
          }),
        },
      }),
    );
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
});
