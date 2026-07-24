import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolvePlanTier: vi.fn(),
  retrieveSession: vi.fn(),
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
vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: (...args: unknown[]) => mocks.resolvePlanTier(...args),
  isValidPlanTier: (tier: unknown) => tier === 'pro' || tier === 'max_15x',
  isPriceIdRegistered: (priceId: unknown) =>
    priceId === 'price_pro_monthly' || priceId === 'price_max_15x_monthly',
  getTierMapping: () => ({
    price_pro_monthly: { tier: 'pro', interval: 'monthly' },
    price_max_15x_monthly: { tier: 'max_15x', interval: 'monthly' },
  }),
}));

import {
  updateSubscriptionFromStripeSubscription,
  upsertSubscriptionFromSession,
} from '@/app/api/stripe-webhook/lib/db';

describe('checkout subscription Price authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePlanTier.mockImplementation((_metadata, priceId) =>
      priceId === 'price_pro_monthly'
        ? 'pro'
        : priceId === 'price_max_15x_monthly'
          ? 'max_15x'
          : null,
    );
    mocks.retrieveSession.mockResolvedValue({
      id: 'cs_1',
      line_items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      total_details: null,
    });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('select id from profiles where id')) return [{ id: 'user_1' }];
      if (sql.includes('insert into subscriptions')) return [{ id: 'sub_db_1' }];
      return [];
    });
    mocks.execute.mockResolvedValue(1);
  });

  it('retrieves omitted line items before resolving or writing the entitlement tier', async () => {
    const db = { query: mocks.query, execute: mocks.execute } as never;
    const stripe = {
      checkout: { sessions: { retrieve: mocks.retrieveSession } },
      customers: { retrieve: vi.fn() },
      subscriptions: { retrieve: vi.fn() },
    } as never;
    const session = {
      id: 'cs_1',
      customer: null,
      subscription: null,
      client_reference_id: 'user_1',
      metadata: { user_id: 'user_1', plan_tier: 'max_15x' },
    } as never;

    await upsertSubscriptionFromSession(db, stripe, session);

    expect(mocks.retrieveSession).toHaveBeenCalledWith('cs_1', { expand: ['line_items'] });
    expect(mocks.resolvePlanTier).toHaveBeenCalledWith(
      expect.objectContaining({ plan_tier: 'max_15x' }),
      'price_pro_monthly',
    );
    const upsertCall = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into subscriptions'),
    );
    expect(upsertCall?.[1]?.[2]).toBe('pro');
  });

  it('fails the webhook for an unregistered subscription Price instead of preserving stale access silently', async () => {
    const db = { query: mocks.query, execute: mocks.execute } as never;
    const subscription = {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      pending_update: null,
      metadata: { plan_tier: 'max_15x' },
      items: { data: [{ price: { id: 'price_unknown' } }] },
    } as never;

    await expect(
      updateSubscriptionFromStripeSubscription(db, {} as never, subscription),
    ).rejects.toThrow(/unregistered Stripe Price/i);
    expect(mocks.query).not.toHaveBeenCalledWith(
      expect.stringContaining('update subscriptions'),
      expect.anything(),
    );
  });

  it('carries existing usage when full-price checkout replaces an unlinked entitlement', async () => {
    const periodStart = Date.parse('2026-07-23T09:00:00.000Z') / 1000;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('select id from profiles where id')) return [{ id: 'user_1' }];
      if (sql.includes('select id, plan_tier from subscriptions where user_id')) {
        return [{ id: 'sub_db_1', plan_tier: 'max' }];
      }
      if (sql.includes('insert into subscriptions')) return [{ id: 'sub_db_1' }];
      return [];
    });
    const db = { query: mocks.query, execute: mocks.execute } as never;
    const stripe = {
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: 'cs_upgrade',
            total_details: null,
          }),
        },
      },
      customers: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'cus_1',
          email: 'investor@example.com',
          deleted: false,
        }),
      },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_live_1',
          status: 'active',
          customer: 'cus_1',
          items: {
            data: [
              {
                id: 'si_1',
                current_period_start: periodStart,
                current_period_end: periodStart + 30 * 24 * 60 * 60,
                price: { id: 'price_max_15x_monthly' },
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
      id: 'cs_upgrade',
      customer: 'cus_1',
      subscription: 'sub_live_1',
      client_reference_id: 'user_1',
      metadata: {
        user_id: 'user_1',
        plan_tier: 'max_15x',
        upgrade_from: 'max',
        replace_unlinked_entitlement: 'true',
      },
      line_items: {
        data: [{ price: { id: 'price_max_15x_monthly' } }],
      },
    } as never;

    await upsertSubscriptionFromSession(db, stripe, session);

    expect(mocks.carryUpgradeCredits).toHaveBeenCalledWith(
      'user_1',
      'sub_db_1',
      'max',
      'max_15x',
      new Date(periodStart * 1000),
      new Date((periodStart + 30 * 24 * 60 * 60) * 1000),
      db,
    );
    expect(mocks.allocateCredits).not.toHaveBeenCalled();
  });
});
