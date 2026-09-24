import 'server-only';

import {
  MEMBERSHIP_STATUSES,
  membershipGrantsAccess,
  type MembershipStatus,
} from '@agiworkforce/types';

import { WORKSPACE_SWITCH_SURFACES } from './switch-surfaces';

export {
  WORKSPACE_SWITCH_SURFACES,
  workspaceSwitchSurface,
  workspaceSwitchTables,
  type WorkspaceSwitchEffect,
  type WorkspaceSwitchSurface,
} from './switch-surfaces';

/**
 * The content tables 0110 made mutually exclusive between Personal (NULL) and
 * each organization. A privileged connection bypasses those policies, so a
 * statement over one of these must carry the workspace predicate itself.
 */
export const WORKSPACE_SCOPED_CONTENT_TABLES = [
  'web_conversations',
  'user_projects',
  'web_artifacts',
  'user_memories',
  'scheduled_tasks',
  'cloud_agent_runs',
  'user_connectors',
  'user_custom_connectors',
  'search_history',
] as const;

export type WorkspaceScopedContentTable = (typeof WORKSPACE_SCOPED_CONTENT_TABLES)[number];

export interface WorkspaceScope {
  userId: string;
  /** null is the personal workspace, never "any workspace". */
  organizationId: string | null;
}

export class WorkspaceScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceScopeError';
  }
}

export function assertWorkspaceScope(scope: WorkspaceScope): WorkspaceScope {
  if (typeof scope.userId !== 'string' || scope.userId.trim().length === 0) {
    throw new WorkspaceScopeError('A workspace-scoped read needs the caller account id');
  }
  if (scope.organizationId !== null && typeof scope.organizationId !== 'string') {
    throw new WorkspaceScopeError(
      'A workspace-scoped read needs an organization id or an explicit null for Personal',
    );
  }
  return scope;
}

export interface WorkspacePredicate {
  sql: string;
  params: [string, string | null];
  nextParamIndex: number;
}

function predicate(
  ownerColumn: string,
  organizationColumn: string,
  scope: WorkspaceScope,
  firstParamIndex: number,
): WorkspacePredicate {
  assertWorkspaceScope(scope);
  return {
    sql: `${ownerColumn} = $${firstParamIndex} and ${organizationColumn} is not distinct from $${firstParamIndex + 1}::uuid`,
    params: [scope.userId, scope.organizationId],
    nextParamIndex: firstParamIndex + 2,
  };
}

export interface WorkspacePredicateOptions {
  ownerColumn?: string;
  organizationColumn?: string;
  firstParamIndex?: number;
}

/**
 * Mirrors app_row_is_writable: the caller's own rows, in the active workspace
 * only. Personal rows are invisible from an organization and the reverse.
 */
export function workspaceOwnedPredicate(
  scope: WorkspaceScope,
  options: WorkspacePredicateOptions = {},
): WorkspacePredicate {
  return predicate(
    options.ownerColumn ?? 'user_id',
    options.organizationColumn ?? 'organization_id',
    scope,
    options.firstParamIndex ?? 1,
  );
}

/**
 * Mirrors app_row_is_visible for a workspace administrator: their own rows in
 * the active workspace, plus other members' rows in that same organization.
 * Personal rows are never included, so an admin cannot read personal content.
 */
export function workspaceAdminVisiblePredicate(
  scope: WorkspaceScope,
  options: WorkspacePredicateOptions = {},
): WorkspacePredicate {
  const ownerColumn = options.ownerColumn ?? 'user_id';
  const organizationColumn = options.organizationColumn ?? 'organization_id';
  const first = options.firstParamIndex ?? 1;
  assertWorkspaceScope(scope);

  if (scope.organizationId === null) {
    return workspaceOwnedPredicate(scope, options);
  }

  return {
    sql: `(${ownerColumn} = $${first} or ${organizationColumn} = $${first + 1}::uuid) and ${organizationColumn} is not distinct from $${first + 1}::uuid`,
    params: [scope.userId, scope.organizationId],
    nextParamIndex: first + 2,
  };
}

export function isWorkspaceScopedContentTable(table: string): table is WorkspaceScopedContentTable {
  return (WORKSPACE_SCOPED_CONTENT_TABLES as readonly string[]).includes(table);
}

/**
 * The switch surface a content table belongs to, so a caller that must treat a
 * table as the reader's own material reads that from the same place the switch
 * semantics are declared instead of deciding it again.
 */
export function workspaceSurfaceForTable(table: string): string | null {
  return WORKSPACE_SWITCH_SURFACES.find((entry) => entry.tables.includes(table))?.surface ?? null;
}

/**
 * The statuses that still carry access, taken from the membership vocabulary so
 * a status added there cannot keep a departed member's work running.
 */
export const MEMBERSHIP_STATUSES_THAT_MAY_ACT: readonly MembershipStatus[] =
  MEMBERSHIP_STATUSES.filter(membershipGrantsAccess);

/**
 * Standing work runs with nobody present, so the workspace its owner named when
 * they created it is re-asked on every claim rather than trusted.
 */
export function ownerIsActiveWorkspaceMemberSql(
  ownerColumn: string,
  organizationColumn: string,
  activeStatusesParam: number,
): string {
  for (const column of [ownerColumn, organizationColumn]) {
    if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(column)) {
      throw new WorkspaceScopeError(`${column} is not a column this predicate can name`);
    }
  }
  if (!Number.isInteger(activeStatusesParam) || activeStatusesParam < 1) {
    throw new WorkspaceScopeError('The membership statuses have to be bound as a parameter');
  }
  return `(${organizationColumn} is null or exists (
         select 1
           from public.organization_members member
          where member.organization_id = ${organizationColumn}
            and member.user_id = ${ownerColumn}
            and member.status = any($${activeStatusesParam}::text[])
       ))`;
}
