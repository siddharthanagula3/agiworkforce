import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { retentionEnforcement } from '@/lib/server/retention/enforcement';
import { resolveOrganizationEntitlementPlan } from '@/lib/services/org-entitlements';
import {
  HOLD_COLUMNS,
  countActiveLegalHolds,
  countHeldRows,
  countHoldsCovering,
  countUnheldRows,
  formatHold,
  legalHoldExclusion,
  type HoldRow,
  type LegalHold,
  type LegalHoldResourceType,
  type LegalHoldScope,
} from './legal-hold-gate';

export {
  HOLD_COLUMNS,
  LEGAL_HOLD_RESOURCE_TYPES,
  countActiveLegalHolds,
  formatHold,
  heldSubjects,
  holdCovers,
  isLegalHoldResourceType,
  listLegalHolds,
  type HoldRow,
  type LegalHold,
  type LegalHoldResourceType,
  type LegalHoldScope,
} from './legal-hold-gate';

/** The store the workspace retention sweep deletes from. */
const SWEPT_RESOURCE: LegalHoldResourceType = 'conversation';

export type RetentionSweepOutcome = 'deleted' | 'nothing_due' | 'held' | 'aborted' | 'failed';

export interface RetentionSweepResult {
  organizationId: string;
  outcome: RetentionSweepOutcome;
  retentionDays: number;
  cutoff: string;
  conversationsDeleted: number;
  conversationsHeld: number;
  activeHolds: number;
  dryRun: boolean;
  error: string | null;
}

/** A workspace with no saved window, and no plan commitment to one, is not swept. */
export interface RetentionSkipped {
  organizationId: string;
  outcome: 'not_enforced';
}

export type RetentionSweep = RetentionSweepResult | RetentionSkipped;

export function isSwept(result: RetentionSweep): result is RetentionSweepResult {
  return result.outcome !== 'not_enforced';
}

/** Rows per DELETE, so one statement cannot hold locks on the live path. */
export const RETENTION_SWEEP_BATCH = 500;

/**
 * Batches per organization per run.
 *
 * One batch per run would be a defect rather than caution: a workspace that
 * switches on a 90-day window with a year of history behind it has tens of
 * thousands of rows past the cutoff, and at 500 a night the backlog outlives
 * the compliance promise the setting was made to keep. Looping to this ceiling
 * clears 5,000 a night while each individual statement stays small.
 */
export const RETENTION_SWEEP_MAX_BATCHES = 10;

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

// A custodian hold with an empty list reads as a hold while preserving nobody.
export async function createLegalHold(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    name: string;
    reason: string | null;
    scope: LegalHoldScope;
    subjectUserId: string | null;
    custodianUserIds?: string[];
    resourceTypes?: LegalHoldResourceType[] | null;
    createdByUserId: string;
  },
): Promise<LegalHold> {
  const custodians =
    input.scope === 'custodian' ? Array.from(new Set(input.custodianUserIds ?? [])) : [];
  if (input.scope === 'custodian' && custodians.length === 0) {
    throw new Error('A custodian-scoped legal hold needs at least one custodian.');
  }
  const resourceTypes = input.resourceTypes?.length
    ? Array.from(new Set(input.resourceTypes))
    : null;

  return db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `insert into public.legal_holds
         (organization_id, name, reason, scope, subject_user_id, resource_types, created_by_user_id)
       values ($1, $2, $3, $4, $5, $6::text[], $7)
       returning id`,
      [
        input.organizationId,
        input.name,
        input.reason,
        input.scope,
        input.scope === 'member' ? input.subjectUserId : null,
        resourceTypes,
        input.createdByUserId,
      ],
    );
    if (!row) throw new Error(`legal_holds insert returned no row for ${input.organizationId}`);

    for (const userId of custodians) {
      await tx.query(
        `insert into public.legal_hold_custodians (hold_id, user_id, added_by_user_id)
         values ($1, $2, $3)
         on conflict (hold_id, user_id) do nothing`,
        [row.id, userId, input.createdByUserId],
      );
    }

    const [created] = await tx.query<HoldRow>(
      `select ${HOLD_COLUMNS}
         from public.legal_holds h
        where h.id = $1 and h.organization_id = $2`,
      [row.id, input.organizationId],
    );
    if (!created) throw new Error(`legal_holds row ${row.id} disappeared during creation`);
    return formatHold(created);
  });
}

