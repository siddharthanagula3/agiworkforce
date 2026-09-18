import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  RESOURCE_DELETION_POLICIES,
  resourcePurgeStatement,
  type ResourceDeletionPolicy,
} from './deletion-policies';

export interface ResourcePurgeTableResult {
  readonly resource: string;
  readonly table: string;
  readonly purged: number;
  readonly skippedReason: string | null;
  readonly error: string | null;
}

export interface ResourcePurgeResult {
  readonly tables: readonly ResourcePurgeTableResult[];
  readonly purged: number;
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

/**
 * A row that addresses object storage, or cascades to one that does, is not
 * this sweep's to delete: the row is the only address of the bytes, so
 * dropping it here would leave them behind for ever. The job named beside the
 * column deletes the object first and the row after it.
 */
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

/**
 * Ends the recovery window. A table that fails is recorded and the sweep
 * continues: one unavailable table must not hold every other resource past
 * the window it was promised.
 */
export async function purgeSoftDeletedResources(db: DatabaseAdapter): Promise<ResourcePurgeResult> {
  const tables: ResourcePurgeTableResult[] = [];

  for (const policy of purgeOrder()) {
    const owner = objectStorageOwner(policy);
    if (owner !== null) {
      tables.push({
        resource: policy.resource,
        table: policy.table,
        purged: 0,
        skippedReason:
          owner.sweep === null
            ? `${owner.table} holds object storage and no sweep deletes those objects yet`
            : `${owner.table} holds object storage, purged by ${owner.sweep}`,
        error: null,
      });
      continue;
    }

    const statement = resourcePurgeStatement(policy);
    try {
      const rows = await db.query<PurgeKeyRow>(statement.sql, [...statement.params]);
      tables.push({
        resource: policy.resource,
        table: policy.table,
        purged: rows.length,
        skippedReason: null,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { event: 'resource_purge_failed', table: policy.table, error: message },
        'Soft-deleted rows past their recovery window could not be purged',
      );
      tables.push({
        resource: policy.resource,
        table: policy.table,
        purged: 0,
        skippedReason: null,
        error: message,
      });
    }
  }

  return {
    tables,
    purged: tables.reduce((total, entry) => total + entry.purged, 0),
    skipped: tables.filter((entry) => entry.skippedReason !== null).length,
    failed: tables.filter((entry) => entry.error !== null).length,
  };
}
