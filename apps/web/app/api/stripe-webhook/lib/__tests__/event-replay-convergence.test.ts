import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: loggerMocks,
}));

vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/notification-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/price-tier-mapping', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
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

// The dispute path is the one branch that moves money through the service
// rather than through SQL, so its balance has to be as stateful as the ledger.
const creditAccount = vi.hoisted(() => ({
  remainingCents: 0,
  consumedKeys: new Set<string>(),
}));
vi.mock('@/lib/services/credit-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),
  CreditService: {
    getBalance: vi.fn(async () => ({
      credits_remaining_cents: creditAccount.remainingCents,
      credits_remaining_microusd: creditAccount.remainingCents * 10_000,
    })),
    deductCredits: vi.fn(
      async (
        _db: unknown,
        _userId: string,
        amountCents: number,
        _description: string,
        _metadata: unknown,
        idempotencyKey: string,
      ) => {
        if (creditAccount.consumedKeys.has(idempotencyKey)) return { success: true };
        creditAccount.consumedKeys.add(idempotencyKey);
        creditAccount.remainingCents = Math.max(0, creditAccount.remainingCents - amountCents);
        return { success: true };
      },
    ),
  },
}));

vi.mock('@/lib/services/enterprise-billing-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
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
const NOW = Math.floor(Date.UTC(2026, 8, 20, 12, 0, 0) / 1000);
const PERIOD_END = NOW + 30 * 24 * 60 * 60;

/** Every event type the handler branches on, read off the branch table itself. */
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

interface LedgerRow {
  userId: string;
  type: 'purchase' | 'refund';
  description: string;
  amountCents: number;
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

/**
 * The subscription row and the credit ledger as Postgres answers them, with the
 * two constraints that decide a replay: the partial unique receipt on a top-up
 * purchase, and the running total a refund reads before revoking anything.
 */
function makeLedgerDb(seed: StoredSubscription | null) {
  const table = seed ? [seed] : [];
  const ledger: LedgerRow[] = [];
  const balanceMoves: string[] = [];

  const recordPurchase = (userId: string, description: string, amountCents: number): void => {
    const duplicate = ledger.some(
      (row) => row.userId === userId && row.type === 'purchase' && row.description === description,
    );
    if (duplicate && description.startsWith('Credit top-up purchase cs_')) {
      throw Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
      });
    }
    ledger.push({ userId, type: 'purchase', description, amountCents });
    balanceMoves.push(`purchase:${description}:${amountCents}`);
  };

  const run = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const text = sql.replace(/\s+/g, ' ').trim();
    const bySubscription = (reference: unknown) =>
      table.find((row) => row.stripe_subscription_id === reference);

    if (text.includes('select id from credit_transactions')) {
      const found = ledger.filter(
        (row) =>
          row.userId === params[0] && row.type === 'purchase' && row.description === params[1],
      );
      return found.map((_row, index) => ({ id: `ct_${index}` }));
    }
    if (text.includes('as revoked_cents')) {
      const revoked = ledger
        .filter(
          (row) =>
            row.userId === params[0] && row.type === 'refund' && row.description === params[1],
        )
        .reduce((total, row) => total - row.amountCents, 0);
      return [{ revoked_cents: revoked }];
    }
    if (text.includes('add_credits_microusd')) {
      recordPurchase(String(params[0]), String(params[3]), Number(params[2]) / 10_000);
      return [];
    }
    if (text.includes('handle_top_up_refund') || text.includes('handle_refund')) {
      ledger.push({
        userId: String(params[0]),
        type: 'refund',
        description: String(params[2]),
        amountCents: -Number(params[1]),
      });
      balanceMoves.push(`refund:${String(params[2])}:${Number(params[1])}`);
      return [];
    }
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
      return [{ id: target.id }];
    }
    if (text.includes('from profiles where stripe_customer_id')) return [{ id: 'user_1' }];
    if (text.includes('select id from profiles where id')) return [{ id: 'user_1' }];
    if (text.includes('select email from profiles')) return [{ email: 'buyer@example.com' }];
    if (text.includes('from token_credits')) {
      return [{ id: 'acct_1', remaining_microusd: creditAccount.remainingCents * 10_000 }];
    }
    if (text.includes('select id, current_period_start, current_period_end from subscriptions')) {
      const row = table.find((entry) => entry.user_id === params[0]);
      return row ? [row] : [];
    }
    return [];
  };

  return {
    db: { query: vi.fn(run), execute: vi.fn(run) } as unknown as DatabaseAdapter,
    table,
    ledger,
    balanceMoves,
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
  paymentIntents: {
    retrieve: async () => ({
      id: 'pi_1',
      status: 'succeeded',
      currency: 'usd',
      amount_received: 1000,
    }),
  },
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

const topUpSession = {
  ...checkoutSession,
  id: 'cs_topup',
  payment_intent: 'pi_1',
  amount_subtotal: 1000,
  amount_total: 1000,
  metadata: {
    user_id: 'user_1',
    type: 'credit_topup',
    credit_amount_cents: '1000',
    top_up_units: '500',
  },
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
    amount_refunded: 2000,
    refunded: true,
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

function eventFor(eventType: string, sequence = NOW, object?: unknown): Stripe.Event {
  return {
    id: `evt_${eventType}_${sequence}`,
    type: eventType,
    created: sequence,
    data: { object: object ?? OBJECT_BY_FAMILY[familyOf(eventType)] },
  } as unknown as Stripe.Event;
}

function entitlementOf(table: StoredSubscription[]): string[] {
  return table.map((row) => `${row.user_id}:${effectivePlanTier(row.plan_tier, row.status)}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  creditAccount.remainingCents = 5_000;
  creditAccount.consumedKeys.clear();
});

describe('a second delivery of the same event changes nothing', () => {
  it.each(dispatchTable().map((type) => [type] as const))(
    'applies %s once when it arrives twice',
    async (eventType) => {
      const { db, table, balanceMoves } = makeLedgerDb(seededSubscription());

      await dispatchStripeEvent(db, stripeStub, eventFor(eventType));
      const afterFirst = {
        entitlement: entitlementOf(table),
        row: JSON.stringify(table),
        moves: [...balanceMoves],
      };

      await dispatchStripeEvent(db, stripeStub, eventFor(eventType));

      expect(entitlementOf(table)).toEqual(afterFirst.entitlement);
      expect(JSON.stringify(table)).toBe(afterFirst.row);
      expect(balanceMoves).toEqual(afterFirst.moves);
    },
  );

  it('grants a purchased top-up balance once when both checkout events carry it', async () => {
    const { db, ledger } = makeLedgerDb(seededSubscription());
    const completed = eventFor('checkout.session.completed', NOW, topUpSession);
    const asyncSucceeded = eventFor(
      'checkout.session.async_payment_succeeded',
      NOW + 1,
      topUpSession,
    );

    await dispatchStripeEvent(db, stripeStub, completed);
    await dispatchStripeEvent(db, stripeStub, asyncSucceeded);

    expect(ledger.filter((row) => row.type === 'purchase')).toHaveLength(1);
    expect(ledger[0]?.amountCents).toBe(1000);
  });

  it('revokes the refunded money once when the refund event is redelivered', async () => {
    const { db, ledger } = makeLedgerDb(seededSubscription());

    await dispatchStripeEvent(db, stripeStub, eventFor('charge.refunded'));
    await dispatchStripeEvent(db, stripeStub, eventFor('charge.refunded', NOW + 1));

    const revoked = ledger
      .filter((row) => row.type === 'refund')
      .reduce((total, row) => total - row.amountCents, 0);
    expect(revoked).toBe(2000);
  });

  it('revokes a disputed balance once and leaves the second delivery nothing to take', async () => {
    const { db } = makeLedgerDb(seededSubscription());

    await dispatchStripeEvent(db, stripeStub, eventFor('charge.dispute.created'));
    const afterFirst = creditAccount.remainingCents;
    await dispatchStripeEvent(db, stripeStub, eventFor('charge.dispute.created', NOW + 1));

    expect(afterFirst).toBe(0);
    expect(creditAccount.remainingCents).toBe(0);
  });
});

describe('an out-of-order pair settles on the state Stripe is in', () => {
  it('keeps the paid subscription when the invoice lands before the creation', async () => {
    const { db, table } = makeLedgerDb(null);

    await dispatchStripeEvent(db, stripeStub, eventFor('invoice.paid', NOW));
    await dispatchStripeEvent(db, stripeStub, eventFor('customer.subscription.created', NOW + 1));

    expect(table).toHaveLength(1);
    expect(entitlementOf(table)).toEqual(['user_1:pro']);
  });

  it('keeps the cancellation when a later delivery replays the update it followed', async () => {
    const { db, table } = makeLedgerDb(seededSubscription());

    await dispatchStripeEvent(db, stripeStub, {
      ...eventFor('customer.subscription.deleted', NOW + 10),
      data: { object: { ...stripeSubscription, canceled_at: NOW + 10 } },
    } as unknown as Stripe.Event);
    await dispatchStripeEvent(db, stripeStub, eventFor('customer.subscription.updated', NOW));

    expect(entitlementOf(table)).toEqual(['user_1:free']);
  });

  it('reaches the same entitlement whichever order the pair arrives in', async () => {
    const forward = makeLedgerDb(null);
    await dispatchStripeEvent(
      forward.db,
      stripeStub,
      eventFor('customer.subscription.created', NOW),
    );
    await dispatchStripeEvent(forward.db, stripeStub, eventFor('invoice.paid', NOW + 1));

    const reversed = makeLedgerDb(null);
    await dispatchStripeEvent(reversed.db, stripeStub, eventFor('invoice.paid', NOW + 1));
    await dispatchStripeEvent(
      reversed.db,
      stripeStub,
      eventFor('customer.subscription.created', NOW),
    );

    expect(entitlementOf(reversed.table)).toEqual(entitlementOf(forward.table));
  });
});

describe('an event type this deployment does not know', () => {
  it('is acknowledged and named without a statement or a thrown error', async () => {
    const { db, table, ledger } = makeLedgerDb(seededSubscription());

    await expect(
      dispatchStripeEvent(db, stripeStub, {
        id: 'evt_unknown',
        type: 'invoiceitem.created',
        created: NOW,
        data: { object: {} },
      } as unknown as Stripe.Event),
    ).resolves.toBeUndefined();

    expect(db.query).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(ledger).toEqual([]);
    expect(entitlementOf(table)).toEqual(['user_1:pro']);
    expect(
      loggerMocks.warn.mock.calls.filter((call) =>
        call.some((argument) => argument === 'Unhandled Stripe event type'),
      ),
    ).toHaveLength(1);
  });
});
