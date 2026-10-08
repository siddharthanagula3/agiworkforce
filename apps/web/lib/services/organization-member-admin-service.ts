import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  BUILT_IN_ORGANIZATION_ROLES,
  expandOrganizationPermissions,
  type OrganizationPermission,
  type OrganizationRole,
} from '@agiworkforce/types';

import { createError } from '@/lib/errors';
import type { OrganizationMemberRow } from '@/lib/server/neon-types';
import { assertOwnerProtection } from '@/lib/services/organization-delegation';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import { withSeatAccountingErrors } from '@/lib/services/organization-seat-service';
import { assertMembershipRoleWithinActor } from '@/app/api/settings/team/membership-role-ceiling';

export type MemberAdministrator =
  | { kind: 'member'; userId: string }
  | { kind: 'service_principal'; actorId: string; scopes: ReadonlySet<OrganizationPermission> };

export type WorkspaceMembershipStatus = 'invited' | 'active' | 'suspended' | 'deprovisioned';

export interface WorkspaceMember {
  userId: string;
  email: string | null;
  name: string | null;
  role: OrganizationRole;
  status: WorkspaceMembershipStatus;
  joinedAt: string;
  provisioningSource: string | null;
}

export interface WorkspaceMemberPage {
  data: WorkspaceMember[];
  hasMore: boolean;
  firstId: string | null;
  lastId: string | null;
}

export interface Authority {
  actorId: string;
  role: OrganizationRole | null;
  permissions: ReadonlySet<OrganizationPermission>;
}

interface WorkspaceMemberRow {
  user_id: string;
  role: OrganizationRole;
  status: WorkspaceMembershipStatus;
  joined_at: string | Date;
  provisioning_source: string | null;
  email: string | null;
  display_name: string | null;
}

type MemberRow = OrganizationMemberRow & { status: WorkspaceMembershipStatus };

const MEMBER_COLUMNS =
  'organization_id, user_id, role, status, provisioning_source, provisioned_at, joined_at';

const ROLES_A_KEY_MANAGES: ReadonlySet<OrganizationRole> = new Set(['member', 'viewer']);

const MEMBER_ROLE_PERMISSIONS = expandOrganizationPermissions(
  BUILT_IN_ORGANIZATION_ROLES.member.permissions,
);

export function roleGrantsAdministration(role: OrganizationRole): boolean {
  return [...expandOrganizationPermissions(BUILT_IN_ORGANIZATION_ROLES[role].permissions)].some(
    (permission) => !MEMBER_ROLE_PERMISSIONS.has(permission),
  );
}

export function memberAdministrator(caller: {
  kind: 'member' | 'service_principal';
  actorUserId: string;
  permissions: ReadonlySet<OrganizationPermission>;
}): MemberAdministrator {
  return caller.kind === 'service_principal'
    ? { kind: 'service_principal', actorId: caller.actorUserId, scopes: caller.permissions }
    : { kind: 'member', userId: caller.actorUserId };
}

function toWorkspaceMember(row: WorkspaceMemberRow): WorkspaceMember {
  return {
    userId: row.user_id,
    email: row.email,
    name: row.display_name ?? row.email,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at instanceof Date ? row.joined_at.toISOString() : row.joined_at,
    provisioningSource: row.provisioning_source,
  };
}

export async function listWorkspaceMembers(
  db: DatabaseAdapter,
  organizationId: string,
  page: { limit: number; afterId: string | null; email: string | null },
): Promise<WorkspaceMemberPage> {
  const rows = await db.query<WorkspaceMemberRow>(
    `select om.user_id, om.role, om.status, om.joined_at, om.provisioning_source,
            p.email, p.display_name
       from public.organization_members om
       left join public.profiles p on p.id = om.user_id
      where om.organization_id = $1
        and om.status = 'active'
        and ($2::text is null or om.user_id > $2)
        and ($3::text is null or lower(p.email) = lower($3))
      order by om.user_id asc
      limit $4`,
    [organizationId, page.afterId, page.email, page.limit + 1],
  );
  const data = rows.slice(0, page.limit).map(toWorkspaceMember);
  return {
    data,
    hasMore: rows.length > page.limit,
    firstId: data[0]?.userId ?? null,
    lastId: data.at(-1)?.userId ?? null,
  };
}

export async function readWorkspaceMember(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
): Promise<WorkspaceMember | null> {
  const [row] = await db.query<WorkspaceMemberRow>(
    `select om.user_id, om.role, om.status, om.joined_at, om.provisioning_source,
            p.email, p.display_name
       from public.organization_members om
       left join public.profiles p on p.id = om.user_id
      where om.organization_id = $1 and om.user_id = $2
      limit 1`,
    [organizationId, userId],
  );
  return row ? toWorkspaceMember(row) : null;
}