// Returns null for "not yours" and "already released" alike, so the endpoint
// cannot be used to probe which hold ids exist elsewhere.
export async function releaseLegalHold(
  db: DatabaseAdapter,
  organizationId: string,
  holdId: string,
  releasedByUserId: string,
): Promise<LegalHold | null> {
  const [released] = await db.query<{ id: string }>(
    `update public.legal_holds
        set released_at = now(), released_by_user_id = $3
      where id = $2 and organization_id = $1 and released_at is null
      returning id`,
    [organizationId, holdId, releasedByUserId],
  );
  if (!released) return null;

  const [row] = await db.query<HoldRow>(
    `select ${HOLD_COLUMNS}
       from public.legal_holds h
      where h.id = $1 and h.organization_id = $2`,
    [released.id, organizationId],
  );
  return row ? formatHold(row) : null;
}

interface RetentionPolicyRow {
  retention_days: number;
  retention_enforced: boolean;
}

async function recordSweep(db: DatabaseAdapter, result: RetentionSweepResult): Promise<void> {
  await db.query(
    `insert into public.organization_retention_sweeps
       (organization_id, retention_days, cutoff, outcome, conversations_deleted,
        conversations_held, active_holds, dry_run, error)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      result.organizationId,
      result.retentionDays,
      result.cutoff,
      result.outcome,
      result.conversationsDeleted,
      result.conversationsHeld,
      result.activeHolds,
      result.dryRun,
      result.error,
    ],
  );
}

// Fails closed: an unreadable hold set deletes nothing and records `aborted`.
// The hold also rides inside the DELETE, so a hold placed mid-sweep still wins.
export async function sweepOrganizationRetention(
  db: DatabaseAdapter,
  organizationId: string,
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<RetentionSweep> {
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date();

  const [policy] = await db.query<RetentionPolicyRow>(
    `select retention_days, retention_enforced
       from public.organization_admin_policies
      where organization_id = $1
      limit 1`,
    [organizationId],
  );

  // A recorded window on a plan that sells enterprise controls is a commitment
  // rather than an owner's preference, so it is swept either way.
  const enforcement = retentionEnforcement({
    plan: policy ? await resolveOrganizationEntitlementPlan(organizationId) : null,
    retentionDays: policy?.retention_days ?? null,
    retentionEnforced: policy?.retention_enforced ?? false,
  });
  if (!policy || (!enforcement.enforced && !enforcement.required)) {
    return { organizationId, outcome: 'not_enforced' };
  }

  const retentionDays = policy.retention_days;
  // Retention runs from updated_at: a conversation somebody is still working in
  // has not been dormant, and deleting it would read as data loss.
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const base = {
    organizationId,
    retentionDays,
    cutoff,
    conversationsDeleted: 0,
    conversationsHeld: 0,
    activeHolds: 0,
    dryRun,
    error: null as string | null,
  };

  const due = `candidate.organization_id = $1 and candidate.updated_at < $2`;
  const dueParams = [organizationId, cutoff];

  let activeHolds: number;
  let organizationHolds: number;
  try {
    activeHolds = await countActiveLegalHolds(db, organizationId);
    organizationHolds = await countHoldsCovering(db, organizationId, SWEPT_RESOURCE, {
      scope: 'organization',
    });
  } catch (error) {
    const result: RetentionSweepResult = {
      ...base,
      outcome: 'aborted',
      error: `Legal holds could not be read, so nothing was deleted: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
    await recordSweep(db, result).catch(() => undefined);
    return result;
  }

  if (organizationHolds > 0) {
    const result: RetentionSweepResult = {
      ...base,
      outcome: 'held',
      activeHolds,
      error: 'An organization-wide legal hold is active. No conversation was deleted.',
    };
    await recordSweep(db, result);
    return result;
  }

  try {
    const conversationsHeld = await countHeldRows(db, SWEPT_RESOURCE, {
      table: 'web_conversations',
      alias: 'candidate',
      where: due,
      params: dueParams,
    });

    if (dryRun) {
      const pending = await countUnheldRows(db, SWEPT_RESOURCE, {
        table: 'web_conversations',
        alias: 'candidate',
        where: due,
        params: dueParams,
      });
      const result: RetentionSweepResult = {
        ...base,
        outcome: pending > 0 ? 'deleted' : 'nothing_due',
        conversationsHeld,
        activeHolds,
        // A dry run reports what it WOULD remove; the table constraint keeps
        // that out of the deleted column so the evidence stays honest.
        error: `Dry run: ${pending} conversation(s) would be deleted, ${conversationsHeld} withheld by legal hold.`,
      };
      await recordSweep(db, result);
      return result;
    }

    // Batched so one statement never holds locks on the table serving live
    // chat, and the loop stops as soon as a batch comes back short.
    const exclusion = legalHoldExclusion(SWEPT_RESOURCE, {
      alias: 'candidate',
      nextParamIndex: 3,
    });
    let totalDeleted = 0;
    let remaining = false;
    for (let batch = 0; batch < RETENTION_SWEEP_MAX_BATCHES; batch++) {
      const deleted = await db.query<{ id: string }>(
        `delete from public.web_conversations
          where id in (
            select candidate.id from public.web_conversations candidate
             where candidate.organization_id = $1
               and candidate.updated_at < $2
               and ${exclusion.sql}
             limit $4
          )
          returning id`,
        [...dueParams, ...exclusion.params, RETENTION_SWEEP_BATCH],
      );
      totalDeleted += deleted.length;
      if (deleted.length < RETENTION_SWEEP_BATCH) break;
      remaining = batch === RETENTION_SWEEP_MAX_BATCHES - 1;
    }

    const result: RetentionSweepResult = {
      ...base,
      outcome: totalDeleted > 0 ? 'deleted' : 'nothing_due',
      conversationsDeleted: totalDeleted,
      conversationsHeld,
      activeHolds,
      // Said out loud so a workspace clearing a large backlog can see it is
      // still working through it rather than assuming retention has caught up.
      error: remaining
        ? `Reached the per-run ceiling of ${RETENTION_SWEEP_MAX_BATCHES * RETENTION_SWEEP_BATCH} conversations. More remain past the cutoff and will be deleted on the next run.`
        : null,
    };
    await recordSweep(db, result);
    return result;
  } catch (error) {
    const result: RetentionSweepResult = {
      ...base,
      outcome: 'failed',
      activeHolds,
      error: error instanceof Error ? error.message : String(error),
    };
    await recordSweep(db, result).catch(() => undefined);
    return result;
  }
}

