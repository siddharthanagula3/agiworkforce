import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { retentionEnforcement } from '@/lib/server/retention/enforcement';
import { resolveOrganizationEntitlementPlan } from '@/lib/services/org-entitlements';

export type LegalHoldScope = 'organization' | 'member' | 'custodian';

/**
 * The stores a hold can name, shared with the eDiscovery export so a hold and
 * the export of what it holds cannot disagree about what a "file" is.
 */
export const LEGAL_HOLD_RESOURCE_TYPES = [
  'conversation',
  'message',
  'project',
  'project_file',
  'file',
  'artifact',
  'work_run',
] as const;

export type LegalHoldResourceType = (typeof LEGAL_HOLD_RESOURCE_TYPES)[number];

export function isLegalHoldResourceType(value: string): value is LegalHoldResourceType {
  return (LEGAL_HOLD_RESOURCE_TYPES as readonly string[]).includes(value);
}

export interface LegalHold {
  id: string;
  organizationId: string;
  name: string;
  reason: string | null;
  scope: LegalHoldScope;
  subjectUserId: string | null;
  /** Empty for organization and member scopes; the held people for custodian scope. */
  custodianUserIds: string[];
  /** null preserves every store, which is what a hold placed before 0261 meant. */
  resourceTypes: LegalHoldResourceType[] | null;
  createdByUserId: string;
  releasedAt: string | null;
  releasedByUserId: string | null;
  createdAt: string;
}

/** Everyone a hold preserves, whichever shape it was placed in. */
export function heldSubjects(hold: LegalHold): string[] {
  if (hold.scope === 'member') return hold.subjectUserId ? [hold.subjectUserId] : [];
  if (hold.scope === 'custodian') return hold.custodianUserIds;
  return [];
}

/** A hold with no resource_types covers every store; a narrowed one covers what it names. */
export function holdCovers(hold: LegalHold, resourceType: LegalHoldResourceType): boolean {
  return hold.resourceTypes === null || hold.resourceTypes.includes(resourceType);
}

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

export interface HoldRow {
  id: string;
  organization_id: string;
  name: string;
  reason: string | null;
  scope: LegalHoldScope;
  subject_user_id: string | null;
  resource_types: string[] | null;
  custodian_user_ids: string[] | null;
  created_by_user_id: string;
  released_at: string | Date | null;
  released_by_user_id: string | null;
  created_at: string | Date;
}

/**
 * Custodians come back as an aggregate rather than a second round trip: the
 * sweep reads holds on the path that decides whether to delete, and a hold whose
 * custodian list failed to load separately would silently preserve nobody.
 */
export const HOLD_COLUMNS = `h.id, h.organization_id, h.name, h.reason, h.scope, h.subject_user_id,
  h.resource_types, h.created_by_user_id, h.released_at, h.released_by_user_id, h.created_at,
  coalesce(array(select c.user_id from public.legal_hold_custodians c
                  where c.hold_id = h.id order by c.user_id), array[]::text[]) as custodian_user_ids`;

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function formatHold(row: HoldRow): LegalHold {
  const resourceTypes = row.resource_types?.filter(isLegalHoldResourceType) ?? null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    reason: row.reason,
    scope: row.scope,
    subjectUserId: row.subject_user_id,
    custodianUserIds: row.custodian_user_ids ?? [],
    resourceTypes: resourceTypes && resourceTypes.length > 0 ? resourceTypes : null,
    createdByUserId: row.created_by_user_id,
    releasedAt: toIso(row.released_at),
    releasedByUserId: row.released_by_user_id,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  };
}

export async function listLegalHolds(
  db: DatabaseAdapter,
  organizationId: string,
  options: { includeReleased?: boolean } = {},
): Promise<LegalHold[]> {
  const rows = await db.query<HoldRow>(
    `select ${HOLD_COLUMNS}
       from public.legal_holds h
      where h.organization_id = $1
        ${options.includeReleased ? '' : 'and h.released_at is null'}
      order by h.created_at desc
      limit 200`,
    [organizationId],
  );
  return rows.map(formatHold);
}

