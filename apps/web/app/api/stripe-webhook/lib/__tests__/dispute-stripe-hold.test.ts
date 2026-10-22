import { beforeEach, describe, expect, it, vi } from 'vitest';
type NotificationModule = typeof import('@/lib/services/notification-service');

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

vi.mock('@/lib/services/notification-service', async (importOriginal) => ({
  ...(await importOriginal<NotificationModule>()),
  recordNotification: vi.fn().mockResolvedValue({ recorded: true }),
}));

vi.mock('@/lib/price-tier-mapping', () => ({
  isPriceIdRegistered: (priceId: string | null | undefined) => priceId === 'price_current',
  resolvePlanTier: (_metadata: unknown, priceId: string | null | undefined) =>
    priceId === 'price_current' ? 'pro' : null,
  isValidPlanTier: (tier: string | null | undefined) =>
    !!tier && ['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'].includes(tier),
  getTierMapping: () => ({ price_current: { tier: 'pro', interval: 'monthly' } }),
  getEnterpriseProductId: () => null,
  isEnterpriseProductId: () => false,
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: vi.fn().mockResolvedValue(undefined),
    resetCreditsForNewPeriod: vi.fn().mockResolvedValue(undefined),
    carryCreditsForUpgradePeriod: vi.fn().mockResolvedValue(undefined),
  },
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

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';

import { dispatchStripeEvent } from '../handlers';

const PERIOD_START = Math.floor(Date.parse('2026-10-01T00:00:00.000Z') / 1000);
const PERIOD_END = Math.floor(Date.parse('2026-11-01T00:00:00.000Z') / 1000);
const NOW = Math.floor(Date.parse('2026-10-21T12:00:00.000Z') / 1000);

interface Call {
  sql: string;
  params: unknown[];
}

interface DisputeState {
  outcome: 'open' | 'won' | 'lost';
  revoked_at: string | null;
  restored_at: string | null;
}

function harness(options: { disputeOpen: boolean; dispute?: Partial<DisputeState> }) {
  const calls: Call[] = [];
  const dispute: DisputeState = {
    outcome: 'open',
    revoked_at: null,
    restored_at: null,
    ...options.dispute,
  };
  const subscriptionRow = {
    id: 'sub_row_1',
    user_id: 'user_123',
    plan_tier: 'pro',
    status: 'past_due',
    cancel_at_period_end: true,
    stripe_subscription_id: 'sub_held1',
    current_period_start: new Date(PERIOD_START * 1000).toISOString(),
    last_stripe_event_at: null,
    stripe_price_id: 'price_current',
    plan_catalog_version: null,
  };
  const rowsFor = (sql: string): unknown[] => {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (text.includes('from public.billing_disputes where stripe_customer_id = $1 and outcome')) {
      return options.disputeOpen ? [{ id: 'dp_1' }] : [];
    }
    if (text.includes('from public.billing_disputes where stripe_customer_id = $1')) return [];
    if (text.includes('from public.billing_disputes where id = $1')) {
      return [
        {
          id: 'dp_1',
          user_id: 'user_123',
          stripe_customer_id: 'cus_123',
          revoked_account_id: null,
          revoked_credits_microusd: 0,
          revoked_top_up_microusd: 0,
          prior_subscription_status: 'active',
          prior_cancel_at_period_end: false,
          ...dispute,
        },
      ];
    }
    if (text.startsWith("update public.billing_disputes set outcome = 'won'")) {
      return [{ id: 'dp_1' }];
    }
    if (text.startsWith("update public.billing_disputes set outcome = 'lost'")) {
      return dispute.outcome === 'lost' ? [] : [{ id: 'dp_1' }];
    }
    if (text.includes('from profiles where stripe_customer_id')) return [{ id: 'user_123' }];
    if (text.includes('revoke_disputed_credits_microusd')) {
      return [{ account_id: null, revoked_microusd: 0, top_up_microusd: 0 }];
    }
    if (text.includes('from subscriptions')) return [subscriptionRow];
    if (text.startsWith('update subscriptions set')) return [{ id: 'sub_row_1' }];
    return [];
  };
  const record = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return rowsFor(sql);
  };
  const db = { query: vi.fn(record), execute: vi.fn(record) } as unknown as DatabaseAdapter;
  return { db, calls };
}

function liveSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_held1',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    canceled_at: null,
    pause_collection: null,
    metadata: { plan_tier: 'pro' },
    items: {
      data: [
        {
          price: { id: 'price_current' },
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
        },
      ],
    },
    ...overrides,
  };
}

const stripeMocks = {
  retrieveCharge: vi.fn(),
  retrieveSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
};
const stripe = {
  charges: { retrieve: stripeMocks.retrieveCharge },
  subscriptions: {
    retrieve: stripeMocks.retrieveSubscription,
    update: stripeMocks.updateSubscription,
    cancel: stripeMocks.cancelSubscription,
  },
} as unknown as Stripe;

function event(type: string, object: Record<string, unknown>, id = `evt_${type}`): Stripe.Event {
  return { id, type, created: NOW, data: { object } } as unknown as Stripe.Event;
}

const dispute = (status: string) => ({
  id: 'dp_1',
  charge: 'ch_1',
  amount: 2000,
  currency: 'usd',
  reason: 'fraudulent',
  status,
  created: NOW,
});

function subscriptionWrites(calls: Call[]): Call[] {
  return calls.filter((call) => /^\s*update subscriptions set/.test(call.sql));
}

