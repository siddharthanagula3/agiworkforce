import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  BUILT_IN_ORGANIZATION_ROLES,
  isGrantableOrganizationPermission,
  missingOrganizationPermissions,
  type BuiltInOrganizationRoleKey,
  type OrganizationPermission,
} from '@agiworkforce/types';
import { createError } from '@/lib/errors';

export interface OrganizationRoleSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  builtIn: boolean;
  assignable: boolean;
  permissions: OrganizationPermission[];
  memberCount: number;
  groupCount: number;
}

interface RoleRow {
  id: string;
  organization_id: string | null;
  key: string;
  name: string;
  description: string | null;
  permissions: string[] | null;
  member_count: number | string | null;
  group_count: number | string | null;
}

const MAX_CUSTOM_ROLES = 50;

function toCount(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : (value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRole(row: RoleRow): OrganizationRoleSummary {
  const builtIn = row.organization_id === null;
  const builtInDefinition = builtIn
    ? BUILT_IN_ORGANIZATION_ROLES[row.key as BuiltInOrganizationRoleKey]
    : undefined;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    builtIn,
    assignable: builtIn ? Boolean(builtInDefinition?.assignable) : true,
    permissions: (row.permissions ?? []).filter(
      (permission): permission is OrganizationPermission =>
        builtIn || isGrantableOrganizationPermission(permission),
    ),
    memberCount: toCount(row.member_count),
    groupCount: toCount(row.group_count),
  };
}

export async function listOrganizationRoles(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<OrganizationRoleSummary[]> {
  const rows = await db.query<RoleRow>(
    `select r.id, r.organization_id, r.key, r.name, r.description, r.permissions,
            (select count(*) from public.organization_member_roles mr
              where mr.organization_id = $1 and mr.role_id = r.id) as member_count,
            (select count(*) from public.organization_group_roles gr
              where gr.organization_id = $1 and gr.role_id = r.id) as group_count
       from public.organization_roles r
      where r.organization_id is null or r.organization_id = $1
      order by r.organization_id nulls first, r.name asc`,
    [organizationId],
  );
  return rows.map(formatRole);
}

export function assertPermissionsWithinActor(
  requested: readonly string[],
  actorPermissions: ReadonlySet<string>,
): void {
  const ungrantable = requested.filter(
    (permission) => !isGrantableOrganizationPermission(permission),
  );
  if (ungrantable.length > 0) {
    throw createError
      .validation(
        `Only the Primary Owner can hold ${ungrantable.join(', ')}, so no role can carry it.`,
      )
      .asUserSafe();
  }
  const missing = missingOrganizationPermissions(actorPermissions, requested);
  if (missing.length > 0) {
    throw createError
      .forbidden(`You cannot grant permissions you do not hold yourself: ${missing.join(', ')}.`)
      .asUserSafe();
  }
}

function roleKeyFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `custom_${slug || 'role'}`;
}

export interface CustomRoleInput {
  organizationId: string;
  name: string;
  description: string | null;
  permissions: readonly string[];
  actorUserId: string;
  actorPermissions: ReadonlySet<string>;
}

export async function createCustomRole(
  db: DatabaseAdapter,
  input: CustomRoleInput,
): Promise<OrganizationRoleSummary> {
  const permissions = [...new Set(input.permissions)].sort();
  assertPermissionsWithinActor(permissions, input.actorPermissions);

  const [countRow] = await db.query<{ count: number | string }>(
    `select count(*) as count from public.organization_roles where organization_id = $1`,
    [input.organizationId],
  );
  if (toCount(countRow?.count) >= MAX_CUSTOM_ROLES) {
    throw createError
      .conflict(`A workspace can define at most ${MAX_CUSTOM_ROLES} custom roles.`)
      .asUserSafe();
  }

  try {
    const [row] = await db.query<RoleRow>(
      `insert into public.organization_roles
         (organization_id, key, name, description, permissions, created_by)
       values ($1, $2, $3, $4, $5::text[], $6)
       returning id, organization_id, key, name, description, permissions,
                 0 as member_count, 0 as group_count`,
      [
        input.organizationId,
        roleKeyFromName(input.name),
        input.name,
        input.description,
        permissions,
        input.actorUserId,
      ],
    );
    if (!row) throw new Error('organization_roles insert returned no row');
    return formatRole(row);
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '23505') {
      throw createError.conflict('A role with that name already exists.').asUserSafe();
    }
    throw error;
  }
}

async function readCustomRole(
  db: DatabaseAdapter,
  organizationId: string,
  roleId: string,
): Promise<RoleRow> {
  const [row] = await db.query<RoleRow>(
    `select id, organization_id, key, name, description, permissions,
            0 as member_count, 0 as group_count
       from public.organization_roles
      where id = $1 and organization_id = $2
      limit 1`,
    [roleId, organizationId],
  );
  if (!row) {
    throw createError.notFound('Custom role not found in this workspace.').asUserSafe();
  }
  return row;
}

