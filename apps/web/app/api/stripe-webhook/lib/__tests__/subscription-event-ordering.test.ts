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

interface Call {
  sql: string;
  params: unknown[];
}

const PERIOD_START = Math.floor(Date.parse('2026-08-01T00:00:00.000Z') / 1000);
const PERIOD_END = Math.floor(Date.parse('2026-09-01T00:00:00.000Z') / 1000);

const APPLIED_AT = '2026-08-10T12:00:00.000Z';
const STALE_EVENT_SEQUENCE = Math.floor(Date.parse('2026-08-10T11:00:00.000Z') / 1000);
const FRESH_EVENT_SEQUENCE = Math.floor(Date.parse('2026-08-10T13:00:00.000Z') / 1000);

function makeDb(existing: Record<string, unknown> | null) {
  const calls: Call[] = [];
  const rowsFor = (sql: string): unknown[] => {
    if (/^select id, user_id, plan_tier, status/.test(sql.trim())) {
      return existing ? [existing] : [];
    }
    if (/^update subscriptions set/.test(sql.trim())) return [{ id: 'sub_row_1' }];
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
  return { db, calls };
}

function subscriptionUpdatedEvent(created: number, status: string): Stripe.Event {
  return {
    id: `evt_${created}`,
    type: 'customer.subscription.updated',
    created,
    data: {
      object: {
        id: 'sub_123',
        customer: 'cus_123',
        status,
        cancel_at_period_end: false,
        canceled_at: null,
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
      },
    },
  } as unknown as Stripe.Event;
}

const EXISTING = {
  id: 'sub_row_1',
  user_id: 'user_123',
  plan_tier: 'pro',
  status: 'active',
  current_period_start: new Date(PERIOD_START * 1000).toISOString(),
};

function subscriptionWrites(calls: Call[]): Call[] {
  return calls.filter((call) => /^update subscriptions set/.test(call.sql.trim()));
}

describe('stripe subscription events reconcile by sequence, not by arrival', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ignores a snapshot older than the one already applied to the row', async () => {
    const { db, calls } = makeDb({ ...EXISTING, last_stripe_event_at: APPLIED_AT });

    await dispatchStripeEvent(
      db,
      {} as Stripe,
      subscriptionUpdatedEvent(STALE_EVENT_SEQUENCE, 'past_due'),
    );

    expect(subscriptionWrites(calls)).toHaveLength(0);
  });

  it('applies a snapshot newer than the one already applied', async () => {
    const { db, calls } = makeDb({ ...EXISTING, last_stripe_event_at: APPLIED_AT });

    await dispatchStripeEvent(
      db,
      {} as Stripe,
      subscriptionUpdatedEvent(FRESH_EVENT_SEQUENCE, 'past_due'),
    );

    const writes = subscriptionWrites(calls);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.params).toContain(FRESH_EVENT_SEQUENCE);
  });

  it('reads the applied sequence off the row it is about to overwrite', async () => {
    const { db, calls } = makeDb({ ...EXISTING, last_stripe_event_at: null });

    await dispatchStripeEvent(
      db,
      {} as Stripe,
      subscriptionUpdatedEvent(FRESH_EVENT_SEQUENCE, 'active'),
    );

    const read = calls.find((call) =>
      /^select id, user_id, plan_tier, status/.test(call.sql.trim()),
    );
    expect(read?.sql).toContain('last_stripe_event_at');
  });

  it('advances the stored sequence in the same statement that writes the snapshot', async () => {
    const { db, calls } = makeDb({ ...EXISTING, last_stripe_event_at: null });

    await dispatchStripeEvent(
      db,
      {} as Stripe,
      subscriptionUpdatedEvent(FRESH_EVENT_SEQUENCE, 'active'),
    );

    const write = subscriptionWrites(calls)[0]!;
    expect(write.sql).toContain('last_stripe_event_at');
    expect(write.sql).toMatch(/last_stripe_event_at\s*<=\s*to_timestamp/);
    expect(write.params).toContain(FRESH_EVENT_SEQUENCE);
  });
});
