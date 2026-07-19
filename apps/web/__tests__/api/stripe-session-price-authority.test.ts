import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolvePlanTier: vi.fn(),
  retrieveSession: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  allocateCredits: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { allocateCreditsForPeriod: mocks.allocateCredits },
}));
vi.mock('@/lib/services/credit-service', () => ({ CreditService: {} }));
vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: (...args: unknown[]) => mocks.resolvePlanTier(...args),
  isValidPlanTier: (tier: unknown) => tier === 'pro',
  isPriceIdRegistered: (priceId: unknown) => priceId === 'price_pro_monthly',
  getTierMapping: () => ({ price_pro_monthly: { tier: 'pro', interval: 'monthly' } }),
}));

import {
  updateSubscriptionFromStripeSubscription,
  upsertSubscriptionFromSession,
} from '@/app/api/stripe-webhook/lib/db';

describe('checkout subscription Price authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePlanTier.mockImplementation((_metadata, priceId) =>
      priceId === 'price_pro_monthly' ? 'pro' : null,
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
});
