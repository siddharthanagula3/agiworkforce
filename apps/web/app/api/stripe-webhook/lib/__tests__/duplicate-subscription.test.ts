import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  allocateCredits: vi.fn(),
  carryUpgradeCredits: vi.fn(),
  resetCredits: vi.fn(),
  recordAuditEvent: vi.fn(),
  recordNotification: vi.fn(),
}));

const stripeErrors = vi.hoisted(() => {
  class StripeError extends Error {
    code?: string;
  }
  class StripeInvalidRequestError extends StripeError {}
  return { StripeError, StripeInvalidRequestError };
});

vi.mock('server-only', () => ({}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    static errors = stripeErrors;
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: mocks.allocateCredits,
    carryCreditsForUpgradePeriod: mocks.carryUpgradeCredits,
    resetCreditsForNewPeriod: mocks.resetCredits,
  },
}));
vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),
  CreditService: {},
}));
vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: () => 'pro',
  isValidPlanTier: (tier: unknown) => tier === 'pro' || tier === 'enterprise',
  isPriceIdRegistered: (priceId: unknown) => priceId === 'price_pro_monthly',
  getTierMapping: () => ({ price_pro_monthly: { tier: 'pro', interval: 'monthly' } }),
  getEnterpriseProductId: () => 'prod_enterprise',
  isEnterpriseProductId: (productId: unknown) => productId === 'prod_enterprise',
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  logSecurityEvent: vi.fn(),
}));
vi.mock('@/lib/services/notification-service', () => ({
  recordNotification: mocks.recordNotification,
}));

import type Stripe from 'stripe';
import { handleChargeRefunded } from '../refund-events';
import { updateSubscriptionFromStripeSubscription, upsertSubscriptionFromSession } from '../db';

const PERIOD_START = 1_780_000_000;
const PERIOD_END = PERIOD_START + 30 * 86_400;

interface FakeSubscription {
  id: string;
  status: string;
  created: number;
  latest_invoice: string | null;
  product?: string;
}

function stripeSubscription(fake: FakeSubscription) {
  return {
    id: fake.id,
    customer: 'cus_1',
    status: fake.status,
    created: fake.created,
    cancel_at_period_end: false,
    canceled_at: null,
    latest_invoice: fake.latest_invoice,
    metadata: { user_id: 'user_1', plan_tier: 'pro' },
    items: {
      data: [
        {
          quantity: 1,
          price: {
            id: fake.product === 'prod_enterprise' ? 'price_enterprise' : 'price_pro_monthly',
            product: fake.product ?? 'prod_pro',
          },
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
        },
      ],
    },
  };
}

function harness(options: {
  trackedSubscriptionId: string | null;
  subscriptions: FakeSubscription[];
  paidPaymentIntents?: Record<string, string[]>;
}) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const byId = new Map(options.subscriptions.map((fake) => [fake.id, fake]));
  const respond = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes('select stripe_subscription_id from subscriptions where user_id')) {
      return options.trackedSubscriptionId
        ? [{ stripe_subscription_id: options.trackedSubscriptionId }]
        : [];
    }
    if (sql.includes('select id from profiles where id')) return [{ id: 'user_1' }];
    if (sql.includes('insert into subscriptions')) return [{ id: 'row_1' }];
    return [];
  };
  const db = { query: vi.fn(respond), execute: vi.fn(respond) };

  const stripe = {
    subscriptions: {
      retrieve: vi.fn(async (id: string) => {
        const fake = byId.get(id);
        if (!fake) {
          throw Object.assign(new Error(`No such subscription: '${id}'`), {
            code: 'resource_missing',
          });
        }
        return stripeSubscription(fake);
      }),
      cancel: vi.fn(async (id: string) => {
        const fake = byId.get(id);
        if (fake) fake.status = 'canceled';
        return { id, status: 'canceled' };
      }),
    },
    invoicePayments: {
      list: vi.fn(async ({ invoice }: { invoice: string }) => ({
        data: (options.paidPaymentIntents?.[invoice] ?? []).map((paymentIntent, index) => ({
          id: `inpay_${invoice}_${index}`,
          payment: { type: 'payment_intent', payment_intent: paymentIntent },
        })),
      })),
    },
    refunds: { create: vi.fn(async () => ({ id: 're_1' })) },
    customers: {
      retrieve: vi.fn(async () => ({ id: 'cus_1', email: 'buyer@example.com', deleted: false })),
    },
    checkout: {
      sessions: { retrieve: vi.fn(async () => ({ id: 'cs_second', total_details: null })) },
    },
    prices: { retrieve: vi.fn() },
  };

  return {
    db: db as never,
    stripe: stripe as never as Stripe,
    stripeMock: stripe,
    statements,
    upserts: () => statements.filter(({ sql }) => sql.includes('insert into subscriptions')),
  };
}

