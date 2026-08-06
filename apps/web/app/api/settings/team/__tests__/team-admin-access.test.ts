import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getSubscription, mockQuery } = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription },
}));

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

    // Reporting a seat number for "some organization" would be a fabrication.
    expect(access.maxMembers).toBeNull();
    expect(access.seatSource).toBe('unknown');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('reports the organization real licensed seat state when one is named', async () => {
    getSubscription.mockResolvedValue({ plan_tier: 'team', status: 'active' });
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
  });

  it('marks the seat count unprovisioned when no subscription is linked to the org', async () => {
    getSubscription.mockResolvedValue({ plan_tier: 'team', status: 'active' });
    mockQuery.mockResolvedValueOnce([
      {
        licensed_seats: 4,
        seats_consumed: 4,
        stripe_subscription_id: null,
        owner_user_id: 'user-1',
      },
    ]);

    const access = await getTeamAdminAccess(db, 'user-1', ORG_A);

    // The ceiling is real and enforced; the PROVENANCE is honest about the
    // fact that nothing has purchased these seats yet.
    expect(access.maxMembers).toBe(4);
    expect(access.seatsAvailable).toBe(0);
    expect(access.seatSource).toBe('unprovisioned');
  });

  it('falls back to the no-org shape rather than inventing seats for an unreadable org', async () => {
    getSubscription.mockResolvedValue({ plan_tier: 'team', status: 'active' });
    mockQuery.mockResolvedValueOnce([]);

    const access = await getTeamAdminAccess(db, 'user-1', ORG_A);

    expect(access.maxMembers).toBeNull();
    expect(access.seatSource).toBe('unknown');
  });

  it('still fails closed on the capability before any seat number is trusted', async () => {
    getSubscription.mockResolvedValue({ plan_tier: 'free', status: 'active' });
    mockQuery.mockResolvedValueOnce([
      {
        licensed_seats: 100,
        seats_consumed: 1,
        stripe_subscription_id: 'sub_live_1',
        owner_user_id: 'user-1',
      },
    ]);

    // A large licensed_seats must never imply the capability: the gate is
    // canUseBillingPlanCapability, never a tier comparison or a seat count.
    await expect(requireTeamAdminAccess(db, 'user-1', ORG_A)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
      statusCode: 403,
    });
  });
});
