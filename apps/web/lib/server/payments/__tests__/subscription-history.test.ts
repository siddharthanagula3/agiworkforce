import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import type { NormalizedSubscription } from '../domain';
import {
  readSubscriptionStateHistory,
  recordSubscriptionStateTransition,
} from '../subscription-history';

const ORGANIZATION_ID = '00000000-0000-4000-8000-0000000000bb';

function subscription(overrides: Partial<NormalizedSubscription> = {}): NormalizedSubscription {
  return {
    provider: 'stripe',
    subscriptionReference: 'sub_1',
    customerReference: 'cus_1',
    ownerReference: 'user_1',
    plan: { productReference: 'prod_1', priceReference: 'price_1' },
    status: 'active',
    period: {
      startsAt: new Date('2026-09-01T00:00:00.000Z'),
      endsAt: new Date('2026-10-01T00:00:00.000Z'),
    },
    interval: { unit: 'month', count: 1 },
    quantity: 5,
    cancelAtPeriodEnd: false,
    endedAt: null,
    environment: 'production',
    ...overrides,
  };
}

/** Keeps every appended transition so a test can see what the table would hold. */
function historyDb(seenEventIds = new Set<string>()) {
  const rows: Record<string, unknown>[] = [];

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('insert into public.organization_subscription_state_transitions')) {
      const eventId = params[9] as string | null;
      if (eventId !== null && seenEventIds.has(eventId)) return [];
      if (eventId !== null) seenEventIds.add(eventId);
      rows.unshift({
        payment_provider: params[1],
        subscription_reference: params[2],
        previous_status: params[3],
        status: params[4],
        quantity: params[5],
        cancel_at_period_end: params[6],
        period_start: params[7],
        period_end: params[8],
        provider_event_id: eventId,
        occurred_at: (params[10] as string | null) ?? new Date().toISOString(),
      });
      return [{ id: `transition_${rows.length}` }];
    }
    if (sql.includes('from public.organization_subscription_state_transitions')) {
      return sql.includes('subscription_reference = $3') ? rows.slice(0, 1) : rows;
    }
    return [];
  });

  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, rows };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('subscription state history', () => {
  it('records the first state a provider reports', async () => {
    const { db, rows } = historyDb();
    const outcome = await recordSubscriptionStateTransition(db, {
      organizationId: ORGANIZATION_ID,
      subscription: subscription(),
      providerEventId: 'evt_1',
    });

    expect(outcome).toBe('recorded');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ previous_status: null, status: 'active', quantity: 5 });
  });

  it('keeps the state it moved from when the status changes', async () => {
    const { db, rows } = historyDb();
    await recordSubscriptionStateTransition(db, {
      organizationId: ORGANIZATION_ID,
      subscription: subscription(),
      providerEventId: 'evt_1',
    });
    const outcome = await recordSubscriptionStateTransition(db, {
      organizationId: ORGANIZATION_ID,
      subscription: subscription({ status: 'past_due' }),
      providerEventId: 'evt_2',
    });

    expect(outcome).toBe('recorded');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ previous_status: 'active', status: 'past_due' });

    const history = await readSubscriptionStateHistory(db, ORGANIZATION_ID);
    expect(history.map((entry) => entry.status)).toEqual(['past_due', 'active']);
  });

  it('writes nothing when a webhook repeats the state already recorded', async () => {
    const { db, rows } = historyDb();
    await recordSubscriptionStateTransition(db, {
      organizationId: ORGANIZATION_ID,
      subscription: subscription(),
      providerEventId: 'evt_1',
    });
    const outcome = await recordSubscriptionStateTransition(db, {
      organizationId: ORGANIZATION_ID,
      subscription: subscription(),
      providerEventId: 'evt_2',
    });

    expect(outcome).toBe('unchanged');
    expect(rows).toHaveLength(1);
  });

  it('records a seat change as its own transition', async () => {
    const { db, rows } = historyDb();
    await recordSubscriptionStateTransition(db, {
      organizationId: ORGANIZATION_ID,
      subscription: subscription(),
      providerEventId: 'evt_1',
    });
    await recordSubscriptionStateTransition(db, {
      organizationId: ORGANIZATION_ID,
      subscription: subscription({ quantity: 12 }),
      providerEventId: 'evt_2',
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ previous_status: 'active', status: 'active', quantity: 12 });
  });

  it('absorbs a replayed provider event rather than counting it twice', async () => {
    const seen = new Set<string>();
    const { db, rows } = historyDb(seen);
    await recordSubscriptionStateTransition(db, {
      organizationId: ORGANIZATION_ID,
      subscription: subscription(),
      providerEventId: 'evt_1',
    });
    const outcome = await recordSubscriptionStateTransition(db, {
      organizationId: ORGANIZATION_ID,
      subscription: subscription({ status: 'past_due' }),
      providerEventId: 'evt_1',
    });

    expect(outcome).toBe('duplicate');
    expect(rows).toHaveLength(1);
  });

  it('records a store transition in the same shape as a Stripe one', async () => {
    const { db, rows } = historyDb();
    await recordSubscriptionStateTransition(db, {
      organizationId: ORGANIZATION_ID,
      subscription: subscription({
        provider: 'apple',
        subscriptionReference: 'apple_original_1',
        quantity: 1,
      }),
      providerEventId: null,
    });

    expect(rows[0]).toMatchObject({
      payment_provider: 'apple',
      subscription_reference: 'apple_original_1',
      status: 'active',
    });
  });
});