export async function updateCustomRole(
  db: DatabaseAdapter,
  input: CustomRoleInput & { roleId: string },
): Promise<OrganizationRoleSummary> {
  const existing = await readCustomRole(db, input.organizationId, input.roleId);
  const permissions = [...new Set(input.permissions)].sort();
  assertPermissionsWithinActor(
    [...new Set([...(existing.permissions ?? []), ...permissions])],
    input.actorPermissions,
  );

  const [row] = await db.query<RoleRow>(
    `update public.organization_roles
        set name = $3, description = $4, permissions = $5::text[]
      where id = $1 and organization_id = $2
      returning id, organization_id, key, name, description, permissions,
                0 as member_count, 0 as group_count`,
    [input.roleId, input.organizationId, input.name, input.description, permissions],
  );
  if (!row) throw createError.notFound('Custom role not found in this workspace.').asUserSafe();
  return formatRole(row);
}

export async function deleteCustomRole(
  db: DatabaseAdapter,
  input: { organizationId: string; roleId: string; actorPermissions: ReadonlySet<string> },
): Promise<void> {
  const existing = await readCustomRole(db, input.organizationId, input.roleId);
  assertPermissionsWithinActor(existing.permissions ?? [], input.actorPermissions);
  await db.query(`delete from public.organization_roles where id = $1 and organization_id = $2`, [
    input.roleId,
    input.organizationId,
  ]);
}

async function readGrantableRoles(
  db: DatabaseAdapter,
  organizationId: string,
  roleIds: readonly string[],
): Promise<RoleRow[]> {
  if (roleIds.length === 0) return [];
  const rows = await db.query<RoleRow>(
    `select id, organization_id, key, name, description, permissions,
            0 as member_count, 0 as group_count
       from public.organization_roles
      where id = any($1::uuid[])
        and (organization_id = $2 or (organization_id is null and key <> 'primary_owner'))`,
    [roleIds, organizationId],
  );
  if (rows.length !== new Set(roleIds).size) {
    throw createError
      .validation('One of those roles does not exist in this workspace or cannot be granted.')
      .asUserSafe();
  }
  return rows;
}

function assertRoleChangesWithinActor(
  current: readonly string[],
  next: readonly string[],
  roles: ReadonlyMap<string, RoleRow>,
  actorPermissions: ReadonlySet<string>,
): { added: string[]; removed: string[] } {
  const added = next.filter((id) => !current.includes(id));
  const removed = current.filter((id) => !next.includes(id));
  const touched = [...added, ...removed].flatMap((id) => roles.get(id)?.permissions ?? []);
  const missing = missingOrganizationPermissions(actorPermissions, touched);
  if (missing.length > 0) {
    throw createError
      .forbidden(
        `You cannot grant or remove a role carrying permissions you do not hold: ${missing.join(', ')}.`,
      )
      .asUserSafe();
  }
  return { added, removed };
}

export async function listMemberRoleGrants(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<Record<string, string[]>> {
  const rows = await db.query<{ user_id: string; role_id: string }>(
    `select user_id, role_id
       from public.organization_member_roles
      where organization_id = $1
      order by user_id asc, role_id asc`,
    [organizationId],
  );
  const grants: Record<string, string[]> = {};
  for (const row of rows) {
    (grants[row.user_id] ??= []).push(row.role_id);
  }
  return grants;
}

export async function setMemberRoles(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    userId: string;
    roleIds: readonly string[];
    actorUserId: string;
    actorPermissions: ReadonlySet<string>;
  },
): Promise<{ added: string[]; removed: string[] }> {
  const nextIds = [...new Set(input.roleIds)];
  return db.transaction(async (tx) => {
    const [member] = await tx.query<{ user_id: string }>(
      `select user_id from public.organization_members
        where organization_id = $1 and user_id = $2
        for update`,
      [input.organizationId, input.userId],
    );
    if (!member) {
      throw createError.notFound('That person is not a member of this workspace.').asUserSafe();
    }
    const currentRows = await tx.query<{ role_id: string }>(
      `select role_id from public.organization_member_roles
        where organization_id = $1 and user_id = $2`,
      [input.organizationId, input.userId],
    );
    const currentIds = currentRows.map((row) => row.role_id);
    const roles = await readGrantableRoles(tx, input.organizationId, [
      ...new Set([...nextIds, ...currentIds]),
    ]);
    const change = assertRoleChangesWithinActor(
      currentIds,
      nextIds,
      new Map(roles.map((role) => [role.id, role])),
      input.actorPermissions,
    );
    if (change.removed.length > 0) {
      await tx.query(
        `delete from public.organization_member_roles
          where organization_id = $1 and user_id = $2 and role_id = any($3::uuid[])`,
        [input.organizationId, input.userId, change.removed],
      );
    }
    for (const roleId of change.added) {
      await tx.query(
        `insert into public.organization_member_roles
           (organization_id, user_id, role_id, granted_by_user_id)
         values ($1, $2, $3, $4)
         on conflict do nothing`,
        [input.organizationId, input.userId, roleId, input.actorUserId],
      );
    }
    return change;
  });
}

export interface DirectoryGroupRoleSummary {
  id: string;
  displayName: string;
  memberCount: number;
  roleIds: string[];
  managerUserIds: string[];
}

