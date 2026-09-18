import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { canUseBillingPlanCapability } from '@agiworkforce/types';

export type RetentionEnforcementReason =
  'no-policy' | 'not-required' | 'opted-in' | 'required-not-yet-enforced' | 'required-and-enforced';

export interface RetentionEnforcementDecision {
  /** What the nightly sweep deletes against today. */
  enforced: boolean;
  /** What the plan commits to, whether or not an owner opted in. */
  required: boolean;
  reason: RetentionEnforcementReason;
}

export interface RetentionPolicyRow {
  organizationId: string;
  retentionDays: number | null;
  retentionEnforced: boolean;
}

/**
 * A workspace on a plan that sells enterprise controls has a contractual
 * retention commitment, so its recorded window is not an owner's preference.
 * `required` is that commitment and `enforced` is what the sweep does, and the
 * two are reported separately because a gap between them is the thing an
 * auditor is entitled to see rather than have smoothed over.
 */
export function retentionEnforcement(input: {
  plan: string | null | undefined;
  retentionDays: number | null;
  retentionEnforced: boolean;
}): RetentionEnforcementDecision {
  if (input.retentionDays === null) {
    return { enforced: false, required: false, reason: 'no-policy' };
  }
  const required = canUseBillingPlanCapability(input.plan, 'enterprise_controls');
  if (required) {
    return input.retentionEnforced
      ? { enforced: true, required: true, reason: 'required-and-enforced' }
      : { enforced: false, required: true, reason: 'required-not-yet-enforced' };
  }
  return input.retentionEnforced
    ? { enforced: true, required: false, reason: 'opted-in' }
    : { enforced: false, required: false, reason: 'not-required' };
}

/**
 * The workspaces a run must cover: every one that recorded a window and either
 * opted in or is required to enforce by its plan.
 */
export function mandatoryRetentionWorkspaces(
  rows: readonly RetentionPolicyRow[],
  planOf: (organizationId: string) => string | null | undefined,
): string[] {
  return rows
    .filter((row) => {
      const decision = retentionEnforcement({
        plan: planOf(row.organizationId),
        retentionDays: row.retentionDays,
        retentionEnforced: row.retentionEnforced,
      });
      return decision.enforced || decision.required;
    })
    .map((row) => row.organizationId);
}

/**
 * Every workspace that recorded a retention window, opted in or not. The job
 * decides per organization with `retentionEnforcement`, so a workspace that
 * must be swept cannot be missed by a query that only looks at the flag.
 */
export async function listOrganizationsWithRetentionPolicy(
  db: DatabaseAdapter,
): Promise<RetentionPolicyRow[]> {
  const rows = await db.query<{
    organization_id: string;
    retention_days: number | string | null;
    retention_enforced: boolean;
  }>(
    `select policy.organization_id, policy.retention_days, policy.retention_enforced
       from public.organization_admin_policies policy
       left join lateral (
         select max(sweep.created_at) as last_swept_at
           from public.organization_retention_sweeps sweep
          where sweep.organization_id = policy.organization_id
            and sweep.dry_run = false
       ) last_sweep on true
      where policy.retention_days is not null
      order by last_sweep.last_swept_at asc nulls first, policy.organization_id`,
    [],
  );
  return rows.map((row) => ({
    organizationId: row.organization_id,
    retentionDays:
      row.retention_days === null
        ? null
        : typeof row.retention_days === 'string'
          ? Number.parseInt(row.retention_days, 10)
          : row.retention_days,
    retentionEnforced: row.retention_enforced,
  }));
}

export class MandatoryRetentionSkipped extends Error {
  readonly organizationIds: string[];

  constructor(organizationIds: string[]) {
    super(
      `Retention is mandatory for ${organizationIds.length} workspace(s) that this run did not sweep.`,
    );
    this.name = 'MandatoryRetentionSkipped';
    this.organizationIds = organizationIds;
  }
}

/**
 * A run that leaves a mandatory workspace unswept is a failed run, not a
 * shorter one. Deferring it to the next run is fine, silently dropping it is
 * the failure the commitment is written against.
 */
export function assertNoMandatoryWorkspaceDropped(input: {
  mandatory: readonly string[];
  swept: readonly string[];
  deferred: readonly string[];
}): void {
  const accounted = new Set([...input.swept, ...input.deferred]);
  const dropped = input.mandatory.filter((id) => !accounted.has(id));
  if (dropped.length > 0) throw new MandatoryRetentionSkipped(dropped);
}
