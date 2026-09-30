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
  metadata?: Record<string, string>;
}

interface FakeInvoice {
  id: string;
  subscriptionId: string | null;
  customerId: string;
  status: string;
  auto_advance: boolean;
  metadata?: Record<string, string>;
}

interface FakeRefund {
  id: string;
  amount: number;
  payment_intent?: string;
  charge?: string;
  metadata: Record<string, string>;
  status: string;
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
    metadata: { user_id: 'user_1', plan_tier: 'pro', ...fake.metadata },
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
  paidPaymentIntents?: Record<string, Array<string | { id: string; amount: number | null }>>;
  invoices?: FakeInvoice[];
  refunds?: FakeRefund[];
  paymentAmounts?: Record<string, number>;
}) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const byId = new Map(options.subscriptions.map((fake) => [fake.id, fake]));
  const invoices = new Map((options.invoices ?? []).map((invoice) => [invoice.id, invoice]));
  const refunds = [...(options.refunds ?? [])];
  const invoiceObject = (invoice: FakeInvoice) => ({
    ...invoice,
    metadata: { ...invoice.metadata },
    customer: invoice.customerId,
    parent: { subscription_details: { subscription: invoice.subscriptionId } },
  });
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
        for (const invoice of invoices.values()) {
          if (invoice.customerId === 'cus_1' && invoice.status === 'open') {
            invoice.auto_advance = false;
          }
        }
        return { id, status: 'canceled' };
      }),
      update: vi.fn(async (id: string, params: { metadata: Record<string, string> }) => {
        const fake = byId.get(id);
        if (!fake) throw new Error('Subscription missing');
        fake.metadata = { ...fake.metadata, ...params.metadata };
        return stripeSubscription(fake);
      }),
    },
    invoicePayments: {
      list: vi.fn(async ({ invoice }: { invoice: string }) => ({
        data: (options.paidPaymentIntents?.[invoice] ?? []).map((paymentIntent, index) => ({
          id: `inpay_${invoice}_${index}`,
          amount_paid: typeof paymentIntent === 'string' ? 2000 : paymentIntent.amount,
          payment: {
            type: 'payment_intent',
            payment_intent: typeof paymentIntent === 'string' ? paymentIntent : paymentIntent.id,
          },
        })),
        has_more: false,
      })),
    },
    refunds: {
      list: vi.fn(async (params: { payment_intent?: string; charge?: string }) => ({
        data: refunds.filter((refund) =>
          params.payment_intent
            ? refund.payment_intent === params.payment_intent
            : refund.charge === params.charge,
        ),
        has_more: false,
      })),
      create: vi.fn(async (params: Omit<FakeRefund, 'id' | 'status'>) => {
        const reference = params.payment_intent ?? params.charge ?? '';
        const alreadyRefunded = refunds
          .filter((refund) => (refund.payment_intent ?? refund.charge) === reference)
          .reduce((sum, refund) => sum + refund.amount, 0);
        const remaining = (options.paymentAmounts?.[reference] ?? 2000) - alreadyRefunded;
        const amount = params.amount ?? remaining;
        if (amount <= 0 || amount > remaining) {
          throw new stripeErrors.StripeInvalidRequestError('Refund exceeds remaining charge');
        }
        const refund = { ...params, amount, id: `re_${refunds.length + 1}`, status: 'succeeded' };
        refunds.push(refund);
        return refund;
      }),
    },
    invoices: {
      list: vi.fn(async (params: { subscription?: string; customer?: string; status: string }) => ({
        data: [...invoices.values()]
          .filter(
            (invoice) =>
              (params.subscription === undefined ||
                invoice.subscriptionId === params.subscription) &&
              (params.customer === undefined || invoice.customerId === params.customer) &&
              invoice.status === params.status,
          )
          .map(invoiceObject),
        has_more: false,
      })),
      retrieve: vi.fn(async (id: string) => {
        const invoice = invoices.get(id);
        if (!invoice) throw new Error('Invoice missing');
        return invoiceObject(invoice);
      }),
      update: vi.fn(
        async (
          id: string,
          params: { auto_advance: boolean; metadata?: Record<string, string> },
        ) => {
          const invoice = invoices.get(id);
          if (!invoice) throw new Error('Invoice missing');
          invoice.auto_advance = params.auto_advance;
          invoice.metadata = { ...invoice.metadata, ...params.metadata };
          return invoiceObject(invoice);
        },
      ),
    },
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
    invoices,
    refunds,
    subscriptions: byId,
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
      { idempotencyKey: 'duplicate-subscription-refund:inpay_in_B_0:0' },
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

  it('refunds before canceling', async () => {
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

describe('duplicate settlement preserves invoice collection and allocated payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function settlementWorld(options: Partial<Parameters<typeof harness>[0]> = {}) {
    return harness({
      trackedSubscriptionId: 'sub_A',
      subscriptions: [
        { id: 'sub_A', status: 'past_due', created: 100, latest_invoice: 'in_A' },
        { id: 'sub_B', status: 'active', created: 200, latest_invoice: 'in_B' },
      ],
      invoices: [
        {
          id: 'in_A_collecting',
          subscriptionId: 'sub_A',
          customerId: 'cus_1',
          status: 'open',
          auto_advance: true,
        },
        {
          id: 'in_A_paused',
          subscriptionId: 'sub_A',
          customerId: 'cus_1',
          status: 'open',
          auto_advance: false,
        },
        {
          id: 'in_B',
          subscriptionId: 'sub_B',
          customerId: 'cus_1',
          status: 'open',
          auto_advance: true,
        },
      ],
      ...options,
    });
  }

  it('models Stripe cancellation disabling finalized invoice collection for the whole customer', async () => {
    const world = settlementWorld();

    await world.stripeMock.subscriptions.cancel('sub_B');

    expect(world.invoices.get('in_A_collecting')?.auto_advance).toBe(false);
    expect(world.invoices.get('in_A_paused')?.auto_advance).toBe(false);
    expect(world.invoices.get('in_B')?.auto_advance).toBe(false);
  });

  it('restores only kept invoices that collected automatically before cancellation', async () => {
    const world = settlementWorld();

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.invoices.get('in_A_collecting')?.auto_advance).toBe(true);
    expect(world.invoices.get('in_A_paused')?.auto_advance).toBe(false);
    expect(world.invoices.get('in_B')?.auto_advance).toBe(false);
    expect(world.stripeMock.invoices.update).toHaveBeenCalledTimes(1);
    expect(world.stripeMock.invoices.update).toHaveBeenCalledWith(
      'in_A_collecting',
      expect.objectContaining({ auto_advance: true, metadata: expect.any(Object) }),
      { idempotencyKey: 'duplicate-subscription-collection:sub_B:in_A_collecting' },
    );
    expect(world.stripeMock.subscriptions.update.mock.invocationCallOrder[0]).toBeLessThan(
      world.stripeMock.subscriptions.cancel.mock.invocationCallOrder[0]!,
    );
  });

  it('restores customer-wide original collection only for standalone or live subscriptions', async () => {
    const world = settlementWorld({
      subscriptions: [
        { id: 'sub_A', status: 'past_due', created: 100, latest_invoice: 'in_A' },
        { id: 'sub_B', status: 'active', created: 200, latest_invoice: 'in_B' },
        { id: 'sub_C', status: 'active', created: 300, latest_invoice: 'in_C' },
        { id: 'sub_D', status: 'canceled', created: 400, latest_invoice: 'in_D' },
      ],
      invoices: [
        {
          id: 'in_C',
          subscriptionId: 'sub_C',
          customerId: 'cus_1',
          status: 'open',
          auto_advance: true,
        },
        {
          id: 'in_D',
          subscriptionId: 'sub_D',
          customerId: 'cus_1',
          status: 'open',
          auto_advance: true,
        },
        {
          id: 'in_standalone',
          subscriptionId: null,
          customerId: 'cus_1',
          status: 'open',
          auto_advance: true,
        },
        {
          id: 'in_paused',
          subscriptionId: null,
          customerId: 'cus_1',
          status: 'open',
          auto_advance: false,
        },
        {
          id: 'in_B',
          subscriptionId: 'sub_B',
          customerId: 'cus_1',
          status: 'open',
          auto_advance: true,
        },
      ],
    });

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.invoices.get('in_C')?.auto_advance).toBe(true);
    expect(world.invoices.get('in_standalone')?.auto_advance).toBe(true);
    expect(world.invoices.get('in_D')?.auto_advance).toBe(false);
    expect(world.invoices.get('in_paused')?.auto_advance).toBe(false);
    expect(world.invoices.get('in_B')?.auto_advance).toBe(false);
    expect(world.stripeMock.invoices.list).toHaveBeenCalledWith({
      customer: 'cus_1',
      status: 'open',
      limit: 100,
    });
  });

  it('does not cancel when the original collection state cannot be saved durably', async () => {
    const world = settlementWorld();
    world.stripeMock.subscriptions.update.mockRejectedValueOnce(new Error('metadata unavailable'));

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('metadata unavailable');

    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(world.invoices.get('in_A_collecting')?.auto_advance).toBe(true);
  });

  it('recovers from an invoice restore failure after cancellation without recapturing paused state', async () => {
    const world = settlementWorld();
    world.stripeMock.invoices.update.mockRejectedValueOnce(new Error('restore unavailable'));

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('restore unavailable');
    expect(world.subscriptions.get('sub_B')?.status).toBe('canceled');
    expect(world.invoices.get('in_A_collecting')?.auto_advance).toBe(false);

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.invoices.get('in_A_collecting')?.auto_advance).toBe(true);
    expect(world.invoices.get('in_A_paused')?.auto_advance).toBe(false);
    expect(world.stripeMock.invoices.list).toHaveBeenCalledTimes(1);
    expect(world.stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.recordNotification).toHaveBeenCalledTimes(1);
  });

  it('recovers when Stripe canceled the duplicate but the cancel response was lost', async () => {
    const world = settlementWorld();
    const cancel = world.stripeMock.subscriptions.cancel.getMockImplementation()!;
    world.stripeMock.subscriptions.cancel.mockImplementationOnce(async (id: string) => {
      await cancel(id);
      throw new Error('cancel response lost');
    });

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('cancel response lost');
    expect(world.invoices.get('in_A_collecting')?.auto_advance).toBe(false);

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.invoices.get('in_A_collecting')?.auto_advance).toBe(true);
    expect(world.stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(1);
  });

  it('retries a failed cancellation without refunding the duplicate allocation twice', async () => {
    const world = settlementWorld({ paidPaymentIntents: { in_B: ['pi_B'] } });
    world.stripeMock.subscriptions.cancel.mockRejectedValueOnce(new Error('cancel unavailable'));

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('cancel unavailable');
    expect(world.subscriptions.get('sub_B')?.status).toBe('active');

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.stripeMock.refunds.create).toHaveBeenCalledTimes(1);
    expect(world.stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(2);
    expect(world.invoices.get('in_A_collecting')?.auto_advance).toBe(true);
  });

  it('does not resume collection again after settlement completed and an operator paused an invoice', async () => {
    const world = settlementWorld();
    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));
    world.invoices.get('in_A_collecting')!.auto_advance = false;

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.invoices.get('in_A_collecting')?.auto_advance).toBe(false);
    expect(world.stripeMock.invoices.update).toHaveBeenCalledTimes(1);
  });

  it('preserves a later operator pause when global completion failed after durable invoice restoration', async () => {
    const world = settlementWorld();
    const update = world.stripeMock.subscriptions.update.getMockImplementation()!;
    world.stripeMock.subscriptions.update
      .mockImplementationOnce(update)
      .mockRejectedValueOnce(new Error('completion metadata unavailable'));

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('completion metadata unavailable');

    const invoice = world.invoices.get('in_A_collecting')!;
    expect(invoice.auto_advance).toBe(true);
    const receipts = Object.entries(invoice.metadata!);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]![0].length).toBeLessThanOrEqual(40);
    expect(JSON.parse(receipts[0]![1])).toEqual({
      operation: 'sub_B',
      kept: 'sub_A',
      customer: 'cus_1',
      invoice: 'in_A_collecting',
      subscription: 'sub_A',
    });
    expect(
      JSON.parse(world.subscriptions.get('sub_B')!.metadata!['agi_duplicate_collection']!).complete,
    ).toBe(false);
    invoice.auto_advance = false;

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(invoice.auto_advance).toBe(false);
    expect(world.stripeMock.invoices.update).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(world.subscriptions.get('sub_B')!.metadata!['agi_duplicate_collection']!).complete,
    ).toBe(true);
  });

  it('preserves a later operator pause when the invoice restoration response was lost', async () => {
    const world = settlementWorld();
    const update = world.stripeMock.invoices.update.getMockImplementation()!;
    world.stripeMock.invoices.update.mockImplementationOnce(async (id, params) => {
      await update(id, params);
      throw new Error('restoration response lost');
    });

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('restoration response lost');
    const invoice = world.invoices.get('in_A_collecting')!;
    expect(invoice.auto_advance).toBe(true);
    invoice.auto_advance = false;

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(invoice.auto_advance).toBe(false);
    expect(world.stripeMock.invoices.update).toHaveBeenCalledTimes(1);
  });

  it.each(['operation', 'kept', 'customer', 'invoice', 'subscription'])(
    'refuses a durable receipt with a mismatched %s',
    async (field) => {
      const world = settlementWorld();
      const update = world.stripeMock.subscriptions.update.getMockImplementation()!;
      world.stripeMock.subscriptions.update
        .mockImplementationOnce(update)
        .mockRejectedValueOnce(new Error('completion metadata unavailable'));
      await expect(
        upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
      ).rejects.toThrow('completion metadata unavailable');
      const invoice = world.invoices.get('in_A_collecting')!;
      const receipts = Object.entries(invoice.metadata!);
      expect(receipts).toHaveLength(1);
      const [key, value] = receipts[0]!;
      invoice.metadata![key] = JSON.stringify({ ...JSON.parse(value), [field]: 'different' });
      invoice.auto_advance = false;

      await expect(
        upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
      ).rejects.toThrow('receipt does not match its settlement');

      expect(invoice.auto_advance).toBe(false);
      expect(world.stripeMock.invoices.update).toHaveBeenCalledTimes(1);
    },
  );

  it('retains older restoration receipts when a second duplicate settlement restores the same invoice', async () => {
    const world = settlementWorld({
      subscriptions: [
        { id: 'sub_A', status: 'past_due', created: 100, latest_invoice: 'in_A' },
        { id: 'sub_B', status: 'active', created: 200, latest_invoice: 'in_B' },
        { id: 'sub_C', status: 'active', created: 300, latest_invoice: 'in_C' },
      ],
    });
    const update = world.stripeMock.subscriptions.update.getMockImplementation()!;
    world.stripeMock.subscriptions.update
      .mockImplementationOnce(update)
      .mockRejectedValueOnce(new Error('completion metadata unavailable'));
    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('completion metadata unavailable');

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_C'));
    const invoice = world.invoices.get('in_A_collecting')!;
    expect(Object.keys(invoice.metadata!)).toHaveLength(2);
    invoice.auto_advance = false;

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(invoice.auto_advance).toBe(false);
    expect(world.stripeMock.invoices.update).toHaveBeenCalledTimes(2);
  });

  it('refuses cancellation when a restoring invoice cannot store a durable receipt', async () => {
    const world = settlementWorld({ paidPaymentIntents: { in_B: ['pi_B'] } });
    const invoice = world.invoices.get('in_A_collecting')!;
    invoice.metadata = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [`key_${index}`, 'value']),
    );

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('receipt has no metadata capacity');

    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(world.stripeMock.refunds.create).not.toHaveBeenCalled();
    expect(invoice.auto_advance).toBe(true);
  });

  it('refunds only the duplicate invoice allocation when a payment paid several invoices', async () => {
    const world = settlementWorld({
      paidPaymentIntents: { in_B: [{ id: 'pi_shared', amount: 500 }] },
      paymentAmounts: { pi_shared: 3000 },
    });

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.stripeMock.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_shared',
        amount: 500,
        reason: 'duplicate',
        metadata: {
          duplicate_subscription_id: 'sub_B',
          duplicate_invoice_payment_id: 'inpay_in_B_0',
        },
      },
      { idempotencyKey: 'duplicate-subscription-refund:inpay_in_B_0:0' },
    );
  });

  it('reconciles an allocated refund after metadata persistence failed without an idempotency cache', async () => {
    const world = settlementWorld({
      paidPaymentIntents: { in_B: [{ id: 'pi_shared', amount: 500 }] },
      paymentAmounts: { pi_shared: 3000 },
    });
    world.stripeMock.subscriptions.update.mockRejectedValueOnce(new Error('metadata unavailable'));

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('metadata unavailable');
    expect(world.refunds).toHaveLength(1);

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.stripeMock.refunds.create).toHaveBeenCalledTimes(1);
    expect(world.refunds.reduce((sum, refund) => sum + refund.amount, 0)).toBe(500);
  });

  it('refunds only the remaining allocated amount after a prior partial duplicate refund', async () => {
    const world = settlementWorld({
      paidPaymentIntents: { in_B: [{ id: 'pi_shared', amount: 500 }] },
      refunds: [
        {
          id: 're_previous',
          payment_intent: 'pi_shared',
          amount: 200,
          status: 'succeeded',
          metadata: {
            duplicate_subscription_id: 'sub_B',
            duplicate_invoice_payment_id: 'inpay_in_B_0',
          },
        },
        {
          id: 're_unrelated',
          payment_intent: 'pi_shared',
          amount: 100,
          status: 'succeeded',
          metadata: {},
        },
      ],
    });

    await upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B'));

    expect(world.stripeMock.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_shared', amount: 300 }),
      { idempotencyKey: 'duplicate-subscription-refund:inpay_in_B_0:200' },
    );
  });

  it('refuses cancellation when the paid invoice allocation is absent', async () => {
    const world = settlementWorld({
      paidPaymentIntents: { in_B: [{ id: 'pi_shared', amount: null }] },
    });

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('no verifiable refundable allocation');

    expect(world.stripeMock.refunds.create).not.toHaveBeenCalled();
    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('refuses cancellation when the kept invoice listing is incomplete', async () => {
    const world = settlementWorld();
    world.stripeMock.invoices.list.mockResolvedValueOnce({ data: [], has_more: true });

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('Kept invoices exceed');

    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('refuses cancellation when the duplicate payment listing is incomplete', async () => {
    const world = settlementWorld();
    world.stripeMock.invoicePayments.list.mockResolvedValueOnce({ data: [], has_more: true });

    await expect(
      upsertSubscriptionFromSession(world.db, world.stripe, secondCheckout('sub_B')),
    ).rejects.toThrow('Duplicate invoice payments exceed');

    expect(world.stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
  });
});

describe('refunding a charge from another subscription', () => {
  function allocation(subscription: string, amount: number, id: string) {
    return {
      id,
      amount_paid: amount,
      status: 'paid',
      payment: { type: 'payment_intent', payment_intent: 'pi_1' },
      invoice: {
        id: `in_${id}`,
        customer: 'cus_1',
        status: 'paid',
        amount_paid: amount,
        amount_remaining: 0,
        parent: { subscription_details: { subscription } },
        lines: { has_more: false, data: [{ period: { start: PERIOD_START, end: PERIOD_END } }] },
      },
    };
  }

  function receipt(amount: number, duplicate = false): FakeRefund {
    return {
      id: duplicate ? 're_duplicate' : 're_ordinary',
      charge: 'ch_1',
      amount,
      status: 'succeeded',
      metadata: duplicate
        ? { duplicate_subscription_id: 'sub_B', duplicate_invoice_payment_id: 'inpay_B' }
        : {},
    };
  }

  function refundWorld(invoiceSubscriptionId = 'sub_A') {
    const statements: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('from profiles where stripe_customer_id')) return [{ id: 'user_1' }];
        if (sql.includes('from subscriptions'))
          return [
            {
              subscription_id: 'row_1',
              stripe_subscription_id: 'sub_A',
              plan_tier: 'pro',
              current_period_start: new Date(PERIOD_START * 1000),
              current_period_end: new Date(PERIOD_END * 1000),
            },
          ];
        if (sql.includes('from token_credits'))
          return [
            {
              id: 'credits_1',
              credits_allocated_microusd: 200_000_000,
              top_up_allocated_microusd: 0,
            },
          ];
        if (sql.includes('from credit_transactions')) return [{ revoked: 0 }];
        return [];
      }),
      execute: vi.fn(async (sql: string) => {
        statements.push(sql);
        return 1;
      }),
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
    const stripe = {
      refunds: { list: vi.fn(async () => ({ data: [] as FakeRefund[], has_more: false })) },
      invoicePayments: {
        list: vi.fn(async () => ({
          data: [allocation(invoiceSubscriptionId, charge.amount, 'inpay_A')],
          has_more: false,
        })),
      },
    };
    return { db, stripe, charge, statements };
  }

  function sharedWorld(refunded: number) {
    const world = refundWorld();
    Object.assign(world.charge, {
      amount: 3000,
      amount_refunded: refunded,
      refunded: refunded === 3000,
    });
    world.stripe.invoicePayments.list.mockResolvedValue({
      data: [allocation('sub_A', 2500, 'inpay_A'), allocation('sub_B', 500, 'inpay_B')],
      has_more: false,
    });
    return world;
  }

  it('leaves the tracked plan alone when the charge paid another subscription', async () => {
    const world = refundWorld('sub_B');
    await handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never);
    expect(world.db.execute).not.toHaveBeenCalled();
  });

  it('revokes a fully refunded kept allocation even when the duplicate allocation is first', async () => {
    const world = sharedWorld(3000);
    world.stripe.invoicePayments.list.mockResolvedValue({
      data: [allocation('sub_B', 500, 'inpay_B'), allocation('sub_A', 2500, 'inpay_A')],
      has_more: false,
    });
    await handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never);
    expect(world.db.execute).toHaveBeenCalledWith(
      'select revoke_plan_allowance_microusd($1, $2, $3, $4)',
      ['user_1', 'credits_1', 200_000_000, 'Refund for charge ch_1'],
    );
    expect(world.statements.some((sql) => sql.includes("plan_tier = 'free'"))).toBe(true);
    expect(world.stripe.invoicePayments.list).toHaveBeenCalledWith({
      payment: { type: 'payment_intent', payment_intent: 'pi_1' },
      status: 'paid',
      limit: 100,
      expand: ['data.invoice'],
    });
  });

  it('refuses a fully refunded charge that funded only part of a settled kept invoice', async () => {
    const world = refundWorld();
    Object.assign(world.charge, { amount: 4000, amount_refunded: 4000, refunded: true });
    const partialPayment = allocation('sub_A', 4000, 'inpay_A');
    partialPayment.invoice.amount_paid = 10000;
    world.stripe.invoicePayments.list.mockResolvedValue({
      data: [partialPayment],
      has_more: false,
    });

    await expect(
      handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never),
    ).rejects.toThrow('complete settled payment attribution');

    expect(world.db.execute).not.toHaveBeenCalled();
    expect(world.statements.some((sql) => sql.includes('from token_credits'))).toBe(false);
  });

  it.each([
    { status: 'open', amount_paid: 4000, amount_remaining: 6000 },
    { status: 'paid', amount_paid: 4000, amount_remaining: 1 },
    { status: 'paid', amount_paid: Number.NaN, amount_remaining: 0 },
  ])('refuses an unsettled or unverifiable kept invoice %j', async (invoiceState) => {
    const world = refundWorld();
    Object.assign(world.charge, { amount: 4000, amount_refunded: 4000, refunded: true });
    const partialPayment = allocation('sub_A', 4000, 'inpay_A');
    Object.assign(partialPayment.invoice, invoiceState);
    world.stripe.invoicePayments.list.mockResolvedValue({
      data: [partialPayment],
      has_more: false,
    });

    await expect(
      handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never),
    ).rejects.toThrow('complete settled payment attribution');

    expect(world.db.execute).not.toHaveBeenCalled();
  });

  it.each(['succeeded', 'pending'])(
    'preserves kept allowance for a signed %s duplicate-only refund',
    async (status) => {
      const world = sharedWorld(500);
      Object.assign(world.charge, {
        refunds: { has_more: false, data: [{ ...receipt(500, true), status }] },
      });
      await handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never);
      expect(world.db.execute).not.toHaveBeenCalled();
      expect(world.stripe.refunds.list).not.toHaveBeenCalled();
    },
  );

  it('uses the kept allocation as the denominator for a signed ordinary refund', async () => {
    const world = sharedWorld(750);
    Object.assign(world.charge, {
      refunds: { has_more: false, data: [receipt(500, true), receipt(250)] },
    });
    await handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never);
    expect(world.db.execute).toHaveBeenCalledWith(
      'select revoke_plan_allowance_microusd($1, $2, $3, $4)',
      ['user_1', 'credits_1', 20_000_000, 'Refund for charge ch_1'],
    );
  });

  it('refuses a later small live receipt rather than subtracting it from an older signed event', async () => {
    const world = sharedWorld(250);
    world.stripe.refunds.list.mockResolvedValue({ has_more: false, data: [receipt(100, true)] });
    await expect(
      handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never),
    ).rejects.toThrow('complete signed charge snapshot');
    expect(world.db.execute).not.toHaveBeenCalled();
    expect(world.stripe.refunds.list).not.toHaveBeenCalled();
  });

  it('refuses incomplete signed refund snapshots', async () => {
    const world = sharedWorld(500);
    Object.assign(world.charge, { refunds: { has_more: true, data: [receipt(500, true)] } });
    await expect(
      handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never),
    ).rejects.toThrow('complete signed charge snapshot');
    expect(world.db.execute).not.toHaveBeenCalled();
  });

  it('refuses a signed snapshot whose receipt sum differs from its cumulative refund', async () => {
    const world = sharedWorld(250);
    Object.assign(world.charge, { refunds: { has_more: false, data: [receipt(100, true)] } });
    await expect(
      handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never),
    ).rejects.toThrow('receipts do not match');
    expect(world.db.execute).not.toHaveBeenCalled();
  });

  it('refuses another customer in a payment allocation', async () => {
    const world = sharedWorld(3000);
    const mismatched = allocation('sub_A', 3000, 'inpay_A');
    mismatched.invoice.customer = 'cus_other';
    world.stripe.invoicePayments.list.mockResolvedValue({ data: [mismatched], has_more: false });
    await expect(
      handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never),
    ).rejects.toThrow('allocation cannot be verified');
    expect(world.db.execute).not.toHaveBeenCalled();
  });

  it('refuses incomplete payment mappings', async () => {
    const world = sharedWorld(3000);
    world.stripe.invoicePayments.list.mockResolvedValue({
      has_more: true,
      data: [allocation('sub_A', 2500, 'inpay_A')],
    });
    await expect(
      handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never),
    ).rejects.toThrow('mapping is incomplete');
    expect(world.db.execute).not.toHaveBeenCalled();
  });

  it('refuses attribution to an unrelated invoice without proven duplicate receipts', async () => {
    const world = sharedWorld(250);
    Object.assign(world.charge, { refunds: { has_more: false, data: [receipt(250)] } });
    await expect(
      handleChargeRefunded(world.db as never, world.stripe as never, world.charge as never),
    ).rejects.toThrow('attribution is ambiguous');
    expect(world.db.execute).not.toHaveBeenCalled();
  });
});
