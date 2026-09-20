import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/notification-service', () => ({
  recordNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/price-tier-mapping', () => ({
  isPriceIdRegistered: (priceId: string | null | undefined) => priceId === 'price_pro',
  resolvePlanTier: (_metadata: unknown, priceId: string | null | undefined) =>
    priceId === 'price_pro' ? 'pro' : null,
  isValidPlanTier: (tier: string | null | undefined) =>
    !!tier && ['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'].includes(tier),
  getTierMapping: () => ({ price_pro: { tier: 'pro', interval: 'monthly' } }),
  getEnterpriseProductId: () => null,
  isEnterpriseProductId: () => false,
}));

const subscriptionServiceMocks = vi.hoisted(() => ({
  allocateCreditsForPeriod: vi.fn().mockResolvedValue(''),
  resetCreditsForNewPeriod: vi.fn().mockResolvedValue(''),
  carryCreditsForUpgradePeriod: vi.fn().mockResolvedValue(''),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: subscriptionServiceMocks,
}));

vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),
  CreditService: {
    getBalance: vi.fn().mockResolvedValue(null),
    deductCredits: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('@/lib/services/enterprise-billing-service', () => ({
  syncEnterpriseContractFromSubscription: vi.fn().mockResolvedValue(undefined),
  recordEnterpriseInvoiceEvent: vi.fn().mockResolvedValue(undefined),
  endEnterpriseContractIfPresent: vi.fn().mockResolvedValue(undefined),
  resolveEnterprisePlanTier: vi.fn().mockResolvedValue(null),
  auditUnknownStripePriceIfEnterpriseConfigured: vi.fn().mockResolvedValue(undefined),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';
import { effectivePlanTier } from '@agiworkforce/types';

import { dispatchStripeEvent } from '../handlers';

const HANDLERS_PATH = join(__dirname, '..', 'handlers.ts');
const TESTS_DIR = __dirname;
const UNHANDLED_MESSAGE = 'Unhandled Stripe event type';
const NOW = Math.floor(Date.now() / 1000);
const PERIOD_END = NOW + 30 * 24 * 60 * 60;

function dispatchTable(): string[] {
  const source = readFileSync(HANDLERS_PATH, 'utf8');
  const types = [...source.matchAll(/case '([a-z0-9_]+(?:\.[a-z0-9_]+)+)':/g)].map(
    (match) => match[1] as string,
  );
  return [...new Set(types)];
}

interface StoredSubscription {
  id: string;
  user_id: string;
  plan_tier: string | null;
  status: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  last_stripe_event_at: string | null;
}

function seededSubscription(overrides: Partial<StoredSubscription> = {}): StoredSubscription {
  return {
    id: 'row_1',
    user_id: 'user_1',
    plan_tier: 'pro',
    status: 'active',
    stripe_subscription_id: 'sub_1',
    stripe_customer_id: 'cus_1',
    current_period_start: new Date(NOW * 1000).toISOString(),
    current_period_end: new Date(PERIOD_END * 1000).toISOString(),
    cancel_at_period_end: false,
    canceled_at: null,
    last_stripe_event_at: null,
    ...overrides,
  };
}

// A stand-in for the subscriptions table that answers the statements the handler
// issues, so an ordering claim is settled by the stored row rather than by a spy.
function makeStatefulDb(seed: StoredSubscription | null) {
  const table = seed ? [seed] : [];
  const writes: string[] = [];

  const run = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const text = sql.replace(/\s+/g, ' ').trim();
    const bySubscription = (reference: unknown) =>
      table.find((row) => row.stripe_subscription_id === reference);

    if (text.includes('from subscriptions') && text.includes('last_stripe_event_at')) {
      const row = bySubscription(params[0]);
      return row ? [row] : [];
    }
    if (text.startsWith('select user_id, plan_tier from subscriptions')) {
      const row = bySubscription(params[0]);
      return row ? [{ user_id: row.user_id, plan_tier: row.plan_tier }] : [];
    }
    if (text.includes("update subscriptions set status = 'canceled'")) {
      const row = bySubscription(params[1]);
      if (row) {
        row.status = 'canceled';
        row.plan_tier = 'free';
        row.canceled_at = String(params[0]);
        writes.push('deleted');
      }
      return [];
    }
    if (text.startsWith('update subscriptions set status = $1')) {
      const row = bySubscription(params[8]);
      const sequence = typeof params[9] === 'number' ? params[9] : null;
      const applied = row?.last_stripe_event_at ? Date.parse(row.last_stripe_event_at) : null;
      if (!row) return [];
      const guarded = text.includes('last_stripe_event_at <= to_timestamp($10::double precision)');
      if (guarded && sequence !== null && applied !== null && applied > sequence * 1000) return [];
      row.status = String(params[0]);
      row.plan_tier = String(params[7]);
      row.current_period_start = params[2] === null ? null : String(params[2]);
      row.current_period_end = params[3] === null ? null : String(params[3]);
      row.cancel_at_period_end = Boolean(params[4]);
      row.canceled_at = params[5] === null ? null : String(params[5]);
      if (sequence !== null) row.last_stripe_event_at = new Date(sequence * 1000).toISOString();
      writes.push('updated');
      return [{ id: row.id }];
    }
    if (text.startsWith('insert into subscriptions')) {
      const existing = table.find((row) => row.user_id === params[0]);
      const sequence = typeof params[11] === 'number' ? params[11] : null;
      const applied = existing?.last_stripe_event_at
        ? Date.parse(existing.last_stripe_event_at)
        : null;
      const guarded = text.includes(
        'subscriptions.last_stripe_event_at <= excluded.last_stripe_event_at',
      );
      if (
        existing &&
        guarded &&
        sequence !== null &&
        applied !== null &&
        applied > sequence * 1000
      ) {
        return [];
      }
      const target =
        existing ??
        (() => {
          const created = seededSubscription({
            id: `row_${table.length + 1}`,
            user_id: String(params[0]),
          });
          table.push(created);
          return created;
        })();
      target.status = String(params[1]);
      target.plan_tier = String(params[2]);
      target.stripe_customer_id = params[3] === null ? null : String(params[3]);
      target.stripe_subscription_id = params[4] === null ? null : String(params[4]);
      target.current_period_start = params[7] === null ? null : String(params[7]);
      target.current_period_end = params[8] === null ? null : String(params[8]);
      if (sequence !== null) target.last_stripe_event_at = new Date(sequence * 1000).toISOString();
      writes.push('inserted');
      return [{ id: target.id }];
    }
    if (text.includes('from profiles where stripe_customer_id')) return [{ id: 'user_1' }];
    if (text.includes('select id from profiles where id')) return [{ id: 'user_1' }];
    if (text.includes('select email from profiles')) return [{ email: 'buyer@example.com' }];
    if (text.includes('from credit_transactions')) return [{ revoked_cents: 0 }];
    return [];
  };

  return {
    db: { query: vi.fn(run), execute: vi.fn(run) } as unknown as DatabaseAdapter,
    table,
    writes,
  };
}

const stripeStub = {
  subscriptions: {
    retrieve: async () => ({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      canceled_at: null,
      metadata: { user_id: 'user_1' },
      items: { data: [{ price: { id: 'price_pro' }, quantity: 1 }] },
      current_period_start: NOW,
      current_period_end: PERIOD_END,
    }),
  },
  customers: {
    retrieve: async () => ({ id: 'cus_1', email: 'buyer@example.com', deleted: false }),
  },
  charges: {
    retrieve: async () => ({ id: 'ch_1', customer: 'cus_1', amount: 2000, amount_refunded: 0 }),
  },
  paymentIntents: { retrieve: async () => ({ id: 'pi_1', status: 'succeeded' }) },
  checkout: {
    sessions: {
      retrieve: async () => ({
        id: 'cs_1',
        line_items: { data: [{ price: { id: 'price_pro' }, quantity: 1 }] },
        total_details: {},
      }),
    },
  },
} as unknown as Stripe;

const checkoutSession = {
  id: 'cs_1',
  customer: 'cus_1',
  subscription: 'sub_1',
  payment_status: 'paid',
  currency: 'usd',
  metadata: { user_id: 'user_1', plan_tier: 'pro' },
  line_items: { data: [{ price: { id: 'price_pro' }, quantity: 1 }] },
};

const stripeSubscription = {
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  cancel_at_period_end: false,
  canceled_at: null,
  metadata: { user_id: 'user_1' },
  items: { data: [{ price: { id: 'price_pro' }, quantity: 1 }] },
  current_period_start: NOW,
  current_period_end: PERIOD_END,
};

const invoice = {
  id: 'in_1',
  customer: 'cus_1',
  attempt_count: 1,
  parent: { subscription_details: { subscription: 'sub_1' } },
};

// Keyed by the Stripe object family the event name declares, so a new event type
// inside a family is covered automatically and a new family fails loudly.
const OBJECT_BY_FAMILY: Readonly<Record<string, unknown>> = {
  'checkout.session': checkoutSession,
  'customer.subscription': stripeSubscription,
  invoice,
  payment_intent: { id: 'pi_1', customer: 'cus_1', last_payment_error: null, metadata: {} },
  'charge.dispute': { id: 'dp_1', charge: 'ch_1', amount: 2000, reason: 'fraudulent' },
  charge: {
    id: 'ch_1',
    customer: 'cus_1',
    amount: 2000,
    amount_refunded: 0,
    refunded: false,
    metadata: {},
  },
  'radar.early_fraud_warning': {
    id: 'issfr_1',
    charge: 'ch_1',
    fraud_type: 'made_with_stolen_card',
    actionable: true,
  },
};

function familyOf(eventType: string): string {
  const segments = eventType.split('.');
  for (let take = segments.length - 1; take >= 1; take -= 1) {
    const candidate = segments.slice(0, take).join('.');
    if (candidate in OBJECT_BY_FAMILY) return candidate;
  }
  return eventType;
}

function eventFor(eventType: string, sequence = NOW): Stripe.Event {
  const object = OBJECT_BY_FAMILY[familyOf(eventType)];
  return {
    id: `evt_${eventType}`,
    type: eventType,
    created: sequence,
    data: { object },
  } as unknown as Stripe.Event;
}

function unhandledWarnings(): unknown[] {
  return loggerMocks.warn.mock.calls.filter((call) =>
    call.some((arg) => arg === UNHANDLED_MESSAGE),
  );
}

describe('the Stripe event dispatch table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names at least the checkout, subscription, invoice and dispute families', () => {
    const table = dispatchTable();
    expect(table).toContain('checkout.session.completed');
    expect(table).toContain('customer.subscription.deleted');
    expect(table).toContain('invoice.payment_failed');
    expect(table).toContain('charge.dispute.created');
    expect(table.length).toBeGreaterThan(10);
  });

  it('carries a fixture for every family it dispatches on', () => {
    const missing = dispatchTable().filter((type) => !(familyOf(type) in OBJECT_BY_FAMILY));
    expect(missing).toEqual([]);
  });

  it.each(dispatchTable().map((type) => [type] as const))(
    'handles %s rather than falling through to the unhandled branch',
    async (eventType) => {
      const { db } = makeStatefulDb(seededSubscription());
      await expect(
        dispatchStripeEvent(db, stripeStub, eventFor(eventType)),
      ).resolves.toBeUndefined();
      expect(unhandledWarnings()).toEqual([]);
    },
  );

  it.each(dispatchTable().map((type) => [type] as const))(
    'has a test naming %s somewhere in this suite',
    (eventType) => {
      const covered = readdirSync(TESTS_DIR)
        .filter((name) => name.endsWith('.test.ts'))
        .some((name) => readFileSync(join(TESTS_DIR, name), 'utf8').includes(`'${eventType}'`));
      expect(covered).toBe(true);
    },
  );

  it('acknowledges an event type it does not support without touching the database', async () => {
    const { db } = makeStatefulDb(seededSubscription());
    await expect(
      dispatchStripeEvent(db, stripeStub, {
        id: 'evt_unknown',
        type: 'customer.discount.created',
        created: NOW,
        data: { object: {} },
      } as unknown as Stripe.Event),
    ).resolves.toBeUndefined();
    expect(db.query).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(unhandledWarnings()).toHaveLength(1);
  });
});

describe('the two event types Stripe sends as aliases of a branch already covered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provisions nothing until an upgrade stops being pending', async () => {
    const pending = makeStatefulDb(seededSubscription({ plan_tier: 'basic' }));
    await dispatchStripeEvent(pending.db, stripeStub, {
      ...eventFor('customer.subscription.pending_update_applied', NOW + 1),
      data: { object: { ...stripeSubscription, pending_update: { expires_at: NOW + 60 } } },
    } as unknown as Stripe.Event);
    expect(pending.table[0]!.plan_tier).toBe('basic');
    expect(subscriptionServiceMocks.allocateCreditsForPeriod).not.toHaveBeenCalled();

    const applied = makeStatefulDb(seededSubscription({ plan_tier: 'basic' }));
    await dispatchStripeEvent(
      applied.db,
      stripeStub,
      eventFor('customer.subscription.pending_update_applied', NOW + 1),
    );
    expect(applied.table[0]!.plan_tier).toBe('pro');
  });

  it('refreshes the subscription from Stripe on either name for a paid invoice', async () => {
    const stored: Record<string, StoredSubscription> = {};
    for (const eventType of ['invoice.paid', 'invoice.payment_succeeded']) {
      const { db, table } = makeStatefulDb(
        seededSubscription({ status: 'past_due', plan_tier: 'basic', current_period_end: null }),
      );
      await dispatchStripeEvent(db, stripeStub, eventFor(eventType, NOW + 1));
      stored[eventType] = table[0]!;
    }
    expect(stored['invoice.payment_succeeded']).toEqual(stored['invoice.paid']);
    expect(stored['invoice.paid']!.status).toBe('active');
    expect(stored['invoice.paid']!.plan_tier).toBe('pro');
    expect(stored['invoice.paid']!.current_period_end).toBe(
      new Date(PERIOD_END * 1000).toISOString(),
    );
  });
});

