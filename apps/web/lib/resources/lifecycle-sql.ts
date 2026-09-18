import {
  RESOURCE_LIFECYCLE_SEMANTICS,
  type ResourceLifecycleState,
  type ResourceVisibility,
} from '@agiworkforce/types';
import { resourceDeletionPolicy, type ResourceDeletionPolicy } from './deletion-policies';

export interface LifecycleScopeOptions {
  /** The caller asked for archived rows as well, e.g. `?includeArchived=true`. */
  includeArchived?: boolean;
  /** Prefix for the column, e.g. `c` for `c.deleted_at`. */
  alias?: string | null;
}

function column(alias: string | null | undefined, name: string): string {
  return alias ? `${alias}.${name}` : name;
}

function archivePredicate(
  policy: ResourceDeletionPolicy,
  alias: string | null | undefined,
): string {
  const archiveColumn = policy.archiveColumn;
  if (archiveColumn === null) throw new Error(`${policy.table} has no archive column`);
  return `${column(alias, archiveColumn)} = false`;
}

/**
 * The lifecycle predicates any read of `table` must carry. Soft-deleted rows
 * are never returned, whatever the caller asked for: the window is for
 * restoring the row, not for reading it as though it were live. Archived rows
 * are excluded unless the caller asked, because archive hides without
 * withdrawing.
 */
export function lifecycleScopeClauses(
  table: string,
  options: LifecycleScopeOptions = {},
): readonly string[] {
  const policy = resourceDeletionPolicy(table);
  if (policy === null) throw new Error(`No deletion policy registered for table ${table}`);

  const clauses = [`${column(options.alias, policy.softDeleteColumn)} is null`];
  if (policy.archiveColumn !== null && options.includeArchived !== true) {
    clauses.push(archivePredicate(policy, options.alias));
  }
  return clauses;
}

export function lifecycleScopeSql(table: string, options: LifecycleScopeOptions = {}): string {
  return lifecycleScopeClauses(table, options).join(' and ');
}

/**
 * The rows a purge is allowed to see: soft-deleted and still inside the
 * window. A restore route reads this, never the raw `deleted_at is not null`,
 * so restoring a row the purge has already released cannot appear to work.
 */
export function restorableScopeSql(table: string, alias?: string | null): string {
  const policy = resourceDeletionPolicy(table);
  if (policy === null) throw new Error(`No deletion policy registered for table ${table}`);
  const deletedAt = column(alias, policy.softDeleteColumn);
  return `${deletedAt} is not null and ${deletedAt} > now() - interval '${policy.recoveryWindowDays} days'`;
}

/**
 * Personal scope and workspace scope are one predicate: a null workspace
 * matches only rows with a null organization, which is what makes Personal a
 * scope rather than the absence of one.
 */
export function workspaceScopeSql(parameter: number, alias?: string | null): string {
  return `${column(alias, 'organization_id')} is not distinct from $${parameter}::uuid`;
}

/**
 * The visibility values a viewer may read without holding a grant row. A
 * signed-in member of the owning workspace reads both; anyone else reads only
 * what is public.
 */
export function readableVisibilities(viewer: {
  userId: string | null;
  organizationId: string | null;
}): readonly ResourceVisibility[] {
  if (viewer.userId === null) return ['public'];
  return viewer.organizationId === null ? ['public'] : ['public', 'organization'];
}

export function visibilityScopeSql(parameter: number, alias?: string | null): string {
  return `${column(alias, 'visibility')} = any($${parameter}::text[])`;
}

export function lifecycleStatesExcludedFromSearch(): readonly ResourceLifecycleState[] {
  return (Object.keys(RESOURCE_LIFECYCLE_SEMANTICS) as ResourceLifecycleState[]).filter(
    (state) => !RESOURCE_LIFECYCLE_SEMANTICS[state].searchable,
  );
}

export function lifecycleStatesExcludedFromAiRetrieval(): readonly ResourceLifecycleState[] {
  return (Object.keys(RESOURCE_LIFECYCLE_SEMANTICS) as ResourceLifecycleState[]).filter(
    (state) => !RESOURCE_LIFECYCLE_SEMANTICS[state].aiRetrievable,
  );
}