export async function countActiveLegalHolds(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<number> {
  const rows = await db.query<{ count: number | string }>(
    `select count(*)::int as count
       from public.legal_holds
      where organization_id = $1 and released_at is null`,
    [organizationId],
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * A custodian-scoped hold with an empty list reads as a hold while preserving
 * nobody, so it is refused here as well as by 0261's constraint.
 */
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

/**
 * Releases a hold. Returns null when the id does not belong to this
 * organization or is already released, so a caller cannot use the endpoint to
 * probe which hold ids exist elsewhere.
 */
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

/**
 * Deletes workspace conversations past the organization's retention window.
 *
 * THE SAFETY PROPERTY, stated once so it is not diluted by the code below:
 * this function fails CLOSED. If the hold set cannot be established, nothing is
 * deleted and the refusal is recorded as `aborted`. A missed sweep costs a day
 * of retention drift and is corrected on the next run. A sweep that deletes
 * records under legal hold destroys evidence, cannot be undone, and is the kind
 * of failure that ends an enterprise relationship. The asymmetry is total, so
 * every uncertain path here declines to delete.
 *
 * Retention runs from `updated_at`, not `created_at`: an old conversation
 * someone is still working in has not been dormant for the retention window,
 * and deleting it would read as data loss rather than as policy.
 *
 * Requires a privileged connection. The application role has SELECT only on the
 * hold and sweep tables by design (0138), an organization must not be able to
 * edit the record of what was held or what was deleted.
 */
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

  // No policy row means ungoverned, not governed-by-defaults. A recorded window
  // on a plan that sells enterprise controls is a commitment rather than an
  // owner's preference, so it is swept whether or not anyone opted in.
  const enforcement = retentionEnforcement({
    plan: policy ? await resolveOrganizationEntitlementPlan(organizationId) : null,
    retentionDays: policy?.retention_days ?? null,
    retentionEnforced: policy?.retention_enforced ?? false,
  });
  if (!policy || (!enforcement.enforced && !enforcement.required)) {
    return { organizationId, outcome: 'not_enforced' };
  }

  const retentionDays = policy.retention_days;
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

  let holds: LegalHold[];
  try {
    holds = await listLegalHolds(db, organizationId);
  } catch (error) {
    const result: RetentionSweepResult = {
      ...base,
      outcome: 'aborted',
      error: `Legal holds could not be read, so nothing was deleted: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
    // Best effort: if even the evidence write fails there is nothing further to
    // do but surface the refusal to the caller, which is the important half.
    await recordSweep(db, result).catch(() => undefined);
    return result;
  }

  // The sweep deletes conversations, so only a hold that names the conversation
  // store suspends it. A hold narrowed to files does not keep chat alive.
  const conversationHolds = holds.filter((hold) => holdCovers(hold, 'conversation'));
  const organizationHold = conversationHolds.some((hold) => hold.scope === 'organization');
  const heldUserIds = Array.from(new Set(conversationHolds.flatMap(heldSubjects)));

  if (organizationHold) {
    const result: RetentionSweepResult = {
      ...base,
      outcome: 'held',
      activeHolds: holds.length,
      error: 'An organization-wide legal hold is active. No conversation was deleted.',
    };
    await recordSweep(db, result);
    return result;
  }

  try {
    const heldCountRows = await db.query<{ count: number }>(
      `select count(*)::int as count
         from public.web_conversations
        where organization_id = $1
          and updated_at < $2
          and user_id = any($3::text[])`,
      [organizationId, cutoff, heldUserIds],
    );
    const conversationsHeld = heldCountRows[0]?.count ?? 0;

    if (dryRun) {
      const dueRows = await db.query<{ count: number }>(
        `select count(*)::int as count
           from public.web_conversations
          where organization_id = $1
            and updated_at < $2
            and not (user_id = any($3::text[]))`,
        [organizationId, cutoff, heldUserIds],
      );
      const due = dueRows[0]?.count ?? 0;
      const result: RetentionSweepResult = {
        ...base,
        outcome: due > 0 ? 'deleted' : 'nothing_due',
        conversationsHeld,
        activeHolds: holds.length,
        // A dry run reports what it WOULD remove; the table constraint keeps
        // that out of the deleted column so the evidence stays honest.
        error: `Dry run: ${due} conversation(s) would be deleted, ${conversationsHeld} withheld by legal hold.`,
      };
      await recordSweep(db, result);
      return result;
    }

    // Batched rather than one unbounded DELETE: the statement stays small
    // enough not to hold locks on the table that serves live chat, and the loop
    // stops as soon as a batch comes back short, so a quiet workspace costs one
    // query rather than ten.
    let totalDeleted = 0;
    let remaining = false;
    for (let batch = 0; batch < RETENTION_SWEEP_MAX_BATCHES; batch++) {
      const deleted = await db.query<{ id: string }>(
        `delete from public.web_conversations
          where id in (
            select id from public.web_conversations
             where organization_id = $1
               and updated_at < $2
               and not (user_id = any($3::text[]))
             limit $4
          )
          returning id`,
        [organizationId, cutoff, heldUserIds, RETENTION_SWEEP_BATCH],
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
      activeHolds: holds.length,
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
      activeHolds: holds.length,
      error: error instanceof Error ? error.message : String(error),
    };
    await recordSweep(db, result).catch(() => undefined);
    return result;
  }
}

/**
 * Least-recently-swept organization first, not lowest id first.
 *
 * The caller takes a fixed prefix of this list. Ordered by `organization_id`,
 * the same head was swept every night forever and nothing past the cap was ever
 * deleted, while the cron reported success, so the retention promise was
 * quietly untrue for every workspace behind it. The evidence table already
 * records every real sweep, so it is the ordering key; dry runs are excluded
 * because a manual `?dryRun=1` must not push a workspace to the back of the
 * queue without deleting anything.
 */
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

/**
 * The sweep already knows it stopped short of the cutoff; until now only its
 * own log said so. An administrator who switched retention on and is waiting
 * for it to take effect needs the size of what is left and when it clears.
 *
 * The estimate is built from the interval between this workspace's own last two
 * real sweeps, not from the cron's schedule: the schedule is configuration this
 * service cannot read, and an observed cadence is also the one that survives a
 * run being skipped.
 */
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

  const holds = (await listLegalHolds(db, organizationId)).filter((hold) =>
    holdCovers(hold, 'conversation'),
  );
  const organizationHold = holds.some((hold) => hold.scope === 'organization');
  const heldUserIds = Array.from(new Set(holds.flatMap(heldSubjects)));

  const [counts] = await db.query<{ pending: string | number; held: string | number }>(
    `select count(*) filter (where not (user_id = any($3::text[])))::int as pending,
            count(*) filter (where user_id = any($3::text[]))::int as held
       from public.web_conversations
      where organization_id = $1
        and updated_at < $2`,
    [organizationId, cutoff, heldUserIds],
  );

  const due = Number(counts?.pending ?? 0);
  const memberHeld = Number(counts?.held ?? 0);
  const pendingDeletions = organizationHold ? 0 : due;
  const heldFromDeletion = organizationHold ? due + memberHeld : memberHeld;

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
