import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

const recordAuditEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent,
  logSecurityEvent: vi.fn(async () => undefined),
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

const subscriptionServiceMocks = vi.hoisted(() => ({
  allocateCreditsForPeriod: vi.fn().mockResolvedValue(undefined),
  resetCreditsForNewPeriod: vi.fn().mockResolvedValue(undefined),
  carryCreditsForUpgradePeriod: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: subscriptionServiceMocks,
}));

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: vi.fn().mockResolvedValue(null),
    deductCredits: vi.fn().mockResolvedValue({ success: true }),
  },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';

import { dispatchStripeEvent } from '../handlers';
import { updateSubscriptionFromStripeSubscription } from '../db';

interface Call {
  sql: string;
  params: unknown[];
}

function makeDb(rowsFor: (sql: string) => unknown[]) {
  const calls: Call[] = [];
  const record = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return rowsFor(sql);
  };
  const db = {
    query: vi.fn(record),
    execute: vi.fn(record),
  } as unknown as DatabaseAdapter;
  return { db, calls };
}

function planUpdates(calls: Call[]): Call[] {
  return calls.filter((call) => /update subscriptions[\s\S]*plan_tier\s*=\s*'free'/.test(call.sql));
}

const NOW = Math.floor(Date.now() / 1000);

function refundEvent(charge: Partial<Stripe.Charge>): Stripe.Event {
  return {
    id: 'evt_refund',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_123',
        customer: 'cus_123',
        amount: 2000,
        amount_refunded: 2000,
        refunded: true,
        metadata: {},
        ...charge,
      },
    },
  } as unknown as Stripe.Event;
}

describe('charge.refunded revokes the entitlement the refund paid for', () => {
  beforeEach(() => vi.clearAllMocks());

  it('downgrades the plan when the whole charge is refunded', async () => {
    const { db, calls } = makeDb((sql) =>
      sql.includes('from profiles')
        ? [{ id: 'user_123' }]
        : sql.includes('select plan_tier from subscriptions')
          ? [{ plan_tier: 'pro' }]
          : [],
    );

    await dispatchStripeEvent(db, {} as Stripe, refundEvent({}));

    const [update] = planUpdates(calls);
    expect(update).toBeDefined();
    expect(update!.sql).toContain("status = 'past_due'");
    expect(update!.params).toEqual(['cus_123']);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'plan_changed',
        detail: expect.objectContaining({ previousPlanTier: 'pro', planTier: 'free' }),
      }),
    );
  });

  it('never writes the terminal canceled status, which would block later renewals', async () => {
    const { db, calls } = makeDb((sql) =>
      sql.includes('from profiles') ? [{ id: 'user_123' }] : [],
    );

    await dispatchStripeEvent(db, {} as Stripe, refundEvent({}));

    expect(planUpdates(calls)[0]!.sql).not.toContain("status = 'canceled'");
  });

  it('leaves the plan alone on a partial refund', async () => {
    const { db, calls } = makeDb((sql) =>
      sql.includes('from profiles') ? [{ id: 'user_123' }] : [],
    );

    await dispatchStripeEvent(
      db,
      {} as Stripe,
      refundEvent({ amount_refunded: 500, refunded: false }),
    );

    expect(planUpdates(calls)).toHaveLength(0);
    expect(calls.some((call) => call.sql.includes('handle_refund'))).toBe(true);
  });

  function refundLedgerDb(alreadyRevokedCents: number) {
    return makeDb((sql) => {
      if (sql.includes('from profiles')) return [{ id: 'user_123' }];
      if (sql.includes('from credit_transactions'))
        return [{ revoked_cents: String(alreadyRevokedCents) }];
      return [];
    });
  }

  function handleRefundAmounts(calls: Call[]): unknown[] {
    return calls.filter((call) => call.sql.includes('handle_refund')).map((call) => call.params[1]);
  }

  it('revokes only the new money on a second partial refund', async () => {
    const { db, calls } = refundLedgerDb(300);

    await dispatchStripeEvent(
      db,
      {} as Stripe,
      refundEvent({ amount: 1200, amount_refunded: 600, refunded: false }),
    );

    expect(handleRefundAmounts(calls)).toEqual([300]);
  });

  it('revokes nothing when a stale or replayed event repeats money already clawed back', async () => {
    const { db, calls } = refundLedgerDb(600);

    await dispatchStripeEvent(
      db,
      {} as Stripe,
      refundEvent({ amount: 1200, amount_refunded: 300, refunded: false }),
    );

    expect(handleRefundAmounts(calls)).toEqual([]);
  });

  it('still revokes the full amount for the first refund on a charge', async () => {
    const { db, calls } = refundLedgerDb(0);

    await dispatchStripeEvent(
      db,
      {} as Stripe,
      refundEvent({ amount: 1200, amount_refunded: 500, refunded: false }),
    );

    expect(handleRefundAmounts(calls)).toEqual([500]);
  });

  it('scopes the already-revoked lookup to this user and this charge', async () => {
    const { db, calls } = refundLedgerDb(0);

    await dispatchStripeEvent(db, {} as Stripe, refundEvent({}));

    const lookup = calls.find((call) => call.sql.includes('from credit_transactions'));
    expect(lookup).toBeDefined();
    expect(lookup!.params).toEqual(['user_123', 'Refund for charge ch_123']);
  });

  it('leaves the plan alone when the refunded charge bought credits, not a plan', async () => {
    const { db, calls } = makeDb((sql) =>
      sql.includes('from profiles') ? [{ id: 'user_123' }] : [],
    );

    await dispatchStripeEvent(
      db,
      {} as Stripe,
      refundEvent({
        metadata: {
          type: 'credit_topup',
          credit_amount_cents: '2000',
          top_up_units: '1000',
        },
      }),
    );

    expect(planUpdates(calls)).toHaveLength(0);
    expect(calls.some((call) => call.sql.includes('handle_top_up_refund'))).toBe(true);
  });
});

