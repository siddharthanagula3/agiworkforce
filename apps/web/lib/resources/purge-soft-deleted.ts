import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { holdableResourceForTable } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import {
  countHeldRows,
  isLegalHoldResourceType,
  legalHoldExclusion,
} from '@/lib/services/legal-hold-gate';
import {
  RESOURCE_DELETION_POLICIES,
  resourcePurgeStatement,
  type ResourceDeletionPolicy,
} from './deletion-policies';

export interface ResourcePurgeTableResult {
  readonly resource: string;
  readonly table: string;
  readonly purged: number;
  /** Rows past their window that an active legal hold preserved. */
  readonly heldFromPurge: number;
  readonly skippedReason: string | null;
  readonly error: string | null;
}

export interface ResourcePurgeResult {
  readonly tables: readonly ResourcePurgeTableResult[];
  readonly purged: number;
  readonly heldFromPurge: number;
  readonly skipped: number;
  readonly failed: number;
}

interface PurgeKeyRow {
  purge_key: string;
}

/**
 * A cascading child is swept before its parent, so a bounded run never spends
 * its budget on rows the parent's own cascade is about to remove anyway.
 */
function purgeOrder(): readonly ResourceDeletionPolicy[] {
  const byTable = new Map(RESOURCE_DELETION_POLICIES.map((policy) => [policy.table, policy]));
  const ordered: ResourceDeletionPolicy[] = [];
  const seen = new Set<string>();

  const visit = (policy: ResourceDeletionPolicy, path: ReadonlySet<string>): void => {
    if (seen.has(policy.table) || path.has(policy.table)) return;
    const nextPath = new Set(path).add(policy.table);
    for (const child of policy.children) {
      if (child.disposition !== 'cascade_delete') continue;
      const childPolicy = byTable.get(child.table);
      if (childPolicy) visit(childPolicy, nextPath);
    }
    seen.add(policy.table);
    ordered.push(policy);
  };

  for (const policy of RESOURCE_DELETION_POLICIES) visit(policy, new Set());
  return ordered;
}

const BY_TABLE = new Map(RESOURCE_DELETION_POLICIES.map((policy) => [policy.table, policy]));

// A row addressing object storage is the only address of the bytes, so the job
// named beside the column deletes the object first and the row after.
function objectStorageOwner(
  policy: ResourceDeletionPolicy,
  seen: ReadonlySet<string> = new Set(),
): { table: string; sweep: string | null } | null {
  if (seen.has(policy.table)) return null;
  if (policy.externalObjects !== null) {
    return { table: policy.table, sweep: policy.externalObjects.sweep };
  }
  const next = new Set(seen).add(policy.table);
  for (const child of policy.children) {
    if (child.disposition !== 'cascade_delete') continue;
    const childPolicy = BY_TABLE.get(child.table);
    const owner = childPolicy ? objectStorageOwner(childPolicy, next) : null;
    if (owner !== null) return owner;
  }
  return null;
}

// Shared by the purge and by the count of what it left behind, so the two
// cannot disagree about which rows were due.
function dueWindow(policy: ResourceDeletionPolicy): { where: string; params: unknown[] } {
  return {
    where: `candidate.${policy.softDeleteColumn} is not null
        and candidate.${policy.softDeleteColumn} < now() - $1::interval`,
    params: [`${policy.recoveryWindowDays} days`],
  };
}

// One unavailable table must not hold every other resource past its window. A
// held row is deferred, not forgotten: the run after the release takes it.
export async function purgeSoftDeletedResources(db: DatabaseAdapter): Promise<ResourcePurgeResult> {
  const tables: ResourcePurgeTableResult[] = [];

  for (const policy of purgeOrder()) {
    const owner = objectStorageOwner(policy);
    if (owner !== null) {
      tables.push({
        resource: policy.resource,
        table: policy.table,
        purged: 0,
        heldFromPurge: 0,
        skippedReason:
          owner.sweep === null
            ? `${owner.table} holds object storage and no sweep deletes those objects yet`
            : `${owner.table} holds object storage, purged by ${owner.sweep}`,
        error: null,
      });
      continue;
    }

    const declared = holdableResourceForTable(policy.table)?.resourceType;
    const resourceType =
      declared !== undefined && isLegalHoldResourceType(declared) ? declared : null;
    const window = dueWindow(policy);
    try {
      // The hold is part of the DELETE, so a hold placed while this run is in
      // flight still wins; the count is only for the report.
      const heldFromPurge =
        resourceType === null
          ? 0
          : await countHeldRows(db, resourceType, {
              table: policy.table,
              alias: 'candidate',
              where: window.where,
              params: window.params,
            });

      const statement = resourcePurgeStatement(
        policy,
        resourceType === null
          ? null
          : legalHoldExclusion(resourceType, {
              alias: 'candidate',
              nextParamIndex: 3,
            }),
      );
      const rows = await db.query<PurgeKeyRow>(statement.sql, [...statement.params]);
      tables.push({
        resource: policy.resource,
        table: policy.table,
        purged: rows.length,
        heldFromPurge,
        skippedReason: null,
        error: null,
      });
    } catch (error) {
      // Nothing was destroyed: the hold predicate is inside the statement, so a
      // hold set that cannot be read fails the DELETE rather than widening it.
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { event: 'resource_purge_failed', table: policy.table, error: message },
        'Soft-deleted rows past their recovery window could not be purged',
      );
      tables.push({
        resource: policy.resource,
        table: policy.table,
        purged: 0,
        heldFromPurge: 0,
        skippedReason: null,
        error: message,
      });
    }
  }

  return {
    tables,
    purged: tables.reduce((total, entry) => total + entry.purged, 0),
    heldFromPurge: tables.reduce((total, entry) => total + entry.heldFromPurge, 0),
    skipped: tables.filter((entry) => entry.skippedReason !== null).length,
    failed: tables.filter((entry) => entry.error !== null).length,
  };
}
