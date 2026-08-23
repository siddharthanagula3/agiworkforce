import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  isSwept,
  listOrganizationsWithRetentionEnforced,
  sweepOrganizationRetention,
  type RetentionSweep,
} from '@/lib/services/retention-service';

export const runtime = 'nodejs';

/** Bounded per run so one night's work cannot exceed the function timeout. */
const MAX_ORGANIZATIONS_PER_RUN = 50;

/**
 * Deletes workspace conversations past each organization's retention window.
 *
 * Only organizations that explicitly set `retention_enforced` are considered —
 * `listOrganizationsWithRetentionEnforced` filters on it, and
 * `sweepOrganizationRetention` re-checks rather than trusting the caller. An
 * organization that never opted in is never touched, whatever a bug upstream
 * decides.
 *
 * Runs on the privileged connection because it deletes across every member of
 * a workspace and writes the sweep record, which the application role is
 * deliberately denied (0138): an organization must not be able to edit the
 * evidence of what was deleted on its behalf.
 *
 * `?dryRun=1` reports what would be removed without removing it. Use it to
 * confirm the blast radius before an organization turns enforcement on.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized workspace retention cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  const db = getNeonDb();

  let organizationIds: string[];
  try {
    organizationIds = await listOrganizationsWithRetentionEnforced(db);
  } catch (error) {
    logger.error({ error }, 'Retention sweep could not list organizations; nothing was deleted');
    return NextResponse.json({ error: 'Retention sweep unavailable' }, { status: 503 });
  }

  const scheduled = organizationIds.slice(0, MAX_ORGANIZATIONS_PER_RUN);
  const deferred = organizationIds.length - scheduled.length;
  const results: RetentionSweep[] = [];

  // Sequential on purpose. These are DELETEs across shared tables; running the
  // whole tenant list concurrently trades a slower job for lock contention on
  // the hot path that serves live traffic.
  for (const organizationId of scheduled) {
    try {
      const result = await sweepOrganizationRetention(db, organizationId, { dryRun });
      results.push(result);

      if (isSwept(result) && result.outcome !== 'nothing_due') {
        await recordAuditEvent({
          userId: 'system',
          eventType: 'retention_sweep_completed',
          organizationId,
          outcome: result.outcome === 'deleted' ? 'success' : 'failure',
          severity: result.outcome === 'deleted' ? 'warning' : 'critical',
          detail: {
            resourceType: 'organization_retention',
            resourceId: organizationId,
            status: result.outcome,
            deleted: result.conversationsDeleted,
            held: result.conversationsHeld,
            dryRun: result.dryRun,
          },
        }).catch((error) => {
          logger.error({ error, organizationId }, 'Retention sweep audit write failed');
        });
      }
    } catch (error) {
      // One organization's failure must not stop the rest. The per-org path
      // already records its own failure row; this catches anything above it.
      logger.error({ error, organizationId }, 'Retention sweep threw for one organization');
      results.push({
        organizationId,
        outcome: 'failed',
        retentionDays: 0,
        cutoff: new Date().toISOString(),
        conversationsDeleted: 0,
        conversationsHeld: 0,
        activeHolds: 0,
        dryRun,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const swept = results.filter(isSwept);
  const summary = {
    dryRun,
    organizationsConsidered: organizationIds.length,
    organizationsSwept: scheduled.length,
    organizationsDeferred: deferred,
    conversationsDeleted: swept.reduce((sum, r) => sum + r.conversationsDeleted, 0),
    conversationsHeld: swept.reduce((sum, r) => sum + r.conversationsHeld, 0),
    aborted: swept.filter((r) => r.outcome === 'aborted').length,
    held: swept.filter((r) => r.outcome === 'held').length,
    failed: swept.filter((r) => r.outcome === 'failed').length,
  };

  logger.info(summary, 'Workspace retention sweep completed');
  return NextResponse.json(summary);
}