describe('renewals on a Price the deployment no longer registers', () => {
  beforeEach(() => vi.clearAllMocks());

  const legacyRenewal = {
    id: 'sub_legacy',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: {},
    items: { data: [{ price: { id: 'price_legacy' } }] },
    current_period_start: NOW,
    current_period_end: NOW + 30 * 24 * 60 * 60,
  } as unknown as Stripe.Subscription;

  it('renews at the tier already recorded instead of failing the webhook', async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes('select plan_tier from subscriptions')) return [{ plan_tier: 'max' }];
      if (sql.includes('select id, user_id, plan_tier')) {
        return [
          {
            id: 'row_1',
            user_id: 'user_123',
            plan_tier: 'max',
            status: 'active',
            current_period_start: new Date((NOW - 60) * 1000).toISOString(),
          },
        ];
      }
      if (sql.includes('update subscriptions set')) return [{ id: 'row_1' }];
      return [];
    });

    await expect(
      updateSubscriptionFromStripeSubscription(db, {} as Stripe, legacyRenewal),
    ).resolves.toBeUndefined();

    const update = calls.find((call) => call.sql.includes('update subscriptions set'))!;
    expect(update.params).toContain('max');
    expect(update.params).toContain('price_legacy');
    expect(subscriptionServiceMocks.resetCreditsForNewPeriod).toHaveBeenCalled();
  });

  it('still refuses an unregistered Price with no recorded paid tier', async () => {
    const { db } = makeDb(() => []);

    await expect(
      updateSubscriptionFromStripeSubscription(db, {} as Stripe, legacyRenewal),
    ).rejects.toThrow(/unregistered Stripe Price/i);
  });
});

describe('credit top-up checkout must stamp charge-visible metadata', () => {
  it('every credit_topup checkout also sets payment_intent_data.metadata', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const appDir = path.resolve(import.meta.dirname, '../../../../..');
    const skip = new Set(['node_modules', '__tests__', '.next', 'dist', 'e2e', '.turbo']);
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;

        const src = fs.readFileSync(full, 'utf8');
        if (!src.includes('credit_topup')) continue;
        if (!/checkout\.sessions\.create/.test(src)) continue;
        if (!src.includes('payment_intent_data')) {
          offenders.push(path.relative(appDir, full));
        }
      }
    };
    walk(appDir);

    expect(
      offenders,
      `these files create a credit_topup Checkout Session without payment_intent_data.metadata, ` +
        `so charge.metadata stays empty and refunding a top-up would revoke the customer's ` +
        `subscription plan:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
