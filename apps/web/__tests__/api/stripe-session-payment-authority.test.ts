import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  allocateCredits: vi.fn(),
  carryUpgradeCredits: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: mocks.allocateCredits,
    carryCreditsForUpgradePeriod: mocks.carryUpgradeCredits,
  },
}));
vi.mock('@/lib/services/credit-service', () => ({ CreditService: {} }));
vi.mock('@/lib/price-tier-mapping', async (importOriginal) => ({
  ...(await importOriginal()),
  resolvePlanTier: (_metadata: unknown, priceId: unknown) =>
    priceId === 'price_pro_monthly' ? 'pro' : null,
  isValidPlanTier: (tier: unknown) => tier === 'pro',
  isPriceIdRegistered: (priceId: unknown) => priceId === 'price_pro_monthly',
  getTierMapping: () => ({ price_pro_monthly: { tier: 'pro', interval: 'monthly' } }),
}));

import { upsertSubscriptionFromSession } from '@/app/api/stripe-webhook/lib/db';

function subscriptionUpsertCalls() {
  return mocks.query.mock.calls.filter(([sql]) =>
    String(sql).includes('insert into subscriptions'),
  );
}

describe('entitlement is provisioned only from a confirmed Stripe subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('select id from profiles where id')) return [{ id: 'user_1' }];
      if (sql.includes('insert into subscriptions')) return [{ id: 'sub_db_1' }];
      return [];
    });
    mocks.execute.mockResolvedValue(1);
  });

  it('writes no entitlement when Stripe cannot confirm the subscription status', async () => {
    const db = { query: mocks.query, execute: mocks.execute } as never;
    const stripe = {
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({ id: 'cs_1', total_details: null }),
        },
      },
      customers: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ id: 'cus_1', email: 'b@example.com', deleted: false }),
      },
      subscriptions: {
        retrieve: vi.fn().mockRejectedValue(new Error('Stripe API unavailable')),
      },
    } as never;
    const session = {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_live_1',
      client_reference_id: 'user_1',
      metadata: { user_id: 'user_1', plan_tier: 'pro' },
      line_items: { data: [{ price: { id: 'price_pro_monthly' }, quantity: 1 }] },
    } as never;

    await expect(upsertSubscriptionFromSession(db, stripe, session)).rejects.toThrow(
      /status is unconfirmed/i,
    );
    expect(subscriptionUpsertCalls()).toHaveLength(0);
    expect(mocks.allocateCredits).not.toHaveBeenCalled();
  });

  it('writes no entitlement for a session that carries no Stripe subscription', async () => {
    const db = { query: mocks.query, execute: mocks.execute } as never;
    const stripe = {
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({ id: 'cs_2', total_details: null }),
        },
      },
      customers: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ id: 'cus_1', email: 'b@example.com', deleted: false }),
      },
      subscriptions: { retrieve: vi.fn() },
    } as never;
    const session = {
      id: 'cs_2',
      customer: 'cus_1',
      subscription: null,
      client_reference_id: 'user_1',
      metadata: { user_id: 'user_1', plan_tier: 'pro' },
      line_items: { data: [{ price: { id: 'price_pro_monthly' }, quantity: 1 }] },
    } as never;

    await expect(upsertSubscriptionFromSession(db, stripe, session)).rejects.toThrow(
      /without a Stripe subscription/i,
    );
    expect(subscriptionUpsertCalls()).toHaveLength(0);
    expect(mocks.allocateCredits).not.toHaveBeenCalled();
  });

  it('stores the unentitled status Stripe reports for a payment that has not cleared', async () => {
    const periodStart = Date.parse('2026-08-01T00:00:00.000Z') / 1000;
    const db = { query: mocks.query, execute: mocks.execute } as never;
    const stripe = {
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({ id: 'cs_3', total_details: null }),
        },
      },
      customers: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ id: 'cus_1', email: 'b@example.com', deleted: false }),
      },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_live_3',
          status: 'incomplete',
          customer: 'cus_1',
          items: {
            data: [
              {
                id: 'si_1',
                quantity: 1,
                current_period_start: periodStart,
                current_period_end: periodStart + 30 * 24 * 60 * 60,
                price: { id: 'price_pro_monthly' },
              },
            ],
          },
          cancel_at_period_end: false,
          canceled_at: null,
          discounts: [],
        }),
      },
    } as never;
    const session = {
      id: 'cs_3',
      customer: 'cus_1',
      subscription: 'sub_live_3',
      client_reference_id: 'user_1',
      metadata: { user_id: 'user_1', plan_tier: 'pro' },
      line_items: { data: [{ price: { id: 'price_pro_monthly' }, quantity: 1 }] },
    } as never;

    await upsertSubscriptionFromSession(db, stripe, session);

    const [upsert] = subscriptionUpsertCalls();
    expect(upsert?.[1]?.[1]).toBe('incomplete');
    expect(upsert?.[1]?.[2]).toBe('pro');
  });
});
