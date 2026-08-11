import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import {
  getOrganizationEntitlements,
  getSharedProjectLimitErrorMessage,
  isOrgResourceLimitError,
} from '@/lib/services/org-entitlements';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

/**
 * Org-scoped sharing of projects (migration 0086).
 *
 * TENANCY CONTRACT — the one thing that must never regress.
 *
 * `organizationId` in this module is ALWAYS derived from
 * `organization_members` for the authenticated subject
 * (`resolveOrgMembership` below). It is never read from a request body, a
 * query string, or a header. A caller therefore cannot name an organization
 * they do not belong to, and every statement below carries that server-derived
 * id as a bound parameter.
 *
 * The routes that call this module use `getUserScopedDb()`, so migration
 * 0086's policies are a real second fence: `organization_shared_projects` is
 * readable only via `app_org_resource_is_readable(organization_id)` and
 * writable only via `app_org_resource_is_manageable(organization_id)`, both of
 * which resolve membership inside the database. Removing the `organization_id`
 * predicate from any statement here would still fail closed at the DB — but the
 * predicate is written anyway, and pinned by
 * `app/api/settings/organization/shared/__tests__/route.cross-org-isolation.test.ts`,
 * because defence-in-depth is the point.
 */

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
  /** Explicit per-member overrides. Absent members inherit `defaultAccess`. */
  memberGrants: SharedProjectMemberGrant[];
}

/**
 * The caller's membership, resolved from the database.
 *
 * Uses the durable account workspace selection. The selected id is joined back
 * to the membership table before it is returned, so stale or forged settings
 * resolve to no organization rather than widening access.
 */
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

/** Fail closed: no membership, or a non-admin role, is a 403 — never a 404. */
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

// ─── Reads ──────────────────────────────────────────────────────────────────

interface SharedProjectRow {
  organization_id: string;
  project_id: string;
  shared_by_user_id: string;
  default_access: SharedProjectAccess;
  created_at: string;
  name: string;
  user_id: string;
}

/**
 * Everything the organization shares, with the per-member overrides that decide
 * who can actually see each one. Backs the org admin sharing view.
 */
export async function listSharedProjects(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<SharedProjectSummary[]> {
  const rows = await db.query<SharedProjectRow>(
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

/**
 * The project ids this member may open through the org, honouring an explicit
 * `access = 'none'` denial. Used by the project list/read paths, which run on
 * the privileged connection — so this predicate IS the tenant boundary there,
 * not merely a filter.
 */
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
  /** Project ids the caller may READ through the organization. */
  projectIds: string[];
}

/**
 * Resolve the shared-project scope for the project list/detail routes.
 *
 * Those routes run on the privileged `getNeonDb()` connection (BYPASSRLS), so
 * this pair — the server-derived `organizationId` and the id set it produces —
 * IS the tenant boundary there, not merely a filter. It is never assembled from
 * request input.
 *
 * Degrades to `null` when the sharing tables do not exist yet (a deployment
 * where 0086 has not been applied), so an un-migrated environment keeps exactly
 * today's personal behaviour instead of failing every project list.
 */
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

// ─── Writes ─────────────────────────────────────────────────────────────────

export interface ShareProjectInput {
  organizationId: string;
  projectId: string;
  actorUserId: string;
  defaultAccess: SharedProjectAccess;
}

/**
 * Share one of the actor's own projects with the organization.
 *
 * Two invariants, both enforced by the database rather than by a read-then-write
 * in this function:
 *
 *   1. Only a project the ACTOR OWNS can be shared. The insert selects the
 *      project by `(id, user_id)`, so an admin cannot conscript another
 *      member's personal project into the org's shared set. Zero rows inserted
 *      means "not yours" and surfaces as 404, never as a silent success.
 *   2. The org-wide ceiling. `assert_org_resource_limit` takes a
 *      transaction-scoped advisory lock keyed on the organization BEFORE
 *      counting, inside the same transaction as the insert, so two admins
 *      sharing the 25th and 26th project concurrently serialize and the second
 *      one's transaction rolls back. A count-then-insert in TypeScript cannot
 *      close that race.
 */
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
    // Either the project does not exist, is soft-deleted, or belongs to
    // somebody else. All three are the same answer to this caller.
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

/**
 * Stop sharing. The per-member grants cascade away with the share row, so no
 * stale grant can survive an un-share and silently re-arm if the project is
 * shared again later.
 */
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

/**
 * Grant, downgrade, or explicitly deny one member's access to a shared project.
 *
 * The insert is fenced by the composite FKs from 0086: it fails if the project
 * is not shared with this org, and it fails if the target user is not a member
 * of this org. Neither check is written here, because a check written here
 * could be forgotten by the next caller.
 */
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

/** Drop an override so the member falls back to the share's `default_access`. */
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
