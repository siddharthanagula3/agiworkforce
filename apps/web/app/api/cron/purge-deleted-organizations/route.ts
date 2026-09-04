import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { eraseOrganizationData } from '@/lib/server/organization-erasure';
import { recordAuditEvent } from '@/lib/security-audit';
import { isMissingOrganizationDeletionColumns } from '@/lib/server/organization-deletion';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Bounded per run. Unlike the account purge queue, workspace deletion is an
 * owner-gated, paid-tier action, so the due list is small and a simple
 * oldest-scheduled-first order is enough: there is no equivalent of
 * `erasure_tombstones` rotating a queue too large for one run to clear.
 */
const MAX_ORGANIZATIONS_PER_RUN = 25;

const SWEEP_BUDGET_MS = 240_000;

const DUE_ORGANIZATIONS = `
  select id
    from public.organizations
   where deletion_scheduled_for is not null
     and deletion_scheduled_for <= now()
   order by deletion_scheduled_for asc
   limit ${MAX_ORGANIZATIONS_PER_RUN}
`;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();
  const startedAtMs = Date.now();

  let due: Array<{ id: string }> = [];
  let deletionColumnsProvisioned = true;
  try {
    due = await db.query<{ id: string }>(DUE_ORGANIZATIONS, []);
  } catch (error) {
    if (isMissingOrganizationDeletionColumns(error)) {
      deletionColumnsProvisioned = false;
      logger.warn('organizations.deletion_scheduled_for is not provisioned; nothing is due');
    } else {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Organization purge cron job failed to list due workspaces',
      );
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  let purged = 0;
  let held = 0;
  let failed = 0;
  let deferred = 0;

  for (const { id: organizationId } of due) {
    if (Date.now() - startedAtMs > SWEEP_BUDGET_MS) {
      deferred++;
      continue;
    }

    try {
      const report = await eraseOrganizationData(organizationId);

      if (report.blockedByLegalHold) {
        held++;
        await recordAuditEvent({
          userId: 'system',
          eventType: 'organization_deletion_blocked',
          organizationId,
          severity: 'critical',
          outcome: 'denied',
          detail: {
            resourceType: 'organization',
            resourceId: organizationId,
            reason: 'legal_hold',
            status: 'held',
          },
        });
        logger.warn({ organizationId }, 'Workspace purge blocked by an active legal hold');
        continue;
      }

      if (!report.complete) {
        failed++;
        await recordAuditEvent({
          userId: 'system',
          eventType: 'organization_deletion_blocked',
          organizationId,
          severity: 'critical',
          outcome: 'failure',
          detail: {
            resourceType: 'organization',
            resourceId: organizationId,
            reason: 'erasure_incomplete',
            status: 'retry',
          },
        });
        logger.error(
          { organizationId, report },
          'Workspace erasure incomplete; scheduled for a retry',
        );
        continue;
      }

      purged++;
      logger.info({ organizationId }, 'Scheduled workspace deletion completed');

      await recordAuditEvent({
        userId: null,
        eventType: 'organization_deletion_completed',
        severity: 'critical',
        detail: {
          resourceType: 'organization',
          resourceId: organizationId,
          status: 'purged',
        },
      });
    } catch (error) {
      failed++;
      logger.error(
        { organizationId, error: error instanceof Error ? error.message : String(error) },
        'Scheduled workspace deletion failed',
      );
    }
  }

  return NextResponse.json({
    message: deletionColumnsProvisioned
      ? 'Deleted workspace purge completed'
      : 'Workspace deletion columns are not provisioned',
    candidates: due.length,
    purged,
    held,
    failed,
    deferred,
  });
}
