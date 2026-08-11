import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getSubscription } = vi.hoisted(() => ({ getSubscription: vi.fn() }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { resolveOrganizationEntitlementPlan } from '../org-entitlements';

const ORG_A = '11111111-1111-4111-8111-111111111111';

function dbWith(rows: unknown[]) {
  const query = vi.fn(async (_sql: string, _params: unknown[] = []) => rows);
  return { db: { query } as unknown as DatabaseAdapter, query };
}

describe('resolveOrganizationEntitlementPlan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves through the organization Stripe anchor and checks live subscription status', async () => {
    const { db, query } = dbWith([{ user_id: 'owner-1', plan_tier: 'team', status: 'active' }]);
    getSubscription.mockResolvedValue({ plan_tier: 'team', status: 'active' });

    await expect(resolveOrganizationEntitlementPlan(db, ORG_A)).resolves.toBe('team');

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toMatch(/o\.stripe_subscription_id is not null/i);
    expect(sql).toMatch(/s\.stripe_subscription_id = o\.stripe_subscription_id/i);
    expect(sql).toMatch(/s\.user_id = o\.owner_user_id/i);
    expect(sql).toMatch(/o\.stripe_subscription_id is null/i);
    expect(sql).toMatch(
      /not exists[\s\S]*claimed\.stripe_subscription_id = s\.stripe_subscription_id/i,
    );
    expect(sql).toMatch(
      /claimed_owner\.id <> o\.id[\s\S]*claimed_owner\.owner_user_id = o\.owner_user_id/i,
    );
    expect(sql).toMatch(/select s\.user_id, s\.plan_tier, s\.status/i);
    expect(sql).toMatch(/where o\.id = \$1/i);
    expect(sql).not.toMatch(/o\.billing_plan_tier/i);
    expect(query.mock.calls[0]?.[1]).toEqual([ORG_A]);
  });

  it.each([
    ['team', 'active', 'team'],
    ['team', 'trialing', 'team'],
    ['enterprise', 'active', 'enterprise'],
    ['enterprise', 'trialing', 'enterprise'],
    ['team', 'canceled', 'free'],
    ['team', 'incomplete_expired', 'free'],
    ['team', 'unpaid', 'free'],
    ['pro', 'active', 'pro'],
    ['unknown-tier', 'active', 'free'],
  ])('normalizes %s/%s to %s', async (planTier, status, expected) => {
    const { db } = dbWith([{ user_id: 'owner-1', plan_tier: planTier, status }]);
    getSubscription.mockResolvedValue({ plan_tier: planTier, status });
    await expect(resolveOrganizationEntitlementPlan(db, ORG_A)).resolves.toBe(expected);
  });

  it('fails closed when the organization or its billing anchor cannot be resolved', async () => {
    const { db } = dbWith([]);
    await expect(resolveOrganizationEntitlementPlan(db, ORG_A)).resolves.toBe('free');
  });
});
