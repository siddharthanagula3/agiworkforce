import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

import { deleteCustomRole, updateCustomRole } from '@/lib/services/organization-role-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const ROLE = '44444444-4444-4444-8444-444444444444';
const REPLACEMENT = '55555555-5555-4555-8555-555555555555';

interface RoleRecord {
  id: string;
  organization_id: string | null;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  version: number;
}

interface World {
  roles: RoleRecord[];
  memberRoles: Array<{ organization_id: string; user_id: string; role_id: string }>;
  groupRoles: Array<{ organization_id: string; group_id: string; role_id: string }>;
}

let world: World;

function norm(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim().toLowerCase();
}

function counts(roleId: string) {
  return {
    member_count: world.memberRoles.filter((row) => row.role_id === roleId).length,
    group_count: world.groupRoles.filter((row) => row.role_id === roleId).length,
  };
}

function makeDb(): DatabaseAdapter {
  const adapter = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const t = norm(sql);

      if (t.startsWith('select') && t.includes('where id = $1 and organization_id = $2')) {
        const role = world.roles.find(
          (row) => row.id === params[0] && row.organization_id === params[1],
        );
        return (role ? [{ ...role, ...counts(role.id) }] : []) as unknown as T[];
      }

      if (t.startsWith('select') && t.includes('where id = any($1::uuid[])')) {
        const wanted = new Set(params[0] as string[]);
        return world.roles
          .filter((row) => wanted.has(row.id) && row.organization_id === params[1])
          .map((row) => ({ ...row, member_count: 0, group_count: 0 })) as unknown as T[];
      }

      if (t.startsWith('update public.organization_roles')) {
        const role = world.roles.find(
          (row) => row.id === params[0] && row.organization_id === params[1],
        );
        if (!role || role.version !== params[5]) return [] as unknown as T[];
        role.name = params[2] as string;
        role.description = params[3] as string | null;
        role.permissions = params[4] as string[];
        role.version += 1;
        return [{ ...role, member_count: 0, group_count: 0 }] as unknown as T[];
      }

      if (t.startsWith('delete from public.organization_roles')) {
        world.roles = world.roles.filter((row) => row.id !== params[0]);
        return [] as unknown as T[];
      }

      return [] as unknown as T[];
    },

    async execute(sql: string, params: unknown[] = []): Promise<number> {
      const t = norm(sql);
      const [organizationId, fromRoleId, toRoleId] = params as [string, string, string];

      if (t.includes('insert into public.organization_member_roles')) {
        const moved = world.memberRoles.filter(
          (row) => row.organization_id === organizationId && row.role_id === fromRoleId,
        );
        for (const row of moved) {
          const held = world.memberRoles.some(
            (existing) => existing.user_id === row.user_id && existing.role_id === toRoleId,
          );
          if (!held) {
            world.memberRoles.push({ ...row, role_id: toRoleId });
          }
        }
        return moved.length;
      }

      if (t.includes('insert into public.organization_group_roles')) {
        const moved = world.groupRoles.filter(
          (row) => row.organization_id === organizationId && row.role_id === fromRoleId,
        );
        for (const row of moved) {
          world.groupRoles.push({ ...row, role_id: toRoleId });
        }
        return moved.length;
      }

      return 0;
    },

    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
      return fn(adapter as unknown as DatabaseAdapter);
    },
  };
  return adapter as unknown as DatabaseAdapter;
}

let db: DatabaseAdapter;
const actor = new Set(['admin.roles.manage', 'admin.audit.view', 'admin.audit.manage']);

beforeEach(() => {
  world = {
    roles: [
      {
        id: ROLE,
        organization_id: ORG,
        key: 'custom_auditor',
        name: 'Auditor',
        description: null,
        permissions: ['admin.audit.view'],
        version: 3,
      },
      {
        id: REPLACEMENT,
        organization_id: ORG,
        key: 'custom_reviewer',
        name: 'Reviewer',
        description: null,
        permissions: ['admin.audit.view'],
        version: 1,
      },
    ],
    memberRoles: [],
    groupRoles: [],
  };
  db = makeDb();
});

