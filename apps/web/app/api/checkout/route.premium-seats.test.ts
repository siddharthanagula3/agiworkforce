import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const stripeMocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  listCheckoutSessions: vi.fn(),
  expireCheckoutSession: vi.fn(),
  retrieveCheckoutSession: vi.fn(),
  createCustomer: vi.fn(),
  listSubscriptions: vi.fn(),
}));

const stripeErrors = vi.hoisted(() => {
  class StripeError extends Error {}
  return {
    StripeError,
    StripeCardError: class extends StripeError {},
    StripeInvalidRequestError: class extends StripeError {},
    StripeAuthenticationError: class extends StripeError {},
    StripeRateLimitError: class extends StripeError {},
    StripeConnectionError: class extends StripeError {},
  };
});

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));

interface PriceSelection {
  priceId: string;
  currency: string;
  amountMinor: number;
}

const priceMocks = vi.hoisted(() => ({
  select:
    vi.fn<(plan: string, interval: string, country: string) => Promise<PriceSelection | null>>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@shared/utils/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/utils/env')>()),
  getOptionalEnv: vi.fn(() => 'sk_test_dummy'),
  requireEnv: vi.fn(() => 'sk_test_dummy'),
}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'user_owner' })),
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: vi.fn(async () => ({
        primaryEmailAddressId: 'email_1',
        emailAddresses: [{ id: 'email_1', emailAddress: 'owner@example.com' }],
      })),
    },
  })),
}));
vi.mock('@/lib/server/localized-pricing-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/localized-pricing-service')>()),
  getCheckoutPriceSelection: priceMocks.select,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: dbMocks.query, execute: dbMocks.execute },
    userId: 'user_owner',
    organizationId: null,
  })),
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    static errors = stripeErrors;
    customers = { create: stripeMocks.createCustomer };
    subscriptions = { list: stripeMocks.listSubscriptions };
    checkout = {
      sessions: {
        create: stripeMocks.createCheckoutSession,
        list: stripeMocks.listCheckoutSessions,
        expire: stripeMocks.expireCheckoutSession,
        retrieve: stripeMocks.retrieveCheckoutSession,
      },
    };
  },
}));

import { POST } from './route';

const STANDARD: PriceSelection = { priceId: 'price_team_usd', currency: 'usd', amountMinor: 2_500 };
const PREMIUM: PriceSelection = {
  priceId: 'price_team_premium_usd',
  currency: 'usd',
  amountMinor: 12_500,
};

function teamCheckout(body: Record<string, unknown>, country = 'US') {
  return new NextRequest('https://agiworkforce.com/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-ip-country': country },
    body: JSON.stringify({ plan: 'team', billingInterval: 'monthly', ...body }),
  });
}

function grantWaitlistAccess(granted: boolean) {
  dbMocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('beta_redemptions')) return [{ granted }];
    return [];
  });
}

function createdSession() {
  return stripeMocks.createCheckoutSession.mock.calls[0]?.[0] as {
    line_items: Array<{ price: string; quantity: number }>;
    metadata: Record<string, string>;
    subscription_data: { metadata: Record<string, string> };
  };
}

describe('POST /api/checkout with Premium seats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '');
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://agiworkforce.com';
    grantWaitlistAccess(true);
    dbMocks.execute.mockResolvedValue(1);
    priceMocks.select.mockImplementation(async (plan) =>
      plan === 'team_premium' ? PREMIUM : STANDARD,
    );
    stripeMocks.createCustomer.mockResolvedValue({ id: 'cus_owner' });
    stripeMocks.listSubscriptions.mockResolvedValue({ data: [] });
    stripeMocks.listCheckoutSessions.mockResolvedValue({ data: [] });
    stripeMocks.createCheckoutSession.mockResolvedValue({
      id: 'cs_team',
      created: 1_800_000_100,
      url: 'https://checkout.stripe.test/cs_team',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('bills a mixed team as one subscription with a line per seat type', async () => {
    const response = await POST(teamCheckout({ seats: 5, premiumSeats: 2 }));

    expect(response.status).toBe(200);
    expect(stripeMocks.createCheckoutSession).toHaveBeenCalledTimes(1);
    const session = createdSession();
    expect(session.line_items).toEqual([
      { price: STANDARD.priceId, quantity: 3 },
      { price: PREMIUM.priceId, quantity: 2 },
    ]);
    expect(session.metadata).toMatchObject({
      plan_tier: 'team',
      requested_seats: '5',
      requested_premium_seats: '2',
    });
    expect(session.subscription_data.metadata['plan_tier']).toBe('team');
  });

  it('sends no empty Standard line when every seat is Premium', async () => {
    const response = await POST(teamCheckout({ seats: 2, premiumSeats: 2 }));

    expect(response.status).toBe(200);
    expect(createdSession().line_items).toEqual([{ price: PREMIUM.priceId, quantity: 2 }]);
  });

  it('keeps a Standard-only team on its single line and never looks up the Premium price', async () => {
    const response = await POST(teamCheckout({ seats: 4 }));

    expect(response.status).toBe(200);
    expect(createdSession().line_items).toEqual([{ price: STANDARD.priceId, quantity: 4 }]);
    expect(priceMocks.select.mock.calls.map(([plan]) => plan)).toEqual(['team']);
  });

  it('holds Premium seats behind the same waitlist gate as every paid plan', async () => {
    grantWaitlistAccess(false);

    const response = await POST(teamCheckout({ seats: 5, premiumSeats: 2 }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'waitlist_access_required' },
    });
    expect(stripeMocks.createCustomer).not.toHaveBeenCalled();
    expect(stripeMocks.listCheckoutSessions).not.toHaveBeenCalled();
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('opens the gate for Premium seats only when the owner opens paid plans to everyone', async () => {
    grantWaitlistAccess(false);
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '1');

    const response = await POST(teamCheckout({ seats: 5, premiumSeats: 2 }));

    expect(response.status).toBe(200);
  });

  it('refuses Premium seats while their Stripe price is not configured, and creates nothing', async () => {
    priceMocks.select.mockImplementation(async (plan) =>
      plan === 'team_premium' ? null : STANDARD,
    );

    const response = await POST(teamCheckout({ seats: 5, premiumSeats: 1 }));

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain('Premium seats are not available');
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('refuses to mix a rupee Standard seat with a dollar Premium seat', async () => {
    priceMocks.select.mockImplementation(async (plan) =>
      plan === 'team_premium'
        ? PREMIUM
        : { priceId: 'price_team_inr', currency: 'inr', amountMinor: 199_900 },
    );

    const response = await POST(teamCheckout({ seats: 5, premiumSeats: 1 }, 'IN'));

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain('Premium seats are not sold in INR');
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it.each([
    ['more Premium seats than seats', { seats: 3, premiumSeats: 4 }],
    ['a negative Premium count', { seats: 3, premiumSeats: -1 }],
    ['a fractional Premium count', { seats: 3, premiumSeats: 1.5 }],
  ])('rejects %s before any price or Stripe lookup', async (_label, body) => {
    const response = await POST(teamCheckout(body));

    expect(response.status).toBe(400);
    expect(priceMocks.select).not.toHaveBeenCalled();
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects a Premium seat count on a plan that has no seat types', async () => {
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly', premiumSeats: 1 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('cannot be checked out for as a plan of its own', async () => {
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'team_premium', billingInterval: 'monthly', seats: 2 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });
});
