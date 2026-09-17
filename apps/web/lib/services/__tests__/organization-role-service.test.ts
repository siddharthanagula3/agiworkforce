import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { BUILT_IN_ORGANIZATION_ROLES } from '@agiworkforce/types';
import {
  assertPermissionsWithinActor,
  createCustomRole,
  setDirectoryGroupRoles,
  setMemberRoles,
} from '../organization-role-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const OWNER_ROLE = '22222222-2222-4222-8222-222222222222';
const AUDITOR_ROLE = '33333333-3333-4333-8333-333333333333';
const GROUP = '44444444-4444-4444-8444-444444444444';

const ADMIN = new Set<string>(BUILT_IN_ORGANIZATION_ROLES.admin.permissions);

function db(answer: (sql: string, params: unknown[]) => unknown[]) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => answer(sql, params));
  const adapter = {
    query,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) =>
      fn(adapter as unknown as DatabaseAdapter),
  };
  return { adapter: adapter as unknown as DatabaseAdapter, query };
}

function roleRows(ids: unknown) {
  const all = [
    {
      id: OWNER_ROLE,
      organization_id: null,
      key: 'owner',
      name: 'Owner',
      description: null,
      permissions: [...BUILT_IN_ORGANIZATION_ROLES.owner.permissions],
    },
    {
      id: AUDITOR_ROLE,
      organization_id: ORG,
      key: 'custom_auditor',
      name: 'Auditor',
      description: null,
      permissions: ['content.read', 'audit.read'],
    },
  ];
  return all.filter((row) => (ids as string[]).includes(row.id));
}

describe('assertPermissionsWithinActor', () => {
  it('refuses a Primary Owner permission on any role, whoever asks', () => {
    expect(() =>
      assertPermissionsWithinActor(
        ['workspace.delete'],
        new Set(BUILT_IN_ORGANIZATION_ROLES.primary_owner.permissions),
      ),
    ).toThrowError(/Only the Primary Owner/);
  });

  it('refuses a permission the granter does not hold', () => {
    expect(() => assertPermissionsWithinActor(['owners.manage'], ADMIN)).toThrowError(
      /owners\.manage/,
    );
  });
});

describe('createCustomRole', () => {
  it('writes a sorted, deduplicated permission set under a key that cannot collide with a built-in', async () => {
    const { adapter, query } = db((sql, params) => {
      if (sql.includes('count(*)')) return [{ count: '3' }];
      return [
        {
          id: AUDITOR_ROLE,
          organization_id: ORG,
          key: params[1],
          name: params[2],
          description: params[3],
          permissions: params[4],
          member_count: 0,
          group_count: 0,
        },
      ];
    });

    const role = await createCustomRole(adapter, {
      organizationId: ORG,
      name: 'Owner',
      description: null,
      permissions: ['audit.read', 'content.read', 'audit.read'],
      actorUserId: 'admin-1',
      actorPermissions: ADMIN,
    });

    const insert = query.mock.calls.find(([sql]) => String(sql).includes('insert into'));
    expect(insert?.[1]).toEqual([
      ORG,
      'custom_owner',
      'Owner',
      null,
      ['audit.read', 'content.read'],
      'admin-1',
    ]);
    expect(role.builtIn).toBe(false);
  });
});

describe('setMemberRoles', () => {
  it('refuses when an admin tries to grant the built-in Owner role', async () => {
    const { adapter, query } = db((sql, params) => {
      if (sql.includes('from public.organization_members')) return [{ user_id: 'member-1' }];
      if (sql.includes('select role_id from public.organization_member_roles')) return [];
      if (sql.includes('from public.organization_roles')) return roleRows(params[0]);
      return [];
    });

    await expect(
      setMemberRoles(adapter, {
        organizationId: ORG,
        userId: 'member-1',
        roleIds: [OWNER_ROLE],
        actorUserId: 'admin-1',
        actorPermissions: ADMIN,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(false);
  });

  it('also refuses removing a role the granter could not have granted', async () => {
    const { adapter } = db((sql, params) => {
      if (sql.includes('from public.organization_members')) return [{ user_id: 'owner-2' }];
      if (sql.includes('select role_id from public.organization_member_roles')) {
        return [{ role_id: OWNER_ROLE }];
      }
      if (sql.includes('from public.organization_roles')) return roleRows(params[0]);
      return [];
    });

    await expect(
      setMemberRoles(adapter, {
        organizationId: ORG,
        userId: 'owner-2',
        roleIds: [],
        actorUserId: 'admin-1',
        actorPermissions: ADMIN,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('adds and removes only the difference', async () => {
    const { adapter, query } = db((sql, params) => {
      if (sql.includes('from public.organization_members')) return [{ user_id: 'viewer-1' }];
      if (sql.includes('select role_id from public.organization_member_roles')) return [];
      if (sql.includes('from public.organization_roles')) return roleRows(params[0]);
      return [];
    });

    const change = await setMemberRoles(adapter, {
      organizationId: ORG,
      userId: 'viewer-1',
      roleIds: [AUDITOR_ROLE],
      actorUserId: 'admin-1',
      actorPermissions: ADMIN,
    });

    expect(change).toEqual({ added: [AUDITOR_ROLE], removed: [] });
    const insert = query.mock.calls.find(([sql]) => String(sql).includes('insert into'));
    expect(insert?.[1]).toEqual([ORG, 'viewer-1', AUDITOR_ROLE, 'admin-1']);
  });

  it('refuses a role that belongs to another workspace', async () => {
    const { adapter } = db((sql) => {
      if (sql.includes('from public.organization_members')) return [{ user_id: 'viewer-1' }];
      if (sql.includes('from public.organization_roles')) return [];
      return [];
    });

    await expect(
      setMemberRoles(adapter, {
        organizationId: ORG,
        userId: 'viewer-1',
        roleIds: ['55555555-5555-4555-8555-555555555555'],
        actorUserId: 'admin-1',
        actorPermissions: ADMIN,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('setDirectoryGroupRoles', () => {
  it('lets a delegated manager grant only within their own permissions', async () => {
    const { adapter } = db((sql, params) => {
      if (sql.includes('from public.scim_groups')) return [{ id: GROUP }];
      if (sql.includes('select role_id from public.organization_group_roles')) return [];
      if (sql.includes('from public.organization_roles')) return roleRows(params[0]);
      return [];
    });

    await expect(
      setDirectoryGroupRoles(adapter, {
        organizationId: ORG,
        groupId: GROUP,
        roleIds: [AUDITOR_ROLE],
        actorUserId: 'manager-1',
        actorPermissions: new Set(['content.read', 'content.share']),
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
