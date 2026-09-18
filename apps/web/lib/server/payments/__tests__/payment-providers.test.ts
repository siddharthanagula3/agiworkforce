import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

const stripeMocks = vi.hoisted(() => ({
  retrieveSession: vi.fn(),
  retrieveSubscription: vi.fn(),
}));
vi.mock('@/lib/server/stripe-client', () => ({
  getStripeClient: () => ({
    checkout: { sessions: { retrieve: stripeMocks.retrieveSession } },
    subscriptions: { retrieve: stripeMocks.retrieveSubscription },
  }),
  getStripeClientOrNull: () => ({
    checkout: { sessions: { retrieve: stripeMocks.retrieveSession } },
    subscriptions: { retrieve: stripeMocks.retrieveSubscription },
  }),
}));

import type Stripe from 'stripe';

import { normalizeAppleStoreNotification } from '../apple-provider';
import { normalizeGoogleSubscriptionNotice } from '../google-provider';
import {
  normalizeStripeCheckoutSession,
  normalizeStripeSubscription,
  stripePaymentProvider,
} from '../stripe-provider';
import {
  PAYMENT_PROVIDERS,
  pollsSubscriptionState,
  resolvePaymentProviderForSubscription,
} from '..';

const SUBSCRIPTION_START = Date.UTC(2026, 8, 1) / 1000;
const SUBSCRIPTION_END = Date.UTC(2026, 9, 1) / 1000;

function stripeSubscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_live_1',
    status: 'active',
    customer: 'cus_1',
    livemode: true,
    cancel_at_period_end: false,
    ended_at: null,
    metadata: { user_id: 'user_1' },
    current_period_start: SUBSCRIPTION_START,
    current_period_end: SUBSCRIPTION_END,
    items: {
      data: [
        {
          quantity: 7,
          price: {
            id: 'price_1',
            product: 'prod_1',
            recurring: { interval: 'month', interval_count: 3 },
          },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe('the Stripe adapter', () => {
  it('emits a normalized subscription and no Stripe object', () => {
    const normalized = normalizeStripeSubscription(stripeSubscription());
    expect(normalized).toEqual({
      provider: 'stripe',
      subscriptionReference: 'sub_live_1',
      customerReference: 'cus_1',
      ownerReference: 'user_1',
      plan: { productReference: 'prod_1', priceReference: 'price_1' },
      status: 'active',
      period: {
        startsAt: new Date(SUBSCRIPTION_START * 1000),
        endsAt: new Date(SUBSCRIPTION_END * 1000),
      },
      interval: { unit: 'month', count: 3 },
      quantity: 7,
      cancelAtPeriodEnd: false,
      endedAt: null,
      environment: 'production',
    });
  });

  it('normalizes an unknown Stripe status to unpaid and says so', () => {
    const normalized = normalizeStripeSubscription(stripeSubscription({ status: 'hibernating' }));
    expect(normalized.status).toBe('unpaid');
    expect(loggerMocks.error).toHaveBeenCalled();
  });

  it('reads a test-mode subscription as sandbox', () => {
    expect(normalizeStripeSubscription(stripeSubscription({ livemode: false })).environment).toBe(
      'sandbox',
    );
  });

  it('turns a checkout session into a purchase with the owner and the plan it names', () => {
    const purchase = normalizeStripeCheckoutSession({
      id: 'cs_test_1',
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: 'user_1',
      metadata: { plan_tier: 'pro' },
      amount_total: 2000,
      currency: 'usd',
      created: SUBSCRIPTION_START,
      expires_at: SUBSCRIPTION_END,
      livemode: true,
    } as unknown as Stripe.Checkout.Session);

    expect(purchase.ownerReference).toBe('user_1');
    expect(purchase.planTier).toBe('pro');
    expect(purchase.state).toBe('paid');
    expect(purchase.amount).toEqual({ currency: 'USD', minorUnits: 2000 });
  });

  it('reports an unpaid but complete session as confirmed, not paid', () => {
    const purchase = normalizeStripeCheckoutSession({
      id: 'cs_test_2',
      status: 'complete',
      payment_status: 'unpaid',
      client_reference_id: 'user_1',
      metadata: {},
      currency: 'usd',
      livemode: true,
    } as unknown as Stripe.Checkout.Session);
    expect(purchase.state).toBe('confirmed');
    expect(purchase.planTier).toBeNull();
  });

  it('refuses a reference that is not a Stripe checkout session', async () => {
    await expect(stripePaymentProvider.verifyPurchase({ reference: 'sub_1' })).rejects.toThrow(
      /checkout session/i,
    );
    expect(stripeMocks.retrieveSession).not.toHaveBeenCalled();
  });

  it('is the only provider that answers a subscription poll', () => {
    expect(pollsSubscriptionState(PAYMENT_PROVIDERS.stripe)).toBe(true);
    expect(pollsSubscriptionState(PAYMENT_PROVIDERS.apple)).toBe(false);
    expect(pollsSubscriptionState(PAYMENT_PROVIDERS.google)).toBe(false);
  });
});

describe('the Apple adapter', () => {
  it('normalizes a signed notification into the same domain object Stripe produces', () => {
    const purchaseDate = Date.UTC(2026, 8, 1);
    const expiresDate = Date.UTC(2026, 9, 1);
    const normalized = normalizeAppleStoreNotification({
      channel: 'production',
      notification: {
        notificationType: 'DID_RENEW',
        subtype: 'AUTO_RENEW_DISABLED',
        data: { status: 1 },
      } as never,
      transaction: {
        originalTransactionId: 'apple_original_1',
        appAccountToken: 'user_1',
        productId: 'com.fixture.pro.monthly',
        purchaseDate,
        expiresDate,
        quantity: 1,
        environment: 'Production',
      } as never,
    });

    expect(normalized).toMatchObject({
      provider: 'apple',
      subscriptionReference: 'apple_original_1',
      ownerReference: 'user_1',
      status: 'active',
      cancelAtPeriodEnd: true,
      environment: 'production',
    });
    expect(normalized?.period).toEqual({
      startsAt: new Date(purchaseDate),
      endsAt: new Date(expiresDate),
    });
  });

  it('has nothing to record when the notification carries no transaction', () => {
    expect(
      normalizeAppleStoreNotification({
        channel: 'sandbox',
        notification: { notificationType: 'TEST', data: { status: 1 } } as never,
        transaction: null,
      }),
    ).toBeNull();
  });
});

describe('the Google adapter', () => {
  it('normalizes RFC 3339 times and the store state vocabulary', () => {
    const normalized = normalizeGoogleSubscriptionNotice({
      purchaseToken: 'token_1',
      productId: 'com.fixture.pro.monthly',
      subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
      startTime: '2026-09-01T00:00:00.000Z',
      expiryTime: '2026-10-01T00:00:00.000Z',
      obfuscatedExternalAccountId: 'user_1',
      testPurchase: true,
    });

    expect(normalized).toMatchObject({
      provider: 'google',
      subscriptionReference: 'token_1',
      status: 'active',
      cancelAtPeriodEnd: true,
      environment: 'sandbox',
    });
    expect(normalized.period?.endsAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('provider resolution from a stored subscription row', () => {
  it('picks the provider that owns the row', () => {
    expect(
      resolvePaymentProviderForSubscription({
        plan_tier: 'pro',
        status: 'active',
        stripe_subscription_id: 'sub_123456789012345',
      })?.id,
    ).toBe('stripe');
    expect(
      resolvePaymentProviderForSubscription({
        plan_tier: 'pro',
        status: 'active',
        apple_original_transaction_id: 'apple_1',
      })?.id,
    ).toBe('apple');
    expect(
      resolvePaymentProviderForSubscription({
        plan_tier: 'pro',
        status: 'active',
        google_purchase_token: 'token_1',
      })?.id,
    ).toBe('google');
  });

  it('resolves no provider for a row with contradictory owners', () => {
    expect(
      resolvePaymentProviderForSubscription({
        plan_tier: 'pro',
        status: 'active',
        apple_original_transaction_id: 'apple_1',
        google_purchase_token: 'token_1',
      }),
    ).toBeNull();
  });
});
