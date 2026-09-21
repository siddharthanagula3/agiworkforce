import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const stripeMocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createCustomer: vi.fn(),
  listSubscriptions: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
// These cases are about what a PERMITTED checkout binds; the upgrade gate has its own suite.
vi.mock('@/lib/server/billing-waitlist-access', () => ({
  hasBillingWaitlistAccess: vi.fn(async () => true),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@shared/utils/env', () => ({
  getOptionalEnv: vi.fn(() => 'configured'),
  requireEnv: vi.fn(() => 'configured'),
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityUser: vi.fn(async () => ({ primaryEmail: 'buyer@example.com' })),
  getRequestIdentity: vi.fn(async () => ({ userId: AUTHENTICATED_USER })),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  logRateLimitExceeded: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
}));

const priceSelection = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/localized-pricing-service', () => ({
  getCheckoutPriceSelection: priceSelection,
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: dbMocks.query, execute: dbMocks.execute },
    userId: AUTHENTICATED_USER,
    organizationId: null,
  })),
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    static errors = {
      StripeError: class extends Error {},
      StripeCardError: class extends Error {},
      StripeInvalidRequestError: class extends Error {},
      StripeAuthenticationError: class extends Error {},
      StripeRateLimitError: class extends Error {},
      StripeConnectionError: class extends Error {},
    };
    customers = { create: stripeMocks.createCustomer };
    subscriptions = { list: stripeMocks.listSubscriptions };
    checkout = { sessions: { create: stripeMocks.createCheckoutSession } };
  },
}));

import type Stripe from 'stripe';
import {
  BILLING_PLAN_PRICING,
  SELF_SERVE_PAID_PLAN_TIERS,
  isPerSeatBillingPlan,
} from '@agiworkforce/types';
import { CheckoutRequestSchema, resolveCheckoutQuantity } from '@/lib/validations/checkout';
import { resolveCheckoutPlan } from '@/lib/services/plan-catalog-service';
import { POST } from './route';

const AUTHENTICATED_USER = 'user_authenticated';
const APP_ORIGIN = 'https://agiworkforce.com';
const STORED_CUSTOMER = 'cus_authenticated';
const INTERVALS = ['monthly', 'yearly'] as const;

interface PurchasableCombination {
  plan: string;
  billingInterval: (typeof INTERVALS)[number];
  seats?: number;
}

// Every body the request schema accepts, taken from the shared plan catalog
// rather than from a list written out here.
const PURCHASABLE: PurchasableCombination[] = SELF_SERVE_PAID_PLAN_TIERS.flatMap((plan) =>
  INTERVALS.map((billingInterval) => ({
    plan,
    billingInterval,
    ...(isPerSeatBillingPlan(plan) ? { seats: 4 } : {}),
  })),
).filter((combination) => CheckoutRequestSchema.safeParse(combination).success);

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${APP_ORIGIN}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-ip-country': 'US', ...headers },
    body: JSON.stringify(body),
  });
}

function createdSession(): Stripe.Checkout.SessionCreateParams {
  return stripeMocks.createCheckoutSession.mock.calls.at(
    -1,
  )?.[0] as Stripe.Checkout.SessionCreateParams;
}