export async function lockMembership(tx: DatabaseAdapter, organizationId: string): Promise<void> {
  await tx.query(
    `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
    [organizationId],
  );
}

async function readMemberRow(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
): Promise<MemberRow | null> {
  const [row] = await db.query<MemberRow>(
    `select ${MEMBER_COLUMNS}
       from public.organization_members
      where organization_id = $1 and user_id = $2
      limit 1`,
    [organizationId, userId],
  );
  return row ?? null;
}

export async function resolveAuthority(
  tx: DatabaseAdapter,
  organizationId: string,
  administrator: MemberAdministrator,
): Promise<Authority> {
  if (administrator.kind === 'service_principal') {
    return { actorId: administrator.actorId, role: null, permissions: administrator.scopes };
  }
  const requester = await readMemberRow(tx, organizationId, administrator.userId);
  if (!requester) {
    throw createError.forbidden('You are not a member of this organization');
  }
  const permissions = await requireMemberPermission(
    organizationId,
    administrator.userId,
    'members.manage',
    'Your workspace role does not allow managing team members.',
  );
  return { actorId: administrator.userId, role: requester.role, permissions };
}

export function assertKeyMayAssignRole(
  administrator: MemberAdministrator,
  role: OrganizationRole,
): void {
  if (administrator.kind === 'service_principal' && !ROLES_A_KEY_MANAGES.has(role)) {
    throw createError
      .forbidden(
        `A workspace API key can assign only the member and viewer roles. Assign the ${role} role in the workspace console.`,
      )
      .asUserSafe();
  }
}

async function assertKeyMayActOn(
  tx: DatabaseAdapter,
  administrator: MemberAdministrator,
  organizationId: string,
  target: MemberRow,
): Promise<void> {
  if (administrator.kind !== 'service_principal') return;
  if (target.status === 'active' && ROLES_A_KEY_MANAGES.has(target.role)) {
    const [row] = await tx.query<{ permissions: unknown }>(
      `select public.organization_member_permissions($1::uuid, $2) as permissions`,
      [organizationId, target.user_id],
    );
    const held: unknown[] = Array.isArray(row?.permissions) ? row.permissions : [];
    if (
      held.every(
        (permission) => typeof permission === 'string' && MEMBER_ROLE_PERMISSIONS.has(permission),
      )
    ) {
      return;
    }
  }
  throw createError
    .forbidden(
      'A workspace API key can change or remove only active members and viewers whose roles grant no admin permissions. Do this in the workspace console.',
    )
    .asUserSafe();
}

async function assertOwnerInvariant(
  tx: DatabaseAdapter,
  organizationId: string,
  actorRole: OrganizationRole | null,
  target: Pick<OrganizationMemberRow, 'role'>,
  nextRole: OrganizationRole | null,
): Promise<void> {
  if (target.role !== 'owner' || nextRole === 'owner') {
    return;
  }

  const [countRow] = await tx.query<{ owner_count: string }>(
    `select count(*)::text as owner_count
     from public.organization_members
     where organization_id = $1 and role = 'owner'`,
    [organizationId],
  );

  assertOwnerProtection({
    actorRole,
    targetRole: target.role,
    ownerCount: Number.parseInt(countRow?.owner_count ?? '0', 10),
    action: nextRole === null ? 'remove' : 'demote',
  });
}

export async function changeMemberRole(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    administrator: MemberAdministrator;
    targetUserId: string;
    role: OrganizationRole;
    request?: Request;
  },
): Promise<OrganizationRole> {
  return withSeatAccountingErrors(() =>
    db.transaction(async (tx) => {
      await lockMembership(tx, input.organizationId);
      const authority = await resolveAuthority(tx, input.organizationId, input.administrator);

      if (input.role === 'owner') {
        throw createError.conflict(
          'An organization has exactly one owner. Use POST /api/settings/organization/transfer-ownership to move ownership.',
        );
      }
      assertKeyMayAssignRole(input.administrator, input.role);

      await assertMembershipRoleWithinActor({
        organizationId: input.organizationId,
        actorUserId: authority.actorId,
        subject: input.targetUserId,
        actorPermissions: authority.permissions,
        role: input.role,
        request: input.request,
      });

      const target = await readMemberRow(tx, input.organizationId, input.targetUserId);
      if (!target) {
        throw createError.notFound('Member not found in this organization');
      }
      await assertKeyMayActOn(tx, input.administrator, input.organizationId, target);

      await assertOwnerInvariant(tx, input.organizationId, authority.role, target, input.role);

      await tx.execute(
        `update public.organization_members
       set role = $1
       where organization_id = $2 and user_id = $3`,
        [input.role, input.organizationId, input.targetUserId],
      );

      return target.role;
    }),
  );
}

export async function removeMember(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    administrator: MemberAdministrator;
    targetUserId: string;
  },
): Promise<OrganizationRole> {
  return withSeatAccountingErrors(() =>
    db.transaction(async (tx) => {
      await lockMembership(tx, input.organizationId);
      const authority = await resolveAuthority(tx, input.organizationId, input.administrator);

      if (input.targetUserId === authority.actorId) {
        throw createError.validation(
          'You cannot remove yourself. Use the leave organization flow.',
        );
      }

      const target = await readMemberRow(tx, input.organizationId, input.targetUserId);
      if (!target) {
        throw createError.notFound('Member not found in this organization');
      }
      await assertKeyMayActOn(tx, input.administrator, input.organizationId, target);

      await assertOwnerInvariant(tx, input.organizationId, authority.role, target, null);

      await tx.execute(
        `delete from public.organization_members
       where organization_id = $1 and user_id = $2`,
        [input.organizationId, input.targetUserId],
      );

      return target.role;
    }),
  );
}