describe('an out-of-order delivery converges on the state Stripe is in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the cancellation when the update it follows arrives afterwards', async () => {
    const { db, table } = makeStatefulDb(seededSubscription());
    await dispatchStripeEvent(db, stripeStub, {
      ...eventFor('customer.subscription.deleted', NOW + 10),
      data: { object: { ...stripeSubscription, canceled_at: NOW + 10 } },
    } as unknown as Stripe.Event);
    await dispatchStripeEvent(db, stripeStub, eventFor('customer.subscription.updated', NOW));

    const row = table[0]!;
    expect(row.status).toBe('canceled');
    expect(effectivePlanTier(row.plan_tier, row.status)).toBe('free');
  });

  it('ignores a subscription snapshot older than the one already applied', async () => {
    const { db, table } = makeStatefulDb(
      seededSubscription({ last_stripe_event_at: new Date((NOW + 100) * 1000).toISOString() }),
    );
    await dispatchStripeEvent(db, stripeStub, {
      ...eventFor('customer.subscription.updated', NOW),
      data: { object: { ...stripeSubscription, status: 'past_due' } },
    } as unknown as Stripe.Event);

    expect(table[0]!.status).toBe('active');
  });

  it('settles on one entitlement when the paid invoice lands before the checkout', async () => {
    const { db, table, writes } = makeStatefulDb(null);
    await dispatchStripeEvent(db, stripeStub, eventFor('invoice.paid', NOW));
    await dispatchStripeEvent(db, stripeStub, eventFor('checkout.session.completed', NOW + 1));

    expect(table).toHaveLength(1);
    expect(table[0]!.plan_tier).toBe('pro');
    expect(effectivePlanTier(table[0]!.plan_tier, table[0]!.status)).toBe('pro');
    expect(writes.filter((write) => write === 'inserted')).toHaveLength(2);
    expect(subscriptionServiceMocks.allocateCreditsForPeriod).toHaveBeenCalledTimes(2);
    const periods = subscriptionServiceMocks.allocateCreditsForPeriod.mock.calls.map((call) =>
      [call[3] as Date, call[4] as Date].map((value) => value.toISOString()).join('/'),
    );
    expect(new Set(periods).size).toBe(1);
  });

  it('settles on one entitlement when the checkout lands before the paid invoice', async () => {
    const { db, table } = makeStatefulDb(null);
    await dispatchStripeEvent(db, stripeStub, eventFor('checkout.session.completed', NOW));
    await dispatchStripeEvent(db, stripeStub, eventFor('invoice.paid', NOW + 1));

    expect(table).toHaveLength(1);
    expect(effectivePlanTier(table[0]!.plan_tier, table[0]!.status)).toBe('pro');
  });
});
