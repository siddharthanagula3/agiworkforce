import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), topUp: vi.fn() }));

vi.mock('../db', () => ({
  upsertSubscriptionFromSession: (...args: unknown[]) => mocks.upsert(...args),
  handleCreditTopUp: (...args: unknown[]) => mocks.topUp(...args),
  handleSubscriptionUpdated: vi.fn(),
  handleSubscriptionDeleted: vi.fn(),
  handleInvoicePaid: vi.fn(),
  handleInvoicePaymentFailed: vi.fn(),
  handleChargeRefunded: vi.fn(),
  handleDisputeCreated: vi.fn(),
  updateSubscriptionFromStripeSubscription: vi.fn(async () => undefined),
  CreditService: {
    getBalance: vi.fn(async () => null),
    deductCredits: vi.fn(async () => undefined),
  },
}));

import { dispatchStripeEvent } from '../handlers';

function subscriptionSession(paymentStatus: string): Stripe.Checkout.Session {
  return {
    id: 'cs_sub_123',
    metadata: { user_id: 'user_123' },
    subscription: 'sub_123',
    customer: 'cus_123',
    payment_status: paymentStatus,
  } as unknown as Stripe.Checkout.Session;
}

function event(type: string, session: Stripe.Checkout.Session): Stripe.Event {
  return { id: 'evt_1', type, data: { object: session } } as unknown as Stripe.Event;
}

const db = {} as DatabaseAdapter;
const stripe = {} as Stripe;

describe('subscription entitlement waits for payment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not provision a plan or its credits while the payment is still unpaid', async () => {
    await dispatchStripeEvent(
      db,
      stripe,
      event('checkout.session.completed', subscriptionSession('unpaid')),
    );

    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('provisions once the asynchronous payment succeeds', async () => {
    await dispatchStripeEvent(
      db,
      stripe,
      event('checkout.session.async_payment_succeeded', subscriptionSession('paid')),
    );

    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it('provisions immediately for a normally paid checkout', async () => {
    await dispatchStripeEvent(
      db,
      stripe,
      event('checkout.session.completed', subscriptionSession('paid')),
    );

    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it('still provisions a checkout that legitimately needs no payment', async () => {
    await dispatchStripeEvent(
      db,
      stripe,
      event('checkout.session.completed', subscriptionSession('no_payment_required')),
    );

    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it('treats an unpaid subscription checkout the same way it treats an unpaid top-up', async () => {
    const topUp = {
      ...subscriptionSession('unpaid'),
      metadata: { type: 'credit_topup', user_id: 'user_123' },
    } as unknown as Stripe.Checkout.Session;

    await dispatchStripeEvent(db, stripe, event('checkout.session.completed', topUp));
    await dispatchStripeEvent(
      db,
      stripe,
      event('checkout.session.completed', subscriptionSession('unpaid')),
    );

    expect(mocks.topUp).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
