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

export function isRetentionSweepEnabled(input: {
  retentionDays: number | null;
  retentionEnforced: boolean;
}): boolean {
  return input.retentionDays !== null && input.retentionEnforced;
}

/**
 * `required` is what a plan that sells enterprise controls commits to and
 * `enforced` is what the nightly sweep deletes against. The sweep acts on
 * `enforced` alone, so a gap between them is reported rather than swept.
 */
export function retentionEnforcement(input: {
  plan: string | null | undefined;
  retentionDays: number | null;
  retentionEnforced: boolean;
}): RetentionEnforcementDecision {
  if (input.retentionDays === null) {
    return { enforced: false, required: false, reason: 'no-policy' };
  }
  const enforced = isRetentionSweepEnabled(input);
  const required = canUseBillingPlanCapability(input.plan, 'enterprise_controls');
  if (required) {
    return enforced
      ? { enforced, required, reason: 'required-and-enforced' }
      : { enforced, required, reason: 'required-not-yet-enforced' };
  }
  return enforced
    ? { enforced, required, reason: 'opted-in' }
    : { enforced, required, reason: 'not-required' };
}

/**
 * Every workspace that recorded a retention window, enforced or not. Callers
 * select the ones to sweep with `isRetentionSweepEnabled`, never with a filter
 * of their own.
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
