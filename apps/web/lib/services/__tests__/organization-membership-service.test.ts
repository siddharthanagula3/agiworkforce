import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { resolveUserPersonalPlanTier } = vi.hoisted(() => ({
  resolveUserPersonalPlanTier: vi.fn(),
}));
vi.mock('@/lib/services/org-entitlements', () => ({
  resolveUserPersonalPlanTier,
  resolveOrganizationEntitlementPlan: vi.fn(),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { leaveOrganization } from '../organization-membership-service';

const ORG_A = '11111111-1111-4111-8111-111111111111';

function member(role: 'owner' | 'admin' | 'member' | 'viewer' = 'member') {
  return {
    organization_id: ORG_A,
    user_id: 'user-1',
    role,
    provisioning_source: 'invitation',
    status: 'active',
    provisioned_at: '2026-08-11T00:00:00.000Z',
    joined_at: '2026-08-11T00:00:00.000Z',
  };
}

const BILLED_ACCESS = { plan: 'team', seatSource: 'billing' } as const;
const UNBILLED_ACCESS = { plan: 'team', seatSource: 'unprovisioned' } as const;

function harness() {
  const query = vi.fn();
  const execute = vi.fn();
  const tx = { query, execute };
  const db = {
    query,
    execute,
    transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as DatabaseAdapter;
  return { db, query, execute };
}

describe('leaveOrganization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes only the authenticated membership and frees its seat through the delete', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member()])
      .mockResolvedValueOnce([{ organization_id: ORG_A, role: 'member' }]);

    await expect(
      leaveOrganization(h.db, { userId: 'user-1', organizationId: ORG_A }),
    ).resolves.toEqual({
      organizationId: ORG_A,
      previousRole: 'member',
      successorUserId: null,
      successorPreviousRole: null,
    });

    const deletion = h.query.mock.calls.find(([sql]) =>
      String(sql).includes('delete from public.organization_members'),
    );
    expect(deletion?.[1]).toEqual([ORG_A, 'user-1']);
    expect(String(deletion?.[0])).toMatch(/organization_id = \$1 and user_id = \$2/i);
    expect(h.execute).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.user_settings'),
      ['user-1', 'personal'],
    );
  });

  it('leaves only the server-resolved active organization membership', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('viewer')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('viewer')])
      .mockResolvedValueOnce([{ organization_id: ORG_A, role: 'viewer' }]);

    await leaveOrganization(h.db, { userId: 'user-1', organizationId: ORG_A });

    expect(h.query.mock.calls[1]?.[1]).toEqual([ORG_A, 'user-1']);
    expect(h.query.mock.calls.at(-1)?.[1]).toEqual([ORG_A, 'user-1']);
  });

  it('points a sole owner at the workspace decommission flow instead of leaving', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('owner')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('owner')])
      .mockResolvedValueOnce([{ count: '1' }]);

    await expect(
      leaveOrganization(h.db, { userId: 'user-1', organizationId: ORG_A }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/sole member.*delete the workspace/i),
    });
    expect(
      h.query.mock.calls.some(([sql]) =>
        String(sql).includes('delete from public.organization_members'),
      ),
    ).toBe(false);
  });

  it('asks an owner with other members to choose a successor', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('owner')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('owner')])
      .mockResolvedValueOnce([{ count: '3' }]);

    await expect(
      leaveOrganization(h.db, { userId: 'user-1', organizationId: ORG_A }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/choose another member/i),
    });
    expect(
      h.query.mock.calls.some(([sql]) =>
        String(sql).includes('delete from public.organization_members'),
      ),
    ).toBe(false);
  });

  it('transfers ownership and removes the departing owner in one transaction', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('owner')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('owner')])
      .mockResolvedValueOnce([{ ...member('admin'), user_id: 'successor-user' }])
      .mockResolvedValueOnce([{ organization_id: ORG_A, role: 'admin' }]);

    await expect(
      leaveOrganization(h.db, {
        userId: 'user-1',
        organizationId: ORG_A,
        successor: { userId: 'successor-user', organizationAccess: BILLED_ACCESS },
      }),
    ).resolves.toEqual({
      organizationId: ORG_A,
      previousRole: 'owner',
      successorUserId: 'successor-user',
      successorPreviousRole: 'admin',
    });

    expect(h.execute.mock.calls).toHaveLength(3);
    expect(String(h.execute.mock.calls[0]?.[0])).toContain("set role = 'admin'");
    expect(h.execute.mock.calls[0]?.[1]).toEqual([ORG_A, 'user-1']);
    expect(String(h.execute.mock.calls[1]?.[0])).toContain("set role = 'owner'");
    expect(h.execute.mock.calls[1]?.[1]).toEqual([ORG_A, 'successor-user']);
    expect(String(h.execute.mock.calls[2]?.[0])).toContain('insert into public.user_settings');
    expect(h.execute.mock.calls[2]?.[1]).toEqual(['user-1', 'personal']);
  });

  function queueOwnerLeaving(successorRows: unknown[]) {
    const h = harness();
    h.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('owner')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('owner')])
      .mockResolvedValueOnce(successorRows)
      .mockResolvedValueOnce([{ organization_id: ORG_A, role: 'admin' }]);
    return h;
  }

  function expectNoOwnershipChange(h: ReturnType<typeof harness>) {
    expect(h.execute).not.toHaveBeenCalled();
    expect(
      h.query.mock.calls.some(([sql]) =>
        String(sql).includes('delete from public.organization_members'),
      ),
    ).toBe(false);
  }

  it('only hands ownership to a successor whose membership is active', async () => {
    const h = queueOwnerLeaving([]);

    await expect(
      leaveOrganization(h.db, {
        userId: 'user-1',
        organizationId: ORG_A,
        successor: { userId: 'invited-user', organizationAccess: BILLED_ACCESS },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    const successorRead = h.query.mock.calls[4];
    expect(String(successorRead?.[0])).toMatch(/status = 'active'/);
    expect(successorRead?.[1]).toEqual([ORG_A, 'invited-user']);
    expectNoOwnershipChange(h);
  });

  it('refuses a successor without the plan an unbilled organization needs, as transfer-ownership does', async () => {
    resolveUserPersonalPlanTier.mockResolvedValue('free');
    const h = queueOwnerLeaving([{ ...member('member'), user_id: 'successor-user' }]);

    await expect(
      leaveOrganization(h.db, {
        userId: 'user-1',
        organizationId: ORG_A,
        successor: { userId: 'successor-user', organizationAccess: UNBILLED_ACCESS },
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'ORG_TRANSFER_ENTITLEMENT_REQUIRED' });

    expect(resolveUserPersonalPlanTier).toHaveBeenCalledWith(expect.anything(), 'successor-user');
    expectNoOwnershipChange(h);
  });

  it('refuses a suspended owner naming a successor', async () => {
    const h = harness();
    const suspendedOwner = { ...member('owner'), status: 'suspended' };
    h.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([suspendedOwner])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([suspendedOwner]);

    await expect(
      leaveOrganization(h.db, {
        userId: 'user-1',
        organizationId: ORG_A,
        successor: { userId: 'successor-user', organizationAccess: BILLED_ACCESS },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(h.query).toHaveBeenCalledTimes(4);
    expectNoOwnershipChange(h);
  });
});
