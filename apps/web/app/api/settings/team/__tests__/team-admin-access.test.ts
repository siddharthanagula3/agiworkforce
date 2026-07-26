import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getSubscription } = vi.hoisted(() => ({
  getSubscription: vi.fn(),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription },
}));

import {
  getTeamAdminAccess,
  requireTeamAdminAccess,
} from '@/app/api/settings/team/team-admin-access';

const db = {} as never;

describe('team administration billing capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['team', 'enterprise'])('admits an active %s subscription', async (planTier) => {
    getSubscription.mockResolvedValue({
      plan_tier: planTier,
      status: 'active',
    });

    await expect(getTeamAdminAccess(db, 'user-1')).resolves.toEqual({
      plan: planTier,
      canManageTeam: true,
      maxMembers: null,
    });
  });

  it('fails closed for a canceled Team subscription even when the stored tier is still team', async () => {
    getSubscription.mockResolvedValue({
      plan_tier: 'team',
      status: 'canceled',
    });

    await expect(getTeamAdminAccess(db, 'user-1')).resolves.toEqual({
      plan: 'free',
      canManageTeam: false,
      maxMembers: null,
    });
    await expect(requireTeamAdminAccess(db, 'user-1')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
      statusCode: 403,
    });
  });

  it('does not invent a seat limit when no licensed-seat quantity is persisted', async () => {
    getSubscription.mockResolvedValue({
      plan_tier: 'team',
      status: 'trialing',
    });

    const access = await getTeamAdminAccess(db, 'user-1');
    expect(access.maxMembers).toBeNull();
  });
});