function secondCheckout(subscriptionId: string) {
  return {
    id: 'cs_second',
    customer: 'cus_1',
    subscription: subscriptionId,
    client_reference_id: 'user_1',
    payment_status: 'paid',
    metadata: { user_id: 'user_1', plan_tier: 'pro' },
    line_items: { data: [{ price: { id: 'price_pro_monthly' }, quantity: 1 }] },
    total_details: null,
  } as never;
}

describe('a second live Stripe subscription for the same account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels and refunds the duplicate from checkout.session.completed and keeps the tracked one', async () => {
    const world = harness({
      trackedSubscriptionId: 'sub_A',
      subscriptions: [
        { id: 'sub_A', status: 'active', created: 100, latest_invoice: 'in_A' },
        { id: 'sub_B', status: 'active', created: 200, latest_invoice: 'in_B' },
      ],
      paidPaymentIntents: { in_B: ['pi_B'] },
    });

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.upserts()).toHaveLength(0);
    expect(mocks.allocateCredits).not.toHaveBeenCalled();
    expect(world.stripeMock.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_B', reason: 'duplicate' }),
      { idempotencyKey: 'duplicate-subscription-refund:inpay_in_B_0' },
    );
    expect(world.stripeMock.subscriptions.cancel).toHaveBeenCalledWith(
      'sub_B',
      { prorate: false, invoice_now: false },
      { idempotencyKey: 'duplicate-subscription-cancel:sub_B' },
    );
    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalledWith(
      'sub_A',
      expect.anything(),
      expect.anything(),
    );
    expect(mocks.recordNotification).toHaveBeenCalledWith(
      world.db,
      expect.objectContaining({
        userId: 'user_1',
        category: 'billing',
        dedupeKey: 'duplicate-subscription:sub_B',
        message: expect.stringContaining('refunded its payment'),
      }),
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        detail: expect.objectContaining({ resourceId: 'sub_B', reason: 'duplicate_subscription' }),
      }),
    );
  });

  it('refunds before canceling, so a failed cancel retries with the refund already done', async () => {
    const world = harness({
      trackedSubscriptionId: 'sub_A',
      subscriptions: [
        { id: 'sub_A', status: 'active', created: 100, latest_invoice: 'in_A' },
        { id: 'sub_B', status: 'active', created: 200, latest_invoice: 'in_B' },
      ],
      paidPaymentIntents: { in_B: ['pi_B'] },
    });

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.stripeMock.refunds.create.mock.invocationCallOrder[0]).toBeLessThan(
      world.stripeMock.subscriptions.cancel.mock.invocationCallOrder[0]!,
    );
  });

  it('takes the per-account lock before it reads which subscription the account keeps', async () => {
    const world = harness({
      trackedSubscriptionId: 'sub_A',
      subscriptions: [
        { id: 'sub_A', status: 'active', created: 100, latest_invoice: 'in_A' },
        { id: 'sub_B', status: 'active', created: 200, latest_invoice: 'in_B' },
      ],
    });

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    const lock = world.statements.findIndex(({ sql }) => sql.includes('pg_advisory_xact_lock'));
    const read = world.statements.findIndex(({ sql }) =>
      sql.includes('select stripe_subscription_id from subscriptions where user_id'),
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(world.statements[lock]?.params).toEqual(['user_1']);
    expect(lock).toBeLessThan(read);
  });

  it('applies the same rule when customer.subscription.created arrives first', async () => {
    const world = harness({
      trackedSubscriptionId: 'sub_A',
      subscriptions: [
        { id: 'sub_A', status: 'active', created: 100, latest_invoice: 'in_A' },
        { id: 'sub_B', status: 'active', created: 200, latest_invoice: 'in_B' },
      ],
      paidPaymentIntents: { in_B: ['pi_B'] },
    });

    await updateSubscriptionFromStripeSubscription(
      world.db,
      world.stripe,
      stripeSubscription({
        id: 'sub_B',
        status: 'active',
        created: 200,
        latest_invoice: 'in_B',
      }) as never,
      { eventSequence: 300 },
    );

    expect(world.upserts()).toHaveLength(0);
    expect(mocks.allocateCredits).not.toHaveBeenCalled();
    expect(world.stripeMock.refunds.create).toHaveBeenCalledTimes(1);
    expect(world.stripeMock.subscriptions.cancel).toHaveBeenCalledWith(
      'sub_B',
      expect.anything(),
      expect.anything(),
    );
  });

  it('cancels a trialing duplicate without a refund', async () => {
    const world = harness({
      trackedSubscriptionId: 'sub_A',
      subscriptions: [
        { id: 'sub_A', status: 'active', created: 100, latest_invoice: 'in_A' },
        { id: 'sub_B', status: 'trialing', created: 200, latest_invoice: 'in_B_trial' },
      ],
    });

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.stripeMock.refunds.create).not.toHaveBeenCalled();
    expect(world.stripeMock.subscriptions.cancel).toHaveBeenCalledWith(
      'sub_B',
      expect.anything(),
      expect.anything(),
    );
    expect(mocks.recordNotification).toHaveBeenCalledWith(
      world.db,
      expect.objectContaining({ message: expect.stringContaining('before it charged you') }),
    );
    expect(world.upserts()).toHaveLength(0);
  });

  it('leaves the row alone for a late event about a duplicate that is no longer live', async () => {
    const world = harness({
      trackedSubscriptionId: 'sub_A',
      subscriptions: [
        { id: 'sub_A', status: 'active', created: 100, latest_invoice: 'in_A' },
        { id: 'sub_B', status: 'canceled', created: 200, latest_invoice: 'in_B' },
      ],
    });

    await updateSubscriptionFromStripeSubscription(
      world.db,
      world.stripe,
      stripeSubscription({
        id: 'sub_B',
        status: 'canceled',
        created: 200,
        latest_invoice: 'in_B',
      }) as never,
      { eventSequence: 400 },
    );

    expect(world.upserts()).toHaveLength(0);
    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(world.stripeMock.refunds.create).not.toHaveBeenCalled();
  });

  it('lets a new subscription replace one Stripe already ended, so buying again works', async () => {
    const world = harness({
      trackedSubscriptionId: 'sub_A',
      subscriptions: [
        { id: 'sub_A', status: 'canceled', created: 100, latest_invoice: 'in_A' },
        { id: 'sub_B', status: 'active', created: 200, latest_invoice: 'in_B' },
      ],
    });

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.upserts()).toHaveLength(1);
    expect(world.upserts()[0]?.params).toContain('sub_B');
    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(mocks.allocateCredits).toHaveBeenCalledTimes(1);
  });

  it('lets a new subscription replace one Stripe no longer has', async () => {
    const world = harness({
      trackedSubscriptionId: 'sub_gone',
      subscriptions: [{ id: 'sub_B', status: 'active', created: 200, latest_invoice: 'in_B' }],
    });

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.upserts()).toHaveLength(1);
    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('throws so Stripe retries when the tracked subscription cannot be read', async () => {
    const world = harness({
      trackedSubscriptionId: 'sub_A',
      subscriptions: [{ id: 'sub_B', status: 'active', created: 200, latest_invoice: 'in_B' }],
    });
    world.stripeMock.subscriptions.retrieve.mockRejectedValueOnce(new Error('stripe unavailable'));

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('stripe unavailable');
    expect(world.upserts()).toHaveLength(0);
    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('never cancels an enterprise subscription an operator created', async () => {
    const world = harness({
      trackedSubscriptionId: 'sub_A',
      subscriptions: [
        { id: 'sub_A', status: 'active', created: 100, latest_invoice: 'in_A' },
        {
          id: 'sub_E',
          status: 'active',
          created: 200,
          latest_invoice: 'in_E',
          product: 'prod_enterprise',
        },
      ],
    });

    await updateSubscriptionFromStripeSubscription(
      world.db,
      world.stripe,
      stripeSubscription({
        id: 'sub_E',
        status: 'active',
        created: 200,
        latest_invoice: 'in_E',
        product: 'prod_enterprise',
      }) as never,
      { eventSequence: 500 },
    );

    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(world.upserts()).toHaveLength(1);
  });

  it('provisions the subscription the account already tracks without a second Stripe read', async () => {
    const world = harness({
      trackedSubscriptionId: 'sub_A',
      subscriptions: [{ id: 'sub_A', status: 'active', created: 100, latest_invoice: 'in_A' }],
    });

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_A'));

    expect(world.upserts()).toHaveLength(1);
    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(world.stripeMock.subscriptions.retrieve).toHaveBeenCalledTimes(1);
  });
});

describe('refunding a charge from another subscription', () => {
  function refundWorld(invoiceSubscriptionId: string) {
    const statements: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('from profiles where stripe_customer_id')) return [{ id: 'user_1' }];
        if (sql.includes('from subscriptions')) {
          return [
            {
              subscription_id: 'row_1',
              stripe_subscription_id: 'sub_A',
              plan_tier: 'pro',
              current_period_start: new Date(PERIOD_START * 1000),
              current_period_end: new Date(PERIOD_END * 1000),
            },
          ];
        }
        if (sql.includes('from token_credits')) {
          return [
            {
              id: 'credits_1',
              credits_allocated_microusd: 200_000_000,
              top_up_allocated_microusd: 0,
            },
          ];
        }
        if (sql.includes('from credit_transactions')) return [{ revoked: 0 }];
        return [];
      }),
      execute: vi.fn(async (sql: string) => {
        statements.push(sql);
        return 1;
      }),
    };
    const stripe = {
      invoicePayments: {
        list: vi.fn(async () => ({
          data: [
            {
              invoice: {
                id: 'in_1',
                parent: { subscription_details: { subscription: invoiceSubscriptionId } },
                lines: { data: [{ period: { start: PERIOD_START, end: PERIOD_END } }] },
              },
            },
          ],
        })),
      },
    };
    const charge = {
      id: 'ch_1',
      customer: 'cus_1',
      payment_intent: 'pi_1',
      amount: 20_000,
      amount_refunded: 20_000,
      refunded: true,
      created: PERIOD_START + 60,
      metadata: {},
    };
    return { db, stripe, charge, statements };
  }

  it('leaves the tracked plan alone when the refunded charge paid a duplicate subscription', async () => {
    const world = refundWorld('sub_B');

    await handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never);

    expect(world.statements.some((sql) => sql.includes('revoke_plan_allowance_microusd'))).toBe(
      false,
    );
    expect(world.statements.some((sql) => sql.includes("plan_tier = 'free'"))).toBe(false);
  });

  it('still revokes the plan when the refunded charge paid the tracked subscription', async () => {
    const world = refundWorld('sub_A');

    await handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never);

    expect(world.statements.some((sql) => sql.includes('revoke_plan_allowance_microusd'))).toBe(
      true,
    );
  });
});
