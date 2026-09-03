import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  getOrganizationEntitlements,
  getSharedProjectLimitErrorMessage,
  isOrgResourceLimitError,
} from '@/lib/services/org-entitlements';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';
export type SharedProjectAccess = 'read' | 'write';
export type MemberProjectAccess = 'read' | 'write' | 'none';

const ADMIN_ROLES: readonly OrgRole[] = ['owner', 'admin'];

export interface OrgMembership {
  organizationId: string;
  role: OrgRole;
}

export interface SharedProjectMemberGrant {
  userId: string;
  access: MemberProjectAccess;
}

export interface SharedProjectSummary {
  projectId: string;
  organizationId: string;
  name: string;
  ownerUserId: string;
  sharedByUserId: string;
  defaultAccess: SharedProjectAccess;
  createdAt: string;
  memberGrants: SharedProjectMemberGrant[];
}

export async function resolveOrgMembership(
  db: DatabaseAdapter,
  userId: string,
): Promise<OrgMembership | null> {
  const organizationId = await resolveActiveOrganizationId(db, userId);
  if (!organizationId) return null;
  const [row] = await db.query<{ organization_id: string; role: OrgRole }>(
    `select organization_id, role
       from public.organization_members
      where organization_id = $1 and user_id = $2
      limit 1`,
    [organizationId, userId],
  );
  if (!row) return null;
  return { organizationId: row.organization_id, role: row.role };
}

export function isOrgAdminRole(role: OrgRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function requireOrgAdmin(membership: OrgMembership | null): OrgMembership {
  if (!membership || !isOrgAdminRole(membership.role)) {
    throw createError.forbidden('Only an organization owner or admin can change what is shared.');
  }
  return membership;
}

export function requireOrgMember(membership: OrgMembership | null): OrgMembership {
  if (!membership) {
    throw createError.forbidden('You are not a member of an organization.');
  }
  return membership;
}

interface SharedProjectRow {
  organization_id: string;
  project_id: string;
  shared_by_user_id: string;
  default_access: SharedProjectAccess;
  created_at: string;
  name: string;
  user_id: string;
}

export async function listSharedProjects(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<SharedProjectSummary[]> {
  const rows = await getNeonDb().query<SharedProjectRow>(
    `select s.organization_id,
            s.project_id,
            s.shared_by_user_id,
            s.default_access,
            s.created_at,
            p.name,
            p.user_id
       from public.organization_shared_projects s
       join public.user_projects p on p.id = s.project_id
      where s.organization_id = $1
        and p.deleted_at is null
      order by s.created_at desc`,
    [organizationId],
  );
  if (rows.length === 0) return [];

  const grants = await db.query<{
    project_id: string;
    user_id: string;
    access: MemberProjectAccess;
  }>(
    `select project_id, user_id, access
       from public.organization_project_access
      where organization_id = $1
      order by user_id asc`,
    [organizationId],
  );

  const grantsByProject = new Map<string, SharedProjectMemberGrant[]>();
  for (const grant of grants) {
    const list = grantsByProject.get(grant.project_id) ?? [];
    list.push({ userId: grant.user_id, access: grant.access });
    grantsByProject.set(grant.project_id, list);
  }

  return rows.map((row) => ({
    projectId: row.project_id,
    organizationId: row.organization_id,
    name: row.name,
    ownerUserId: row.user_id,
    sharedByUserId: row.shared_by_user_id,
    defaultAccess: row.default_access,
    createdAt: row.created_at,
    memberGrants: grantsByProject.get(row.project_id) ?? [],
  }));
}

export async function listReadableSharedProjectIds(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db.query<{ project_id: string }>(
    `select s.project_id
       from public.organization_shared_projects s
      where s.organization_id = $1
        and not exists (
          select 1
            from public.organization_project_access a
           where a.organization_id = s.organization_id
             and a.project_id = s.project_id
             and a.user_id = $2
             and a.access = 'none'
        )`,
    [organizationId, userId],
  );
  return rows.map((row) => row.project_id);
}

const PG_UNDEFINED_TABLE = '42P01';

function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record['code'] === PG_UNDEFINED_TABLE ||
    String(record['message'] ?? '').includes('does not exist')
  );
}

export interface SharedProjectScope {
  organizationId: string;
  projectIds: string[];
}

