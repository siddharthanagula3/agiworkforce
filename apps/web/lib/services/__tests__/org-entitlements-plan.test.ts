import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getSubscription, getNeonDb } = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  getNeonDb: vi.fn(),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { resolveOrganizationEntitlementPlan } from '../org-entitlements';

const ORG_A = '11111111-1111-4111-8111-111111111111';

function dbWith(rows: unknown[]) {
  const query = vi.fn(async (_sql: string, _params: unknown[] = []) => rows);
  const db = { query } as unknown as DatabaseAdapter;
  getNeonDb.mockReturnValue(db);
  return { db, query };
}

describe('resolveOrganizationEntitlementPlan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves through the organization Stripe anchor and checks live subscription status', async () => {
    const { query } = dbWith([{ user_id: 'owner-1', plan_tier: 'team', status: 'active' }]);
    getSubscription.mockResolvedValue({ plan_tier: 'team', status: 'active' });

    await expect(resolveOrganizationEntitlementPlan(ORG_A)).resolves.toBe('team');

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
    dbWith([{ user_id: 'owner-1', plan_tier: planTier, status }]);
    getSubscription.mockResolvedValue({ plan_tier: planTier, status });
    await expect(resolveOrganizationEntitlementPlan(ORG_A)).resolves.toBe(expected);
  });

  it('fails closed when the organization or its billing anchor cannot be resolved', async () => {
    dbWith([]);
    await expect(resolveOrganizationEntitlementPlan(ORG_A)).resolves.toBe('free');
  });
});

describe("entitlement never depends on the caller's row visibility", () => {
  /**
   * `public.subscriptions` has RLS forced, and entitlement resolves from the
   * OWNER's row. Passing a caller-scoped adapter therefore returned NULL for
   * every administrator who was not the owner, resolved to `free`, and refused
   * all ten organization routes on a workspace holding a valid Enterprise plan.
   *
   * The guard is structural: the function must take an organization id alone
   * and reach for the privileged connection itself. If someone reintroduces a
   * `db` parameter, a scoped adapter can be threaded in again and the bug
   * returns silently — a mocked adapter always "sees" the owner's row, so no
   * unit test would notice.
   */
  it('takes an organization id only, and reads on the privileged connection', async () => {
    const { db, query } = dbWith([
      { user_id: 'owner-1', plan_tier: 'enterprise', status: 'active' },
    ]);
    getSubscription.mockResolvedValue({ plan_tier: 'enterprise', status: 'active' });

    expect(
      resolveOrganizationEntitlementPlan.length,
      'signature must be (organizationId) only',
    ).toBe(1);

    await expect(resolveOrganizationEntitlementPlan(ORG_A)).resolves.toBe('enterprise');

    expect(getNeonDb, 'must resolve on the privileged connection').toHaveBeenCalled();
    expect(query.mock.calls.length).toBeGreaterThan(0);
    expect(getSubscription).toHaveBeenCalledWith(db, 'owner-1');
  });
});
