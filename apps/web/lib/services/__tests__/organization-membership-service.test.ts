import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { leaveOrganization } from '../organization-membership-service';

const ORG_A = '11111111-1111-4111-8111-111111111111';

function member(role: 'owner' | 'admin' | 'member' | 'viewer' = 'member') {
  return {
    organization_id: ORG_A,
    user_id: 'user-1',
    role,
    provisioning_source: 'invitation',
    provisioned_at: '2026-08-11T00:00:00.000Z',
    joined_at: '2026-08-11T00:00:00.000Z',
  };
}

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

  it('prevents the owner from orphaning the workspace', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('owner')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('owner')]);

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
        successorUserId: 'successor-user',
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
});