export async function listDirectoryGroupsWithRoles(
  db: DatabaseAdapter,
  organizationId: string,
  onlyManagedBy?: string,
): Promise<DirectoryGroupRoleSummary[]> {
  const rows = await db.query<{
    id: string;
    display_name: string;
    member_count: number | string;
    role_ids: string[] | null;
    manager_user_ids: string[] | null;
  }>(
    `select g.id, g.display_name,
            (select count(*) from public.scim_group_members m
              where m.group_id = g.id and m.organization_id = g.organization_id) as member_count,
            array(select gr.role_id::text from public.organization_group_roles gr
                   where gr.group_id = g.id and gr.organization_id = g.organization_id
                   order by gr.role_id) as role_ids,
            array(select gm.user_id from public.organization_group_managers gm
                   where gm.group_id = g.id and gm.organization_id = g.organization_id
                   order by gm.user_id) as manager_user_ids
       from public.scim_groups g
      where g.organization_id = $1
        and ($2::text is null or exists (
          select 1 from public.organization_group_managers gm
           where gm.group_id = g.id and gm.organization_id = g.organization_id
             and gm.user_id = $2
        ))
      order by lower(g.display_name) asc`,
    [organizationId, onlyManagedBy ?? null],
  );
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    memberCount: toCount(row.member_count),
    roleIds: row.role_ids ?? [],
    managerUserIds: row.manager_user_ids ?? [],
  }));
}

export async function isDirectoryGroupManager(
  db: DatabaseAdapter,
  organizationId: string,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db.query<{ user_id: string }>(
    `select gm.user_id
       from public.organization_group_managers gm
       join public.organization_members m
         on m.organization_id = gm.organization_id and m.user_id = gm.user_id
      where gm.organization_id = $1 and gm.group_id = $2 and gm.user_id = $3
      limit 1`,
    [organizationId, groupId, userId],
  );
  return rows.length > 0;
}

async function requireDirectoryGroup(
  db: DatabaseAdapter,
  organizationId: string,
  groupId: string,
): Promise<void> {
  const rows = await db.query<{ id: string }>(
    `select id from public.scim_groups where id = $1 and organization_id = $2 limit 1`,
    [groupId, organizationId],
  );
  if (rows.length === 0) {
    throw createError.notFound('Directory group not found in this workspace.').asUserSafe();
  }
}

export async function setDirectoryGroupRoles(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    groupId: string;
    roleIds: readonly string[];
    actorUserId: string;
    actorPermissions: ReadonlySet<string>;
  },
): Promise<{ added: string[]; removed: string[] }> {
  const nextIds = [...new Set(input.roleIds)];
  return db.transaction(async (tx) => {
    await requireDirectoryGroup(tx, input.organizationId, input.groupId);
    const currentRows = await tx.query<{ role_id: string }>(
      `select role_id from public.organization_group_roles
        where organization_id = $1 and group_id = $2`,
      [input.organizationId, input.groupId],
    );
    const currentIds = currentRows.map((row) => row.role_id);
    const roles = await readGrantableRoles(tx, input.organizationId, [
      ...new Set([...nextIds, ...currentIds]),
    ]);
    const change = assertRoleChangesWithinActor(
      currentIds,
      nextIds,
      new Map(roles.map((role) => [role.id, role])),
      input.actorPermissions,
    );
    if (change.removed.length > 0) {
      await tx.query(
        `delete from public.organization_group_roles
          where organization_id = $1 and group_id = $2 and role_id = any($3::uuid[])`,
        [input.organizationId, input.groupId, change.removed],
      );
    }
    for (const roleId of change.added) {
      await tx.query(
        `insert into public.organization_group_roles
           (organization_id, group_id, role_id, granted_by_user_id)
         values ($1, $2, $3, $4)
         on conflict do nothing`,
        [input.organizationId, input.groupId, roleId, input.actorUserId],
      );
    }
    return change;
  });
}

export async function setDirectoryGroupManagers(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    groupId: string;
    userIds: readonly string[];
    actorUserId: string;
  },
): Promise<string[]> {
  const nextIds = [...new Set(input.userIds)].sort();
  return db.transaction(async (tx) => {
    await requireDirectoryGroup(tx, input.organizationId, input.groupId);
    if (nextIds.length > 0) {
      const members = await tx.query<{ user_id: string }>(
        `select user_id from public.organization_members
          where organization_id = $1 and user_id = any($2::text[])`,
        [input.organizationId, nextIds],
      );
      if (members.length !== nextIds.length) {
        throw createError
          .validation('A group manager must be a member of this workspace.')
          .asUserSafe();
      }
    }
    await tx.query(
      `delete from public.organization_group_managers
        where organization_id = $1 and group_id = $2 and not (user_id = any($3::text[]))`,
      [input.organizationId, input.groupId, nextIds],
    );
    for (const userId of nextIds) {
      await tx.query(
        `insert into public.organization_group_managers
           (organization_id, group_id, user_id, granted_by_user_id)
         values ($1, $2, $3, $4)
         on conflict do nothing`,
        [input.organizationId, input.groupId, userId, input.actorUserId],
      );
    }
    return nextIds;
  });
}