// Least-recently-swept first: ordered by id, the same head was swept nightly
// and nothing past the caller's cap was ever deleted.
export async function listOrganizationsWithRetentionEnforced(
  db: DatabaseAdapter,
): Promise<string[]> {
  const rows = await db.query<{ organization_id: string }>(
    `select policy.organization_id
       from public.organization_admin_policies policy
       left join lateral (
         select max(sweep.created_at) as last_swept_at
           from public.organization_retention_sweeps sweep
          where sweep.organization_id = policy.organization_id
            and sweep.dry_run = false
       ) last_sweep on true
      where policy.retention_enforced = true
      order by last_sweep.last_swept_at asc nulls first, policy.organization_id`,
    [],
  );
  return rows.map((row) => row.organization_id);
}

export interface RetentionBacklog {
  organizationId: string;
  enforced: boolean;
  retentionDays: number | null;
  cutoff: string | null;
  pendingDeletions: number;
  heldFromDeletion: number;
  perRunCeiling: number;
  runsRemaining: number;
  lastSweptAt: string | null;
  estimatedCompletionAt: string | null;
}

const RETENTION_SWEEP_CEILING = RETENTION_SWEEP_MAX_BATCHES * RETENTION_SWEEP_BATCH;

// The estimate uses this workspace's own last two real sweeps: the cron's
// schedule is configuration this service cannot read.
export async function readRetentionBacklog(
  db: DatabaseAdapter,
  organizationId: string,
  options: { now?: Date } = {},
): Promise<RetentionBacklog> {
  const now = options.now ?? new Date();
  const empty: RetentionBacklog = {
    organizationId,
    enforced: false,
    retentionDays: null,
    cutoff: null,
    pendingDeletions: 0,
    heldFromDeletion: 0,
    perRunCeiling: RETENTION_SWEEP_CEILING,
    runsRemaining: 0,
    lastSweptAt: null,
    estimatedCompletionAt: null,
  };

  const [policy] = await db.query<RetentionPolicyRow>(
    `select retention_days, retention_enforced
       from public.organization_admin_policies
      where organization_id = $1
      limit 1`,
    [organizationId],
  );
  if (!policy || !policy.retention_enforced) return empty;

  const retentionDays = policy.retention_days;
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  // Counted through the same predicate the sweep excludes on, never from a
  // capped list of holds.
  const scope = {
    table: 'web_conversations',
    alias: 'candidate',
    where: `candidate.organization_id = $1 and candidate.updated_at < $2`,
    params: [organizationId, cutoff],
  };
  const pendingDeletions = await countUnheldRows(db, SWEPT_RESOURCE, scope);
  const heldFromDeletion = await countHeldRows(db, SWEPT_RESOURCE, scope);

  const sweeps = await db.query<{ created_at: string | Date }>(
    `select created_at
       from public.organization_retention_sweeps
      where organization_id = $1
        and dry_run = false
      order by created_at desc
      limit 2`,
    [organizationId],
  );
  const lastSweptAt = sweeps[0] ? toIso(sweeps[0].created_at) : null;
  const previousSweptAt = sweeps[1] ? toIso(sweeps[1].created_at) : null;

  const runsRemaining = Math.ceil(pendingDeletions / RETENTION_SWEEP_CEILING);
  const cadenceMs =
    lastSweptAt && previousSweptAt ? Date.parse(lastSweptAt) - Date.parse(previousSweptAt) : null;
  const estimatedCompletionAt =
    runsRemaining > 0 && lastSweptAt && cadenceMs && cadenceMs > 0
      ? new Date(Date.parse(lastSweptAt) + cadenceMs * runsRemaining).toISOString()
      : null;

  return {
    organizationId,
    enforced: true,
    retentionDays,
    cutoff,
    pendingDeletions,
    heldFromDeletion,
    perRunCeiling: RETENTION_SWEEP_CEILING,
    runsRemaining,
    lastSweptAt,
    estimatedCompletionAt,
  };
}

