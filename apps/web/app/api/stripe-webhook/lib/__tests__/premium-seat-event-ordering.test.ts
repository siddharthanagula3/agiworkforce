import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.hoisted(() => {
  process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'] = 'price_team_standard';
  process.env['STRIPE_PRICE_TEAM_PREMIUM_MONTHLY_USD'] = 'price_team_premium';
});

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/services/subscription-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/subscription-service')>()),
  SubscriptionService: {
    allocateCreditsForPeriod: vi.fn().mockResolvedValue(undefined),
    resetCreditsForNewPeriod: vi.fn().mockResolvedValue(undefined),
    carryCreditsForUpgradePeriod: vi.fn().mockResolvedValue(undefined),
  },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';

import { dispatchStripeEvent } from '../handlers';

interface Call {
  sql: string;
  params: unknown[];
}

const PERIOD_START = Math.floor(Date.parse('2026-10-01T00:00:00.000Z') / 1000);
const PERIOD_END = Math.floor(Date.parse('2026-11-01T00:00:00.000Z') / 1000);
const APPLIED_AT = '2026-10-10T12:00:00.000Z';
const STALE_EVENT = Math.floor(Date.parse('2026-10-10T11:00:00.000Z') / 1000);
const FRESH_EVENT = Math.floor(Date.parse('2026-10-10T13:00:00.000Z') / 1000);

function makeDb() {
  const calls: Call[] = [];
  const rowsFor = (sql: string): unknown[] => {
    const text = sql.trim();
    if (/^select id, user_id, plan_tier, status/.test(text)) {
      return [
        {
          id: 'sub_row_1',
          user_id: 'owner_1',
          plan_tier: 'team',
          status: 'active',
          current_period_start: new Date(PERIOD_START * 1000).toISOString(),
          last_stripe_event_at: APPLIED_AT,
        },
      ];
    }
    if (/^update subscriptions set/.test(text)) return [{ id: 'sub_row_1' }];
    if (text.includes('set licensed_seats')) return [{ id: 'org_1', licensed_seats: 4 }];
    return [];
  };
  const record = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return rowsFor(sql);
  };
  const db = { query: vi.fn(record), execute: vi.fn(record) } as unknown as DatabaseAdapter;
  return { db, calls };
}

function teamUpdated(created: number, premium: number): Stripe.Event {
  const period = { current_period_start: PERIOD_START, current_period_end: PERIOD_END };
  return {
    id: `evt_${created}_${premium}`,
    type: 'customer.subscription.updated',
    created,
    data: {
      object: {
        id: 'sub_team',
        customer: 'cus_team',
        status: 'active',
        cancel_at_period_end: false,
        canceled_at: null,
        metadata: { plan_tier: 'team' },
        items: {
          data: [
            { price: { id: 'price_team_standard' }, quantity: 4 - premium, ...period },
            { price: { id: 'price_team_premium' }, quantity: premium, ...period },
          ],
        },
      },
    },
  } as unknown as Stripe.Event;
}

function premiumWrites(calls: Call[]): Call[] {
  return calls.filter((call) => call.sql.includes('set licensed_premium_seats'));
}

afterAll(() => {
  delete process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'];
  delete process.env['STRIPE_PRICE_TEAM_PREMIUM_MONTHLY_USD'];
});

describe('Premium seat counts follow Stripe by event sequence, not by arrival', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ignores an older snapshot that arrives after a newer one, leaving the Premium count alone', async () => {
    const { db, calls } = makeDb();

    await dispatchStripeEvent(db, {} as Stripe, teamUpdated(STALE_EVENT, 1));

    expect(premiumWrites(calls)).toEqual([]);
    expect(calls.some((call) => call.sql.includes('update public.organization_members'))).toBe(
      false,
    );
  });

  it('applies a newer snapshot and stores the Premium count it bills', async () => {
    const { db, calls } = makeDb();

    await dispatchStripeEvent(db, {} as Stripe, teamUpdated(FRESH_EVENT, 2));

    expect(premiumWrites(calls).map((call) => call.params)).toEqual([[2, 'org_1']]);
  });
});
