import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getSubscription, mockQuery, resolveOrganizationEntitlementPlan } = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  mockQuery: vi.fn(),
  resolveOrganizationEntitlementPlan: vi.fn(),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription },
}));
vi.mock('@/lib/services/org-entitlements', () => ({ resolveOrganizationEntitlementPlan }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  getTeamAdminAccess,
  requireTeamAdminAccess,
} from '@/app/api/settings/team/team-admin-access';

const db = { query: (...args: unknown[]) => mockQuery(...args) } as unknown as DatabaseAdapter;
const ORG_A = '11111111-1111-4111-8111-111111111111';

const NO_ORG_SCOPE = {
  maxMembers: null,
  seatsConsumed: null,
  seatsAvailable: null,
  seatSource: 'unknown',
};

describe('team administration billing capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    resolveOrganizationEntitlementPlan.mockResolvedValue('team');
  });

  it.each(['team', 'enterprise'])('admits an active %s subscription', async (planTier) => {
    getSubscription.mockResolvedValue({ plan_tier: planTier, status: 'active' });

    await expect(getTeamAdminAccess(db, 'user-1')).resolves.toEqual({
      plan: planTier,
      canManageTeam: true,
      ...NO_ORG_SCOPE,
    });
  });

  it('fails closed for a canceled Team subscription even when the stored tier is still team', async () => {
    getSubscription.mockResolvedValue({ plan_tier: 'team', status: 'canceled' });

    await expect(getTeamAdminAccess(db, 'user-1')).resolves.toEqual({
      plan: 'free',
      canManageTeam: false,
      ...NO_ORG_SCOPE,
    });
    await expect(requireTeamAdminAccess(db, 'user-1')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
      statusCode: 403,
    });
  });

  it('does not read seat state at all when no organization is in scope', async () => {
    getSubscription.mockResolvedValue({ plan_tier: 'team', status: 'trialing' });

    const access = await getTeamAdminAccess(db, 'user-1');

    expect(access.maxMembers).toBeNull();
    expect(access.seatSource).toBe('unknown');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('reports the organization real licensed seat state when one is named', async () => {
    resolveOrganizationEntitlementPlan.mockResolvedValue('team');
    mockQuery.mockResolvedValueOnce([
      {
        licensed_seats: 25,
        seats_consumed: 9,
        stripe_subscription_id: 'sub_live_1',
        owner_user_id: 'user-1',
      },
    ]);

    const access = await getTeamAdminAccess(db, 'user-1', ORG_A);

    expect(access).toEqual({
      plan: 'team',
      canManageTeam: true,
      maxMembers: 25,
      seatsConsumed: 9,
      seatsAvailable: 16,
      seatSource: 'billing',
    });
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([ORG_A]);
    expect(resolveOrganizationEntitlementPlan).toHaveBeenCalledWith(db, ORG_A);
    expect(getSubscription).not.toHaveBeenCalled();
  });

  it('marks the seat count unprovisioned when no subscription is linked to the org', async () => {
    resolveOrganizationEntitlementPlan.mockResolvedValue('team');
    mockQuery.mockResolvedValueOnce([
      {
        licensed_seats: 4,
        seats_consumed: 4,
        stripe_subscription_id: null,
        owner_user_id: 'user-1',
      },
    ]);

    const access = await getTeamAdminAccess(db, 'user-1', ORG_A);

    expect(access.maxMembers).toBe(4);
    expect(access.seatsAvailable).toBe(0);
    expect(access.seatSource).toBe('unprovisioned');
  });

  it('falls back to the no-org shape rather than inventing seats for an unreadable org', async () => {
    resolveOrganizationEntitlementPlan.mockResolvedValue('team');
    mockQuery.mockResolvedValueOnce([]);

    const access = await getTeamAdminAccess(db, 'user-1', ORG_A);

    expect(access.maxMembers).toBeNull();
    expect(access.seatSource).toBe('unknown');
  });

  it('refuses a non-member before the organization entitlement is even consulted', async () => {
    mockQuery.mockResolvedValueOnce([]);

    await expect(requireTeamAdminAccess(db, 'outsider', ORG_A)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([ORG_A, 'outsider']);
    expect(resolveOrganizationEntitlementPlan).not.toHaveBeenCalled();
  });

  it('still fails closed on the capability before any seat number is trusted', async () => {
    resolveOrganizationEntitlementPlan.mockResolvedValue('free');
    mockQuery.mockResolvedValueOnce([{ user_id: 'user-1' }]);
    mockQuery.mockResolvedValueOnce([
      {
        licensed_seats: 100,
        seats_consumed: 1,
        stripe_subscription_id: 'sub_live_1',
        owner_user_id: 'user-1',
      },
    ]);

    await expect(requireTeamAdminAccess(db, 'user-1', ORG_A)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
      statusCode: 403,
    });
    expect(getSubscription).not.toHaveBeenCalled();
  });

  it('uses the organization entitlement even when the caller personally has no Team plan', async () => {
    getSubscription.mockResolvedValue({ plan_tier: 'free', status: 'active' });
    resolveOrganizationEntitlementPlan.mockResolvedValue('enterprise');
    mockQuery.mockResolvedValueOnce([
      {
        licensed_seats: 12,
        seats_consumed: 4,
        stripe_subscription_id: 'sub_org_live',
        owner_user_id: 'owner-1',
      },
    ]);

    await expect(getTeamAdminAccess(db, 'admin-with-free-plan', ORG_A)).resolves.toMatchObject({
      plan: 'enterprise',
      canManageTeam: true,
      maxMembers: 12,
      seatsAvailable: 8,
    });
    expect(getSubscription).not.toHaveBeenCalled();
  });

  it('rejects a personally entitled admin when the organization entitlement is inactive', async () => {
    getSubscription.mockResolvedValue({ plan_tier: 'team', status: 'active' });
    resolveOrganizationEntitlementPlan.mockResolvedValue('free');
    mockQuery.mockResolvedValueOnce([{ user_id: 'user-1' }]);
    mockQuery.mockResolvedValueOnce([
      {
        licensed_seats: 12,
        seats_consumed: 4,
        stripe_subscription_id: null,
        owner_user_id: 'owner-1',
      },
    ]);

    await expect(
      requireTeamAdminAccess(db, 'personally-entitled-admin', ORG_A),
    ).rejects.toMatchObject({ statusCode: 403, code: 'SUBSCRIPTION_REQUIRED' });
    expect(getSubscription).not.toHaveBeenCalled();
  });
});
