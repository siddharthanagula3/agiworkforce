import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  RETENTION_DOMAINS,
  isRetentionDomain,
  type DomainRetentionPolicy,
  type RetentionDomain,
} from '@agiworkforce/types';
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import { deleteProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';
import {
  holdCovers,
  listLegalHolds,
  type LegalHold,
  type LegalHoldResourceType,
  type RetentionSweepOutcome,
} from './retention-service';

// A hold names resource types; a domain with no such type stays held by every hold.
const DOMAIN_HOLD_RESOURCE: Partial<Record<RetentionDomain, LegalHoldResourceType>> = {
  projects: 'project',
  work: 'work_run',
  files: 'file',
  artifacts: 'artifact',
  research: 'conversation',
};

function holdAppliesTo(hold: LegalHold, domain: RetentionDomain): boolean {
  const resource = DOMAIN_HOLD_RESOURCE[domain];
  return resource === undefined || holdCovers(hold, resource);
}

export const DOMAIN_RETENTION_BATCH = 200;
export const DOMAIN_RETENTION_MAX_BATCHES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DomainSweepContext {
  organizationId: string;
  cutoff: string;
  heldUserIds: readonly string[];
  limit: number;
}

export interface DomainBatchResult {
  recordsDeleted: number;
  objectsDeleted: number;
  objectsFailed: number;
  candidates: number;
}

export interface DomainSweeper {
  countHeld(db: DatabaseAdapter, context: DomainSweepContext): Promise<number>;
  sweepBatch(db: DatabaseAdapter, context: DomainSweepContext): Promise<DomainBatchResult>;
}

export interface DomainSweepResult {
  organizationId: string;
  domain: RetentionDomain;
  retentionDays: number;
  cutoff: string;
  outcome: RetentionSweepOutcome;
  recordsDeleted: number;
  recordsHeld: number;
  objectsDeleted: number;
  objectsFailed: number;
  activeHolds: number;
  error: string | null;
}

export type DomainObjectDeleter = (
  keys: readonly string[],
) => Promise<{ deleted: number; failedKeys: string[] }>;

async function deleteKnowledgeObjects(keys: readonly string[]) {
  let deleted = 0;
  const failedKeys: string[] = [];
  for (const key of keys) {
    try {
      await deleteProjectKnowledgeObject(key);
      deleted++;
    } catch {
      failedKeys.push(key);
    }
  }
  return { deleted, failedKeys };
}

async function deleteMediaObjects(keys: readonly string[]) {
  const { deleted, failedPathnames } = await deleteStoredMediaObjects(keys);
  return { deleted, failedKeys: failedPathnames };
}

async function countRows(db: DatabaseAdapter, sql: string, params: unknown[]): Promise<number> {
  const [row] = await db.query<{ count: number | string }>(sql, params);
  return Number(row?.count ?? 0);
}

function memberScoped(alias: string): string {
  return `exists (
      select 1 from public.organization_members m
       where m.organization_id = $1 and m.user_id = ${alias}.user_id
    ) and not (${alias}.user_id = any($3::text[]))`;
}

function rowsOnlySweeper(options: { heldSql: string; deleteSql: string }): DomainSweeper {
  return {
    countHeld: (db, context) =>
      countRows(db, options.heldSql, [context.organizationId, context.cutoff, context.heldUserIds]),
    async sweepBatch(db, context) {
      const deleted = await db.query<{ id: string }>(options.deleteSql, [
        context.organizationId,
        context.cutoff,
        context.heldUserIds,
        context.limit,
      ]);
      return {
        recordsDeleted: deleted.length,
        objectsDeleted: 0,
        objectsFailed: 0,
        candidates: deleted.length,
      };
    },
  };
}

function objectBackedSweeper(options: {
  heldSql: string;
  candidatesSql: string;
  deleteSql: string;
  deleteObjects: DomainObjectDeleter;
}): DomainSweeper {
  return {
    countHeld: (db, context) =>
      countRows(db, options.heldSql, [context.organizationId, context.cutoff, context.heldUserIds]),
    async sweepBatch(db, context) {
      const candidates = await db.query<{ id: string; object_keys: string[] | null }>(
        options.candidatesSql,
        [context.organizationId, context.cutoff, context.heldUserIds, context.limit],
      );
      if (candidates.length === 0) {
        return { recordsDeleted: 0, objectsDeleted: 0, objectsFailed: 0, candidates: 0 };
      }
      const keys = candidates.flatMap((row) => (row.object_keys ?? []).filter(Boolean));
      const { deleted, failedKeys } = await options.deleteObjects(keys);
      const stillStored = new Set(failedKeys);
      const removable = candidates
        .filter((row) => !(row.object_keys ?? []).some((key) => stillStored.has(key)))
        .map((row) => row.id);
      const removed =
        removable.length === 0
          ? []
          : await db.query<{ id: string }>(options.deleteSql, [removable]);
      return {
        recordsDeleted: removed.length,
        objectsDeleted: deleted,
        objectsFailed: failedKeys.length,
        candidates: candidates.length,
      };
    },
  };
}

function artifactsSweeper(): DomainSweeper {
  return {
    countHeld: (db, context) =>
      countRows(
        db,
        `select
           (select count(*) from public.web_artifacts
             where organization_id = $1 and updated_at < $2 and user_id = any($3::text[]))
           +
           (select count(*) from public.published_artifacts pa
              join public.web_conversations c on c.id = pa.conversation_id
             where c.organization_id = $1 and pa.updated_at < $2
               and pa.user_id = any($3::text[])) as count`,
        [context.organizationId, context.cutoff, context.heldUserIds],
      ),
    async sweepBatch(db, context) {
      const params = [context.organizationId, context.cutoff, context.heldUserIds, context.limit];
      const published = await db.query<{ id: string }>(
        `delete from public.published_artifacts
          where id in (
            select pa.id from public.published_artifacts pa
              join public.web_conversations c on c.id = pa.conversation_id
             where c.organization_id = $1
               and pa.updated_at < $2
               and not (pa.user_id = any($3::text[]))
             order by pa.updated_at asc
             limit $4
          )
          returning id`,
        params,
      );
      const artifacts = await db.query<{ id: string }>(
        `delete from public.web_artifacts
          where id in (
            select id from public.web_artifacts
             where organization_id = $1
               and updated_at < $2
               and not (user_id = any($3::text[]))
             order by updated_at asc
             limit $4
          )
          returning id`,
        params,
      );
      const recordsDeleted = published.length + artifacts.length;
      return {
        recordsDeleted,
        objectsDeleted: 0,
        objectsFailed: 0,
        candidates: Math.max(published.length, artifacts.length),
      };
    },
  };
}

export function createDomainSweepers(
  objectDeleters: {
    knowledge?: DomainObjectDeleter;
    media?: DomainObjectDeleter;
  } = {},
): Readonly<Record<RetentionDomain, DomainSweeper>> {
  const knowledge = objectDeleters.knowledge ?? deleteKnowledgeObjects;
  const media = objectDeleters.media ?? deleteMediaObjects;

  return {
    projects: objectBackedSweeper({
      heldSql: `select count(*)::int as count from public.user_projects
                 where organization_id = $1 and updated_at < $2 and user_id = any($3::text[])`,
      candidatesSql: `select p.id,
                             coalesce(array_agg(k.storage_uri) filter (where k.storage_uri is not null),
                                      '{}') as object_keys
                        from public.user_projects p
                        left join public.project_knowledge_files k on k.project_id = p.id
                       where p.organization_id = $1
                         and p.updated_at < $2
                         and not (p.user_id = any($3::text[]))
                       group by p.id, p.updated_at
                       order by p.updated_at asc
                       limit $4`,
      deleteSql: `delete from public.user_projects where id = any($1::uuid[]) returning id`,
      deleteObjects: async (uris) => {
        const keyByUri = new Map<string, string>();
        for (const uri of uris) {
          const key = objectKeyFromStorageUri(uri);
          if (key) keyByUri.set(uri, key);
        }
        const { deleted, failedKeys } = await knowledge([...keyByUri.values()]);
        const failed = new Set(failedKeys);
        return {
          deleted,
          failedKeys: [...keyByUri].filter(([, key]) => failed.has(key)).map(([uri]) => uri),
        };
      },
    }),
    work: rowsOnlySweeper({
      heldSql: `select count(*)::int as count from public.cloud_agent_runs
                 where organization_id = $1
                   and state in ('completed', 'failed', 'cancelled', 'archived')
                   and coalesce(completed_at, updated_at) < $2
                   and user_id = any($3::text[])`,
      deleteSql: `delete from public.cloud_agent_runs
                   where id in (
                     select id from public.cloud_agent_runs
                      where organization_id = $1
                        and state in ('completed', 'failed', 'cancelled', 'archived')
                        and coalesce(completed_at, updated_at) < $2
                        and not (user_id = any($3::text[]))
                      order by updated_at asc
                      limit $4
                   )
                   returning id`,
    }),
    code_sessions: rowsOnlySweeper({
      heldSql: `select count(*)::int as count from public.cloud_code_sessions
                 where organization_id = $1
                   and state in ('failed', 'closed')
                   and coalesce(closed_at, updated_at) < $2
                   and user_id = any($3::text[])`,
      deleteSql: `delete from public.cloud_code_sessions
                   where id in (
                     select id from public.cloud_code_sessions
                      where organization_id = $1
                        and state in ('failed', 'closed')
                        and coalesce(closed_at, updated_at) < $2
                        and not (user_id = any($3::text[]))
                      order by updated_at asc
                      limit $4
                   )
                   returning id`,
    }),
    files: objectBackedSweeper({
      heldSql: `select count(*)::int as count from public.media_assets
                 where organization_id = $1 and created_at < $2 and user_id = any($3::text[])`,
      candidatesSql: `select id,
                             case when storage_pathname is null then '{}'::text[]
                                  else array[storage_pathname] end as object_keys
                        from public.media_assets
                       where organization_id = $1
                         and created_at < $2
                         and not (user_id = any($3::text[]))
                       order by created_at asc
                       limit $4`,
      deleteSql: `delete from public.media_assets where id = any($1::uuid[]) returning id`,
      deleteObjects: media,
    }),
    artifacts: artifactsSweeper(),
    connector_data: rowsOnlySweeper({
      heldSql: `select count(*)::int as count from public.connector_oauth_grants t
                 where t.revoked_at is not null and t.revoked_at < $2
                   and exists (select 1 from public.organization_members m
                                where m.organization_id = $1 and m.user_id = t.user_id)
                   and t.user_id = any($3::text[])`,
      deleteSql: `delete from public.connector_oauth_grants
                   where id in (
                     select t.id from public.connector_oauth_grants t
                      where t.revoked_at is not null
                        and t.revoked_at < $2
                        and ${memberScoped('t')}
                      order by t.revoked_at asc
                      limit $4
                   )
                   returning id`,
    }),
    remote_sessions: rowsOnlySweeper({
      heldSql: `select count(*)::int as count from public.device_pairings t
                 where t.status in ('revoked', 'expired') and t.updated_at < $2
                   and exists (select 1 from public.organization_members m
                                where m.organization_id = $1 and m.user_id = t.user_id)
                   and t.user_id = any($3::text[])`,
      deleteSql: `delete from public.device_pairings
                   where id in (
                     select t.id from public.device_pairings t
                      where t.status in ('revoked', 'expired')
                        and t.updated_at < $2
                        and ${memberScoped('t')}
                      order by t.updated_at asc
                      limit $4
                   )
                   returning id`,
    }),
    notifications: rowsOnlySweeper({
      heldSql: `select count(*)::int as count from public.notifications t
                 where t.created_at < $2
                   and exists (select 1 from public.organization_members m
                                where m.organization_id = $1 and m.user_id = t.user_id)
                   and t.user_id = any($3::text[])`,
      deleteSql: `delete from public.notifications
                   where id in (
                     select t.id from public.notifications t
                      where t.created_at < $2
                        and ${memberScoped('t')}
                      order by t.created_at asc
                      limit $4
                   )
                   returning id`,
    }),
    // A research report outlives the chat that asked for it: it is saved, listed
    // and reopened on its own, and only a report still attached to a live
    // conversation is reached by that conversation's deletion. Swept on
    // created_at rather than completed_at so a run that never finished is
    // covered by the same window.
    research: rowsOnlySweeper({
      heldSql: `select count(*)::int as count from public.research_reports t
                 where t.created_at < $2
                   and exists (select 1 from public.organization_members m
                                where m.organization_id = $1 and m.user_id = t.user_id)
                   and t.user_id = any($3::text[])`,
      deleteSql: `delete from public.research_reports
                   where id in (
                     select t.id from public.research_reports t
                      where t.created_at < $2
                        and ${memberScoped('t')}
                      order by t.created_at asc
                      limit $4
                   )
                   returning id`,
    }),
  };
}

async function recordDomainSweep(db: DatabaseAdapter, result: DomainSweepResult): Promise<void> {
  await db.query(
    `insert into public.organization_domain_retention_sweeps
       (organization_id, domain, retention_days, cutoff, outcome, records_deleted,
        records_held, objects_deleted, objects_failed, active_holds, error)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      result.organizationId,
      result.domain,
      result.retentionDays,
      result.cutoff,
      result.outcome,
      result.recordsDeleted,
      result.recordsHeld,
      result.objectsDeleted,
      result.objectsFailed,
      result.activeHolds,
      result.error?.slice(0, 2000) ?? null,
    ],
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function sweepOrganizationDomain(
  db: DatabaseAdapter,
  policy: { organizationId: string; domain: RetentionDomain; retentionDays: number },
  options: {
    now?: Date;
    sweepers?: Readonly<Record<RetentionDomain, DomainSweeper>>;
    readHolds?: (db: DatabaseAdapter, organizationId: string) => Promise<LegalHold[]>;
  } = {},
): Promise<DomainSweepResult> {
  const now = options.now ?? new Date();
  const sweeper = (options.sweepers ?? createDomainSweepers())[policy.domain];
  const readHolds = options.readHolds ?? ((handle, id) => listLegalHolds(handle, id));
  const base: DomainSweepResult = {
    organizationId: policy.organizationId,
    domain: policy.domain,
    retentionDays: policy.retentionDays,
    cutoff: new Date(now.getTime() - policy.retentionDays * DAY_MS).toISOString(),
    outcome: 'nothing_due',
    recordsDeleted: 0,
    recordsHeld: 0,
    objectsDeleted: 0,
    objectsFailed: 0,
    activeHolds: 0,
    error: null,
  };

  let holds: LegalHold[];
  try {
    holds = (await readHolds(db, policy.organizationId)).filter((hold) =>
      holdAppliesTo(hold, policy.domain),
    );
  } catch (error) {
    const result: DomainSweepResult = {
      ...base,
      outcome: 'aborted',
      error: `Legal holds could not be read, so nothing was deleted: ${describeError(error)}`,
    };
    await recordDomainSweep(db, result).catch(() => undefined);
    return result;
  }

  if (holds.some((hold) => hold.scope === 'organization')) {
    const result: DomainSweepResult = {
      ...base,
      outcome: 'held',
      activeHolds: holds.length,
      error: 'An organization-wide legal hold is active. Nothing was deleted.',
    };
    await recordDomainSweep(db, result);
    return result;
  }

  const context: DomainSweepContext = {
    organizationId: policy.organizationId,
    cutoff: base.cutoff,
    heldUserIds: holds
      .filter((hold) => hold.scope === 'member' && hold.subjectUserId)
      .map((hold) => hold.subjectUserId as string),
    limit: DOMAIN_RETENTION_BATCH,
  };

  const totals = { recordsDeleted: 0, objectsDeleted: 0, objectsFailed: 0 };
  try {
    const recordsHeld = await sweeper.countHeld(db, context);
    let remaining = false;
    for (let batch = 0; batch < DOMAIN_RETENTION_MAX_BATCHES; batch++) {
      const step = await sweeper.sweepBatch(db, context);
      totals.recordsDeleted += step.recordsDeleted;
      totals.objectsDeleted += step.objectsDeleted;
      totals.objectsFailed += step.objectsFailed;
      if (step.candidates < DOMAIN_RETENTION_BATCH || step.recordsDeleted === 0) break;
      remaining = batch === DOMAIN_RETENTION_MAX_BATCHES - 1;
    }
    const result: DomainSweepResult = {
      ...base,
      ...totals,
      outcome: totals.recordsDeleted > 0 ? 'deleted' : 'nothing_due',
      recordsHeld,
      activeHolds: holds.length,
      error: remaining
        ? `Reached the per-run ceiling of ${DOMAIN_RETENTION_MAX_BATCHES * DOMAIN_RETENTION_BATCH} records. More remain past the cutoff and will be deleted on the next run.`
        : totals.objectsFailed > 0
          ? `${totals.objectsFailed} stored object(s) could not be deleted; their records were kept and will be retried on the next run.`
          : null,
    };
    await recordDomainSweep(db, result);
    return result;
  } catch (error) {
    const result: DomainSweepResult = {
      ...base,
      ...totals,
      outcome: 'failed',
      activeHolds: holds.length,
      error: describeError(error),
    };
    await recordDomainSweep(db, result).catch(() => undefined);
    return result;
  }
}

interface PolicyRow {
  organization_id: string;
  domain: string;
  retention_days: number;
  enforced: boolean;
  updated_at: string | Date | null;
}

export async function listEnforcedDomainPolicies(
  db: DatabaseAdapter,
): Promise<Array<{ organizationId: string; domain: RetentionDomain; retentionDays: number }>> {
  const rows = await db.query<PolicyRow>(
    `select policy.organization_id, policy.domain, policy.retention_days, policy.enforced,
            policy.updated_at
       from public.organization_domain_retention_policies policy
       left join lateral (
         select max(sweep.created_at) as last_swept_at
           from public.organization_domain_retention_sweeps sweep
          where sweep.organization_id = policy.organization_id
            and sweep.domain = policy.domain
       ) last_sweep on true
      where policy.enforced = true
      order by last_sweep.last_swept_at asc nulls first, policy.organization_id, policy.domain`,
    [],
  );
  return rows
    .filter((row) => isRetentionDomain(row.domain))
    .map((row) => ({
      organizationId: row.organization_id,
      domain: row.domain as RetentionDomain,
      retentionDays: row.retention_days,
    }));
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export async function readDomainRetentionPolicies(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<DomainRetentionPolicy[]> {
  const rows = await db.query<PolicyRow>(
    `select organization_id, domain, retention_days, enforced, updated_at
       from public.organization_domain_retention_policies
      where organization_id = $1`,
    [organizationId],
  );
  return RETENTION_DOMAINS.map((domain) => {
    const row = rows.find((candidate) => candidate.domain === domain);
    return {
      domain,
      retentionDays: row?.retention_days ?? 365,
      enforced: row?.enforced ?? false,
      updatedAt: toIso(row?.updated_at ?? null),
    };
  });
}

export async function upsertDomainRetentionPolicies(
  db: DatabaseAdapter,
  organizationId: string,
  policies: ReadonlyArray<{ domain: RetentionDomain; retentionDays: number; enforced: boolean }>,
  userId: string,
): Promise<void> {
  for (const policy of policies) {
    await db.query(
      `insert into public.organization_domain_retention_policies
         (organization_id, domain, retention_days, enforced, updated_by)
       values ($1, $2, $3, $4, $5)
       on conflict (organization_id, domain) do update
         set retention_days = excluded.retention_days,
             enforced = excluded.enforced,
             updated_by = excluded.updated_by`,
      [organizationId, policy.domain, policy.retentionDays, policy.enforced, userId],
    );
  }
}

export interface DomainRetentionSweepRecord {
  id: string;
  domain: RetentionDomain;
  retentionDays: number;
  cutoff: string;
  outcome: RetentionSweepOutcome;
  recordsDeleted: number;
  recordsHeld: number;
  objectsDeleted: number;
  objectsFailed: number;
  activeHolds: number;
  error: string | null;
  createdAt: string;
}

export async function listDomainRetentionSweeps(
  db: DatabaseAdapter,
  organizationId: string,
  limit = 40,
): Promise<DomainRetentionSweepRecord[]> {
  const rows = await db.query<{
    id: string;
    domain: string;
    retention_days: number;
    cutoff: string | Date;
    outcome: RetentionSweepOutcome;
    records_deleted: number;
    records_held: number;
    objects_deleted: number;
    objects_failed: number;
    active_holds: number;
    error: string | null;
    created_at: string | Date;
  }>(
    `select id, domain, retention_days, cutoff, outcome, records_deleted, records_held,
            objects_deleted, objects_failed, active_holds, error, created_at
       from public.organization_domain_retention_sweeps
      where organization_id = $1
      order by created_at desc
      limit $2`,
    [organizationId, Math.min(Math.max(limit, 1), 100)],
  );
  return rows
    .filter((row) => isRetentionDomain(row.domain))
    .map((row) => ({
      id: row.id,
      domain: row.domain as RetentionDomain,
      retentionDays: row.retention_days,
      cutoff: toIso(row.cutoff) ?? '',
      outcome: row.outcome,
      recordsDeleted: row.records_deleted,
      recordsHeld: row.records_held,
      objectsDeleted: row.objects_deleted,
      objectsFailed: row.objects_failed,
      activeHolds: row.active_holds,
      error: row.error,
      createdAt: toIso(row.created_at) ?? '',
    }));
}