beforeEach(() => {
  vi.clearAllMocks();
  stripeMocks.retrieveCharge.mockResolvedValue({ id: 'ch_1', customer: 'cus_123' });
  stripeMocks.retrieveSubscription.mockResolvedValue(liveSubscription());
  stripeMocks.updateSubscription.mockImplementation(
    async (_id: string, params: Record<string, unknown>) => liveSubscription(params),
  );
  stripeMocks.cancelSubscription.mockResolvedValue(liveSubscription({ status: 'canceled' }));
});

describe('charge.dispute.created holds the plan in Stripe, not only in the database', () => {
  it('voids collection on the disputed subscription, marked with the dispute', async () => {
    const { db } = harness({ disputeOpen: true });

    await dispatchStripeEvent(
      db,
      stripe,
      event('charge.dispute.created', dispute('needs_response')),
    );

    expect(stripeMocks.updateSubscription).toHaveBeenCalledWith(
      'sub_held1',
      { pause_collection: { behavior: 'void' }, metadata: { dispute_hold: 'dp_1' } },
      { idempotencyKey: 'dispute-hold:dp_1' },
    );
  });

  it('does not touch Stripe again when the dispute was already held', async () => {
    const { db } = harness({
      disputeOpen: true,
      dispute: { revoked_at: '2026-10-20T00:00:00.000Z' },
    });

    await dispatchStripeEvent(
      db,
      stripe,
      event('charge.dispute.created', dispute('needs_response')),
    );

    expect(stripeMocks.updateSubscription).not.toHaveBeenCalled();
  });
});

describe('no later Stripe event re-entitles an account an open dispute holds', () => {
  it('ignores customer.subscription.updated that reports the plan active', async () => {
    const { db, calls } = harness({ disputeOpen: true });

    await dispatchStripeEvent(
      db,
      stripe,
      event('customer.subscription.updated', liveSubscription()),
    );

    expect(subscriptionWrites(calls)).toEqual([]);
  });

  it('ignores invoice.paid for the held subscription', async () => {
    const { db, calls } = harness({ disputeOpen: true });

    await dispatchStripeEvent(
      db,
      stripe,
      event('invoice.paid', {
        id: 'in_1',
        customer: 'cus_123',
        parent: { subscription_details: { subscription: 'sub_held1' } },
      }),
    );

    expect(subscriptionWrites(calls)).toEqual([]);
  });

  it('leaves the held status alone when a renewal payment fails', async () => {
    const { db, calls } = harness({ disputeOpen: true });

    await dispatchStripeEvent(
      db,
      stripe,
      event('invoice.payment_failed', {
        id: 'in_2',
        customer: 'cus_123',
        parent: { subscription_details: { subscription: 'sub_held1' } },
      }),
    );

    expect(calls.some((call) => call.sql.includes('update subscriptions set status'))).toBe(false);
  });

  it('still applies a cancellation while the dispute is open', async () => {
    const { db, calls } = harness({ disputeOpen: true });

    await dispatchStripeEvent(
      db,
      stripe,
      event('customer.subscription.updated', liveSubscription({ status: 'canceled' })),
    );

    expect(subscriptionWrites(calls)).toHaveLength(1);
    expect(subscriptionWrites(calls)[0]!.params[0]).toBe('canceled');
  });

  it('applies the same update normally once no dispute is open', async () => {
    const { db, calls } = harness({ disputeOpen: false });

    await dispatchStripeEvent(
      db,
      stripe,
      event('customer.subscription.updated', liveSubscription()),
    );

    expect(subscriptionWrites(calls)).toHaveLength(1);
    expect(subscriptionWrites(calls)[0]!.params[0]).toBe('active');
  });
});

describe('the dispute outcome settles the Stripe hold', () => {
  it('resumes collection and restores the plan when the dispute is won', async () => {
    stripeMocks.retrieveSubscription.mockResolvedValue(
      liveSubscription({
        pause_collection: { behavior: 'void' },
        metadata: { plan_tier: 'pro', dispute_hold: 'dp_1' },
      }),
    );
    const { db, calls } = harness({
      disputeOpen: false,
      dispute: { revoked_at: '2026-10-20T00:00:00.000Z' },
    });

    await dispatchStripeEvent(db, stripe, event('charge.dispute.closed', dispute('won')));

    expect(stripeMocks.updateSubscription).toHaveBeenCalledWith(
      'sub_held1',
      { pause_collection: '', metadata: { dispute_hold: '' } },
      { idempotencyKey: 'dispute-release:dp_1' },
    );
    expect(
      calls.some(
        (call) =>
          call.sql.includes('update subscriptions set status = $2') && call.params[1] === 'active',
      ),
    ).toBe(true);
  });

  it('cancels the held subscription in Stripe and ends the plan when the dispute is lost', async () => {
    const { db, calls } = harness({
      disputeOpen: false,
      dispute: { revoked_at: '2026-10-20T00:00:00.000Z' },
    });

    await dispatchStripeEvent(db, stripe, event('charge.dispute.closed', dispute('lost')));

    expect(stripeMocks.cancelSubscription).toHaveBeenCalledWith(
      'sub_held1',
      { prorate: false, invoice_now: false },
      { idempotencyKey: 'dispute-lost:dp_1' },
    );
    expect(calls.some((call) => /set status = 'canceled', plan_tier = 'free'/.test(call.sql))).toBe(
      true,
    );
    expect(stripeMocks.updateSubscription).not.toHaveBeenCalled();
  });

  it('does not cancel again when the lost outcome is redelivered', async () => {
    const { db } = harness({
      disputeOpen: false,
      dispute: { outcome: 'lost', revoked_at: '2026-10-20T00:00:00.000Z' },
    });

    await dispatchStripeEvent(db, stripe, event('charge.dispute.closed', dispute('lost')));

    expect(stripeMocks.cancelSubscription).not.toHaveBeenCalled();
  });
});