export interface RetentionSweepRecord {
  id: string;
  organizationId: string;
  retentionDays: number;
  cutoff: string;
  outcome: RetentionSweepOutcome;
  conversationsDeleted: number;
  conversationsHeld: number;
  activeHolds: number;
  dryRun: boolean;
  error: string | null;
  createdAt: string;
}

export async function listRetentionSweeps(
  db: DatabaseAdapter,
  organizationId: string,
  limit = 20,
): Promise<RetentionSweepRecord[]> {
  const rows = await db.query<{
    id: string;
    organization_id: string;
    retention_days: number;
    cutoff: string | Date;
    outcome: RetentionSweepOutcome;
    conversations_deleted: number;
    conversations_held: number;
    active_holds: number;
    dry_run: boolean;
    error: string | null;
    created_at: string | Date;
  }>(
    `select id, organization_id, retention_days, cutoff, outcome,
            conversations_deleted, conversations_held, active_holds, dry_run,
            error, created_at
       from public.organization_retention_sweeps
      where organization_id = $1
      order by created_at desc
      limit $2`,
    [organizationId, Math.min(Math.max(limit, 1), 100)],
  );

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    retentionDays: row.retention_days,
    cutoff: toIso(row.cutoff) ?? new Date(0).toISOString(),
    outcome: row.outcome,
    conversationsDeleted: row.conversations_deleted,
    conversationsHeld: row.conversations_held,
    activeHolds: row.active_holds,
    dryRun: row.dry_run,
    error: row.error,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  }));
}