describe('checkout binds price, plan and customer on the server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['NEXT_PUBLIC_APP_URL'] = APP_ORIGIN;
    process.env['ALLOWED_ORIGINS'] = APP_ORIGIN;
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) return [];
      if (sql.includes('from profiles')) return [{ stripe_customer_id: STORED_CUSTOMER }];
      return [];
    });
    dbMocks.execute.mockResolvedValue(1);
    stripeMocks.createCustomer.mockResolvedValue({ id: STORED_CUSTOMER });
    stripeMocks.listSubscriptions.mockResolvedValue({ data: [] });
    stripeMocks.createCheckoutSession.mockResolvedValue({
      id: 'cs_1',
      url: 'https://checkout.stripe.test/cs_1',
    });
    priceSelection.mockImplementation(async (plan: string, interval: string) => ({
      priceId: `price_${plan}_${interval}`,
      currency: 'usd',
      amountMinor: 1_000,
    }));
  });

  it('offers at least one purchasable combination per self-serve tier', () => {
    expect(new Set(PURCHASABLE.map((combination) => combination.plan))).toEqual(
      new Set(SELF_SERVE_PAID_PLAN_TIERS),
    );
  });

  it.each(
    PURCHASABLE.map(
      (combination) => [`${combination.plan} ${combination.billingInterval}`, combination] as const,
    ),
  )('takes the %s price from the server catalog', async (_label, combination) => {
    const response = await POST(request(combination));
    expect(response.status).toBe(200);

    expect(priceSelection).toHaveBeenCalledWith(
      resolveCheckoutPlan(combination.plan),
      combination.billingInterval,
      'US',
    );
    const selection = await priceSelection.mock.results.at(-1)!.value;
    const session = createdSession();
    expect(session.line_items).toEqual([
      { price: selection.priceId, quantity: resolveCheckoutQuantity(combination) },
    ]);
    expect(session.currency).toBe(selection.currency);
    expect(session.mode).toBe('subscription');
  });

  it.each(
    PURCHASABLE.map(
      (combination) => [`${combination.plan} ${combination.billingInterval}`, combination] as const,
    ),
  )('binds the %s session to the authenticated account', async (_label, combination) => {
    await POST(request(combination));
    const session = createdSession();
    expect(session.client_reference_id).toBe(AUTHENTICATED_USER);
    expect(session.metadata).toMatchObject({
      user_id: AUTHENTICATED_USER,
      plan_tier: resolveCheckoutPlan(combination.plan),
    });
    expect(session.subscription_data?.metadata).toMatchObject({ user_id: AUTHENTICATED_USER });
    expect(session.customer).toBe(STORED_CUSTOMER);
    expect(session.customer_email).toBeUndefined();
  });

  it.each([
    ['price', { price: 'price_attacker_free' }],
    ['priceId', { priceId: 'price_attacker_free' }],
    ['amount', { amount: 1 }],
    ['amountMinor', { amountMinor: 1 }],
    ['currency', { currency: 'xxx' }],
    ['unit_amount', { unit_amount: 0 }],
    ['success_url', { success_url: 'https://evil.test/paid' }],
    ['cancel_url', { cancel_url: 'https://evil.test/cancel' }],
    ['customer', { customer: 'cus_someone_else' }],
    ['client_reference_id', { client_reference_id: 'user_someone_else' }],
    ['metadata', { metadata: { user_id: 'user_someone_else' } }],
    ['coupon', { coupon: 'FREEFOREVER' }],
    ['trial_period_days', { trial_period_days: 3650 }],
  ])('refuses a request that tries to set %s itself', async (_key, injected) => {
    const response = await POST(request({ plan: 'pro', billingInterval: 'monthly', ...injected }));
    expect(response.status).toBe(400);
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('refuses a plan the catalog does not sell self-serve', async () => {
    for (const plan of ['enterprise', 'free', 'byok', 'local-only', 'not-a-plan']) {
      const response = await POST(request({ plan, billingInterval: 'monthly' }));
      expect(response.status).toBe(400);
    }
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('refuses an interval the catalog does not price', async () => {
    const unpriced = SELF_SERVE_PAID_PLAN_TIERS.filter(
      (plan) => !BILLING_PLAN_PRICING[plan].yearlyPriceUsd,
    );
    expect(unpriced.length).toBeGreaterThan(0);
    for (const plan of unpriced) {
      const body = {
        plan,
        billingInterval: 'yearly',
        ...(isPerSeatBillingPlan(plan) ? { seats: 4 } : {}),
      };
      expect(await POST(request(body)).then((response) => response.status)).toBe(400);
    }
  });

  it.each([
    'https://evil.test',
    'https://agiworkforce.com.evil.test',
    'http://agiworkforce.com',
    'https://checkout.stripe.com',
    'null',
  ])(
    'keeps the return URLs on this origin when the request claims to come from %s',
    async (origin) => {
      await POST(request({ plan: 'pro', billingInterval: 'monthly' }, { origin }));
      const session = createdSession();
      for (const url of [session.success_url, session.cancel_url]) {
        expect(new URL(String(url)).origin).toBe(APP_ORIGIN);
        expect(String(url).startsWith(`${APP_ORIGIN}/`)).toBe(true);
      }
    },
  );

  it('never lets a checkout be created for a customer the caller does not own', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) return [];
      if (sql.includes('from profiles')) return [{ stripe_customer_id: null }];
      return [];
    });
    await POST(request({ plan: 'pro', billingInterval: 'monthly' }));
    expect(stripeMocks.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { user_id: AUTHENTICATED_USER } }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining(AUTHENTICATED_USER) }),
    );
  });
});
