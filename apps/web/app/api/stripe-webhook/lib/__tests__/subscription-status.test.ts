/**
 * Stripe's subscription status vocabulary is wider than the column that stores
 * it. `paused` — a trial that ended with no payment method — has no slot in the
 * CHECK constraint created by `apps/web/db/neon/0003_subscriptions.sql`, so
 * writing it verbatim aborts the webhook transaction, every Stripe retry aborts
 * the same way, and the row keeps its previous `trialing`/`active` status while
 * entitlement keeps reading that status as paid access.
 *
 * The allowed set below is parsed out of the migration rather than retyped, so
 * widening the constraint (the real fix, which makes `paused` storable) relaxes
 * this test instead of breaking it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

vi.mock('@/lib/price-tier-mapping', () => ({
  isPriceIdRegistered: (priceId: string | null | undefined) => priceId === 'price_current',
  resolvePlanTier: () => 'pro',
  isValidPlanTier: (tier: string | null | undefined) => tier === 'pro',
  getTierMapping: () => ({ price_current: { tier: 'pro', interval: 'monthly' } }),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: vi.fn().mockResolvedValue(undefined),
    resetCreditsForNewPeriod: vi.fn().mockResolvedValue(undefined),
    carryCreditsForUpgradePeriod: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: vi.fn().mockResolvedValue(null),
    deductCredits: vi.fn().mockResolvedValue({ success: true }),
  },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';

import { updateSubscriptionFromStripeSubscription } from '../db';
import { toStoredSubscriptionStatus } from '../subscription-status';

function storableStatusesFromMigration(): string[] {
  const migration = readFileSync(
    path.resolve(import.meta.dirname, '../../../../../db/neon/0003_subscriptions.sql'),
    'utf8',
  );
  const check =
    /status text not null default 'active'\s*check \(status = any \(array\[([^\]]+)\]\)\)/i.exec(
      migration,
    )?.[1];
  if (!check) throw new Error('Could not read the subscriptions.status CHECK constraint');
  return [...check.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!);
}

const NOW = Math.floor(Date.now() / 1000);

function pausedSubscription(): Stripe.Subscription {
  return {
    id: 'sub_paused',
    customer: 'cus_123',
    // Stripe sets this when a trial ends and the customer left no payment
    // method (trial_settings.end_behavior.missing_payment_method = 'pause').
    status: 'paused',
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: {},
    items: { data: [{ price: { id: 'price_current' } }] },
    current_period_start: NOW,
    current_period_end: NOW + 30 * 24 * 60 * 60,
  } as unknown as Stripe.Subscription;
}

describe('toStoredSubscriptionStatus', () => {
  const storable = storableStatusesFromMigration();

  it.each([
    'active',
    'trialing',
    'past_due',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'unpaid',
  ])('passes %s through unchanged', (status) => {
    expect(toStoredSubscriptionStatus(status)).toBe(status);
  });

  it('maps every Stripe status onto one the column can store', () => {
    const stripeStatuses = [
      'active',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'past_due',
      'paused',
      'trialing',
      'unpaid',
    ];
    for (const status of stripeStatuses) {
      expect(storable).toContain(toStoredSubscriptionStatus(status));
    }
  });

  it('never maps a Stripe status onto an entitled one it did not mean', () => {
    // active/trialing are the entitled statuses (lib/entitlement.ts). Only
    // Stripe's own active/trialing may produce them.
    expect(toStoredSubscriptionStatus('paused')).not.toBe('active');
    expect(toStoredSubscriptionStatus('paused')).not.toBe('trialing');
  });

  it('fails closed on a status the pinned SDK has never heard of', () => {
    expect(storable).toContain(toStoredSubscriptionStatus('some_future_status'));
    expect(loggerMocks.error).toHaveBeenCalled();
  });
});

describe('customer.subscription.updated for a paused subscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes a status the subscriptions CHECK constraint accepts', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const rowsFor = (sql: string): unknown[] => {
      if (sql.includes('select id, user_id, plan_tier')) {
        return [
          {
            id: 'row_1',
            user_id: 'user_123',
            plan_tier: 'pro',
            status: 'trialing',
            current_period_start: new Date((NOW - 60) * 1000).toISOString(),
          },
        ];
      }
      if (sql.includes('update subscriptions set')) return [{ id: 'row_1' }];
      return [];
    };
    const record = async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return rowsFor(sql);
    };
    const db = {
      query: vi.fn(record),
      execute: vi.fn(record),
    } as unknown as DatabaseAdapter;

    await updateSubscriptionFromStripeSubscription(db, {} as Stripe, pausedSubscription());

    const update = calls.find((call) => call.sql.includes('update subscriptions set'));
    expect(update, 'the paused subscription must still be written').toBeDefined();

    // The status is the first bound parameter of that UPDATE.
    const writtenStatus = update!.params[0];
    expect(
      storableStatusesFromMigration(),
      `status "${String(writtenStatus)}" violates the subscriptions.status CHECK constraint, so ` +
        `the webhook transaction rolls back and the row keeps its entitled status`,
    ).toContain(writtenStatus);
    // And a paused subscription must not stay entitled.
    expect(writtenStatus).not.toBe('trialing');
    expect(writtenStatus).not.toBe('active');
  });
});
