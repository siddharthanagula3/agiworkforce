import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockCheckoutCreate, mockGetCheckoutPriceSelection, mockDbQuery } = vi.hoisted(() => ({
  mockCheckoutCreate: vi.fn(() => ({
    id: 'test-session-id',
    url: 'https://checkout.stripe.com/test',
  })),
  mockGetCheckoutPriceSelection: vi.fn(),
  mockDbQuery: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(() => null),
  },
}));

vi.mock('@/lib/server/localized-pricing-service', () => ({
  getCheckoutPriceSelection: (...args: unknown[]) => mockGetCheckoutPriceSelection(...args),
}));

const identityState = vi.hoisted(() => ({ userId: 'test-user-id' as string | null }));
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: identityState.userId, getToken: async () => 'jwt' })),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => {
    const { userId } = identityState;
    if (!userId) {
      const { createError } = await import('@/lib/errors');
      throw createError.unauthorized();
    }
    return {
      db: {
        query: mockDbQuery,
        execute: vi.fn().mockResolvedValue(1),
        transaction: vi.fn(async (fn: (db: unknown) => unknown) => fn({ query: mockDbQuery })),
      },
      userId,
      organizationId: null,
    };
  }),
}));

vi.mock('stripe', () => {
  class MockStripe {
    checkout = {
      sessions: {
        create: mockCheckoutCreate,
      },
    };
    customers = {
      list: vi.fn(() => ({ data: [] })),
    };
    subscriptions = {
      list: vi.fn(() => ({ data: [] })),
    };
  }
  return {
    default: MockStripe,
    errors: {
      StripeError: class StripeError extends Error {
        type = 'StripeError';
        code = 'test_code';
      },
    },
  };
});

const envSetup = vi.hoisted(() => {
  process.env['STRIPE_CHECKOUT_ENABLED'] = 'true';
  process.env['STRIPE_SECRET_KEY'] = 'sk_test_key';
  return {};
});
void envSetup;

import { POST } from '@/app/api/checkout/route';

describe('POST /api/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_key';
    process.env['STRIPE_CHECKOUT_ENABLED'] = 'true';
    mockGetCheckoutPriceSelection.mockResolvedValue({
      priceId: 'price_pro_monthly',
      currency: 'usd',
      amountMinor: 2_000,
    });
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) return [];
      if (sql.includes('from profiles')) return [{ stripe_customer_id: 'cus_test123' }];
      return [];
    });
    identityState.userId = 'test-user-id';
  });

  it('should return 401 if user is not authenticated', async () => {
    identityState.userId = null;

    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('should validate request body', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'invalid', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toMatch(/Invalid|plan/);
  });

  it('should create checkout session for valid request', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined();
  });

  it('should reject invalid/enterprise plan', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'enterprise', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toMatch(/Invalid|plan/);
  });

  it('keeps Team sales-assisted until seat and organization provisioning is wired', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: 'team', billingInterval: 'monthly' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockGetCheckoutPriceSelection).not.toHaveBeenCalled();
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it('supports Max 15x through the canonical plan schema', async () => {
    mockGetCheckoutPriceSelection.mockResolvedValueOnce({
      priceId: 'price_max_15x_monthly',
      currency: 'usd',
      amountMinor: 20_000,
    });
    const response = await POST(
      new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: 'max_15x', billingInterval: 'monthly' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGetCheckoutPriceSelection).toHaveBeenCalledWith('max_15x', 'monthly', 'US');
  });

  it('derives the charged currency from trusted server geolocation', async () => {
    mockGetCheckoutPriceSelection.mockResolvedValueOnce({
      priceId: 'price_pro_monthly',
      currency: 'inr',
      amountMinor: 99_900,
    });
    const response = await POST(
      new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        headers: { 'x-vercel-ip-country': 'IN' },
        body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGetCheckoutPriceSelection).toHaveBeenCalledWith('pro', 'monthly', 'IN');
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'inr',
        line_items: [{ price: 'price_pro_monthly', quantity: 1 }],
      }),
    );
  });

  it('collects tax and a business tax id on every checkout session', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        billing_address_collection: 'required',
        customer: 'cus_test123',
        customer_update: { address: 'auto', name: 'auto' },
      }),
    );
  });

  it('rejects a client-supplied currency instead of trusting a spoofable value', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          plan: 'pro',
          billingInterval: 'monthly',
          currency: 'inr',
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockGetCheckoutPriceSelection).not.toHaveBeenCalled();
  });

  it('rejects annual checkout for monthly-only plans before selecting a price', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: 'basic', billingInterval: 'yearly' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockGetCheckoutPriceSelection).not.toHaveBeenCalled();
  });

  it('refuses to send an active subscriber through a portal plan-change bypass', async () => {
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) {
        return [
          {
            status: 'active',
            plan_tier: 'pro',
            stripe_customer_id: 'cus_test123',
            stripe_subscription_id: 'sub_test123',
          },
        ];
      }
      return [{ stripe_customer_id: 'cus_test123' }];
    });

    const response = await POST(
      new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: 'max', billingInterval: 'monthly' }),
      }),
    );

    expect(response.status).toBe(409);
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it('fails closed without creating a Stripe session when subscription lookup fails', async () => {
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) {
        throw new Error('database unavailable');
      }
      if (sql.includes('account_status')) return [{ account_status: 'active' }];
      if (sql.includes('from profiles')) return [{ stripe_customer_id: 'cus_test123' }];
      return [];
    });

    const response = await POST(
      new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
      }),
    );

    expect(response.status).toBe(503);
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });
});