export async function resolveSharedProjectScope(
  db: DatabaseAdapter,
  userId: string,
): Promise<SharedProjectScope | null> {
  try {
    const membership = await resolveOrgMembership(db, userId);
    if (!membership) return null;
    const projectIds = await listReadableSharedProjectIds(db, membership.organizationId, userId);
    if (projectIds.length === 0) return null;
    return { organizationId: membership.organizationId, projectIds };
  } catch (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
}

export interface ShareProjectInput {
  organizationId: string;
  projectId: string;
  actorUserId: string;
  defaultAccess: SharedProjectAccess;
}

export async function shareProject(
  db: DatabaseAdapter,
  input: ShareProjectInput,
): Promise<SharedProjectSummary> {
  const entitlements = await getOrganizationEntitlements(input.organizationId);
  if (entitlements.sharedProjectLimit === 0) {
    throw createError.validation(getSharedProjectLimitErrorMessage(0));
  }

  let inserted: SharedProjectRow | undefined;
  try {
    [inserted] = await db.query<SharedProjectRow>(
      `with owned as materialized (
         select id, name, user_id
           from public.user_projects
          where id = $2
            and user_id = $3
            and deleted_at is null
       ), grant_row as materialized (
         insert into public.organization_shared_projects
           (organization_id, project_id, shared_by_user_id, default_access)
         select $1, owned.id, $3, $4 from owned
         on conflict (organization_id, project_id) do update
            set default_access = excluded.default_access,
                shared_by_user_id = excluded.shared_by_user_id
         returning organization_id, project_id, shared_by_user_id, default_access, created_at
       ), quota_guard as materialized (
         select public.assert_org_resource_limit('org_shared_projects', $1, $5)
           from (select count(*) from grant_row) as dependency
       )
       select grant_row.organization_id,
              grant_row.project_id,
              grant_row.shared_by_user_id,
              grant_row.default_access,
              grant_row.created_at,
              owned.name,
              owned.user_id
         from grant_row
         join owned on owned.id = grant_row.project_id
        cross join quota_guard`,
      [
        input.organizationId,
        input.projectId,
        input.actorUserId,
        input.defaultAccess,
        entitlements.sharedProjectLimit,
      ],
    );
  } catch (error) {
    if (isOrgResourceLimitError(error)) {
      throw createError.conflict(
        getSharedProjectLimitErrorMessage(entitlements.sharedProjectLimit),
      );
    }
    throw error;
  }

  if (!inserted) {
    throw createError.notFound('Project not found');
  }

  return {
    projectId: inserted.project_id,
    organizationId: inserted.organization_id,
    name: inserted.name,
    ownerUserId: inserted.user_id,
    sharedByUserId: inserted.shared_by_user_id,
    defaultAccess: inserted.default_access,
    createdAt: inserted.created_at,
    memberGrants: [],
  };
}

export async function unshareProject(
  db: DatabaseAdapter,
  organizationId: string,
  projectId: string,
): Promise<boolean> {
  const rows = await db.query<{ project_id: string }>(
    `delete from public.organization_shared_projects
      where organization_id = $1
        and project_id = $2
      returning project_id`,
    [organizationId, projectId],
  );
  return rows.length > 0;
}

export interface SetMemberAccessInput {
  organizationId: string;
  projectId: string;
  targetUserId: string;
  access: MemberProjectAccess;
  grantedByUserId: string;
}

export async function setProjectMemberAccess(
  db: DatabaseAdapter,
  input: SetMemberAccessInput,
): Promise<SharedProjectMemberGrant> {
  const [row] = await db.query<{ user_id: string; access: MemberProjectAccess }>(
    `insert into public.organization_project_access
       (organization_id, project_id, user_id, access, granted_by_user_id)
     values ($1, $2, $3, $4, $5)
     on conflict (organization_id, project_id, user_id) do update
        set access = excluded.access,
            granted_by_user_id = excluded.granted_by_user_id
     returning user_id, access`,
    [
      input.organizationId,
      input.projectId,
      input.targetUserId,
      input.access,
      input.grantedByUserId,
    ],
  );
  if (!row) {
    throw createError.notFound('Shared project or member not found');
  }
  return { userId: row.user_id, access: row.access };
}

export async function clearProjectMemberAccess(
  db: DatabaseAdapter,
  organizationId: string,
  projectId: string,
  targetUserId: string,
): Promise<boolean> {
  const rows = await db.query<{ user_id: string }>(
    `delete from public.organization_project_access
      where organization_id = $1
        and project_id = $2
        and user_id = $3
      returning user_id`,
    [organizationId, projectId, targetUserId],
  );
  return rows.length > 0;
}
