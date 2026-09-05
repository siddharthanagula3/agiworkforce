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

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const stripeErrors = vi.hoisted(() => {
  class StripeError extends Error {
    type: string;
    code?: string;
    param?: string;
    constructor(raw: { message: string; type: string; code?: string; param?: string }) {
      super(raw.message);
      this.type = raw.type;
      this.code = raw.code;
      this.param = raw.param;
    }
  }
  class StripeInvalidRequestError extends StripeError {}
  class StripeCardError extends StripeError {}
  class StripeAuthenticationError extends StripeError {}
  class StripeRateLimitError extends StripeError {}
  class StripeConnectionError extends StripeError {}
  return {
    StripeError,
    StripeInvalidRequestError,
    StripeCardError,
    StripeAuthenticationError,
    StripeRateLimitError,
    StripeConnectionError,
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));
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
vi.mock('stripe', () => {
  class StripeMock {
    static errors = stripeErrors;
    customers = { create: stripeMocks.createCustomer };
    subscriptions = { list: stripeMocks.listSubscriptions };
    checkout = { sessions: { create: stripeMocks.createCheckoutSession } };
  }
  return { default: StripeMock };
});

import { POST } from './route';

function makeRequest() {
  return new NextRequest('https://agiworkforce.com/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-ip-country': 'DE' },
    body: JSON.stringify({ plan: 'max_15x', billingInterval: 'monthly' }),
  });
}

function loggedStripeRejection() {
  return loggerMock.error.mock.calls.find(
    (call) => call[1] === 'Stripe rejected checkout session creation',
  );
}

describe('POST /api/checkout when Stripe rejects the tax configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://agiworkforce.com';
    dbMocks.query.mockImplementation(async () => []);
    dbMocks.execute.mockResolvedValue(1);
    stripeMocks.createCustomer.mockResolvedValue({ id: 'cus_123' });
    stripeMocks.listSubscriptions.mockResolvedValue({ data: [] });
  });

  it('records why Stripe refused the session instead of only the sanitised buyer message', async () => {
    stripeMocks.createCheckoutSession.mockRejectedValue(
      new stripeErrors.StripeInvalidRequestError({
        message:
          'You cannot use automatic tax on this Checkout Session because you have not set an origin address in your Stripe Tax settings.',
        type: 'invalid_request_error',
        code: 'tax_origin_address_required',
        param: 'automatic_tax[enabled]',
      }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(400);

    const logged = loggedStripeRejection();
    expect(logged, 'the Stripe rejection reason must reach the logs').toBeDefined();
    expect(logged?.[0]).toMatchObject({
      userId: 'user_123',
      priceId: 'price_max_15x_monthly',
      plan: 'max_15x',
      stripeErrorCode: 'tax_origin_address_required',
      stripeErrorParam: 'automatic_tax[enabled]',
    });
    expect(String((logged?.[0] as { stripeErrorMessage: string }).stripeErrorMessage)).toContain(
      'origin address',
    );
  });

  it('logs the reason for non-tax Stripe failures too', async () => {
    stripeMocks.createCheckoutSession.mockRejectedValue(
      new stripeErrors.StripeAuthenticationError({
        message: 'Invalid API Key provided',
        type: 'authentication_error',
        code: 'api_key_expired',
      }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(503);
    expect(loggedStripeRejection()?.[0]).toMatchObject({ stripeErrorCode: 'api_key_expired' });
  });
});