function draft(over: Partial<{ name: string; expectedVersion: number | null }> = {}) {
  return {
    roleId: ROLE,
    organizationId: ORG,
    name: over.name ?? 'Auditor',
    description: null,
    permissions: ['admin.audit.view'],
    actorUserId: 'user-1',
    actorPermissions: actor,
    expectedVersion: over.expectedVersion === undefined ? 3 : over.expectedVersion,
  };
}

describe('per-role optimistic concurrency', () => {
  it('accepts a write that carries the version it read and bumps it', async () => {
    const role = await updateCustomRole(db, draft({ name: 'Audit reader' }));

    expect(role.version).toBe(4);
    expect(world.roles[0]?.name).toBe('Audit reader');
  });

  it('refuses a second write built from the same read', async () => {
    await updateCustomRole(db, draft({ name: 'Audit reader' }));

    await expect(updateCustomRole(db, draft({ name: 'Auditors' }))).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(world.roles[0]?.name).toBe('Audit reader');
  });

  it('lets a caller that sends no version through, because it did not read one', async () => {
    const role = await updateCustomRole(db, draft({ expectedVersion: null }));

    expect(role.version).toBe(4);
  });

  it('refuses a delete built from a stale read', async () => {
    await expect(
      deleteCustomRole(db, {
        organizationId: ORG,
        roleId: ROLE,
        actorPermissions: actor,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(world.roles).toHaveLength(2);
  });
});

describe('deleting a role that people hold', () => {
  beforeEach(() => {
    world.memberRoles.push({ organization_id: ORG, user_id: 'user-9', role_id: ROLE });
    world.groupRoles.push({ organization_id: ORG, group_id: 'group-1', role_id: ROLE });
  });

  it('blocks the delete rather than silently stripping their access', async () => {
    await expect(
      deleteCustomRole(db, { organizationId: ORG, roleId: ROLE, actorPermissions: actor }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(world.roles).toHaveLength(2);
    expect(world.memberRoles).toHaveLength(1);
  });

  it('names who still holds it', async () => {
    await expect(
      deleteCustomRole(db, { organizationId: ORG, roleId: ROLE, actorPermissions: actor }),
    ).rejects.toThrow(/1 member\(s\) and 1 group\(s\)/u);
  });

  it('moves members and groups to the replacement when one is named', async () => {
    const result = await deleteCustomRole(db, {
      organizationId: ORG,
      roleId: ROLE,
      actorPermissions: actor,
      reassignToRoleId: REPLACEMENT,
    });

    expect(result).toEqual({ reassignedMembers: 1, reassignedGroups: 1 });
    expect(world.roles.map((role) => role.id)).toEqual([REPLACEMENT]);
    expect(world.memberRoles.some((row) => row.role_id === REPLACEMENT)).toBe(true);
    expect(world.groupRoles.some((row) => row.role_id === REPLACEMENT)).toBe(true);
  });

  it('refuses a replacement that is the role being deleted', async () => {
    await expect(
      deleteCustomRole(db, {
        organizationId: ORG,
        roleId: ROLE,
        actorPermissions: actor,
        reassignToRoleId: ROLE,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a replacement that is not a role of this workspace', async () => {
    await expect(
      deleteCustomRole(db, {
        organizationId: ORG,
        roleId: ROLE,
        actorPermissions: actor,
        reassignToRoleId: '66666666-6666-4666-8666-666666666666',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a replacement carrying more than the actor holds', async () => {
    world.roles[1]!.permissions = ['admin.policy.manage'];

    await expect(
      deleteCustomRole(db, {
        organizationId: ORG,
        roleId: ROLE,
        actorPermissions: actor,
        reassignToRoleId: REPLACEMENT,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('deleting a role nobody holds', () => {
  it('goes through without a replacement', async () => {
    const result = await deleteCustomRole(db, {
      organizationId: ORG,
      roleId: ROLE,
      actorPermissions: actor,
      expectedVersion: 3,
    });

    expect(result).toEqual({ reassignedMembers: 0, reassignedGroups: 0 });
    expect(world.roles.map((role) => role.id)).toEqual([REPLACEMENT]);
  });
});
