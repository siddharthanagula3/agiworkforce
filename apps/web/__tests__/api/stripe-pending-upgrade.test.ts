import type Stripe from 'stripe';
import { beforeEach, expect, it, vi } from 'vitest';

const updateSubscription = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/app/api/stripe-webhook/lib/db', () => ({
  handleCreditTopUp: vi.fn(),
  upsertSubscriptionFromSession: vi.fn(),
  updateSubscriptionFromStripeSubscription: updateSubscription,
  CreditService: {},
}));
vi.mock('@/lib/services/enterprise-billing-service', () => ({
  syncEnterpriseContractFromSubscription: vi.fn(async () => undefined),
  recordEnterpriseInvoiceEvent: vi.fn(async () => undefined),
  endEnterpriseContractIfPresent: vi.fn(async () => undefined),
  auditUnknownStripePriceIfEnterpriseConfigured: vi.fn(async () => undefined),
  resolveEnterprisePlanTier: vi.fn(async () => null),
}));

import { dispatchStripeEvent } from '@/app/api/stripe-webhook/lib/handlers';

beforeEach(() => {
  vi.clearAllMocks();
});

it('provisions a paid pending upgrade when Stripe applies it', async () => {
  const subscription = { id: 'sub_1', status: 'active' } as Stripe.Subscription;
  const event = {
    id: 'evt_upgrade_applied',
    type: 'customer.subscription.pending_update_applied',
    created: 1_760_000_000,
    data: { object: subscription },
  } as Stripe.Event;

  await dispatchStripeEvent({} as never, {} as Stripe, event);

  expect(updateSubscription).toHaveBeenCalledWith({}, {}, subscription, {
    eventSequence: 1_760_000_000,
  });
});

it('reconciles the full paid subscription before invoice events can overwrite its period', async () => {
  const subscription = { id: 'sub_1', status: 'active' } as Stripe.Subscription;
  const stripe = {
    subscriptions: { retrieve: vi.fn(async () => subscription) },
  } as unknown as Stripe;
  const db = { execute: vi.fn() };
  const event = {
    id: 'evt_invoice_paid',
    type: 'invoice.paid',
    created: 1_760_000_500,
    data: {
      object: {
        id: 'in_1',
        customer: 'cus_1',
        parent: {
          type: 'subscription_details',
          subscription_details: { subscription: 'sub_1' },
        },
      },
    },
  } as Stripe.Event;

  await dispatchStripeEvent(db as never, stripe, event);

  expect(updateSubscription).toHaveBeenCalledWith(db, stripe, subscription, {
    eventSequence: 1_760_000_500,
  });
  expect(db.execute).not.toHaveBeenCalled();
});
