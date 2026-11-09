import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { eraseOrganizationData } from '@/lib/server/organization-erasure';
import { recordAuditEvent } from '@/lib/security-audit';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ORGANIZATIONS_PER_PAGE = 25;

const SWEEP_BUDGET_MS = 240_000;

const DUE_ORGANIZATIONS_PAGE = `
  select id, deletion_scheduled_for::text as scheduled_for
    from public.organizations
   where deletion_scheduled_for is not null
     and deletion_scheduled_for <= now()
     and ($1::timestamptz is null or (deletion_scheduled_for, id) > ($1::timestamptz, $2::uuid))
   order by deletion_scheduled_for asc, id asc
   limit ${ORGANIZATIONS_PER_PAGE}
`;

interface DueOrganization {
  id: string;
  scheduled_for: string;
}

type PurgeOutcome = 'purged' | 'held' | 'failed';

async function purgeOrganization(organizationId: string): Promise<PurgeOutcome> {
  try {
    const report = await eraseOrganizationData(organizationId);

    if (report.blockedByLegalHold) {
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
      return 'held';
    }

    if (!report.complete) {
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
      return 'failed';
    }

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
    return 'purged';
  } catch (error) {
    logger.error(
      { organizationId, error: error instanceof Error ? error.message : String(error) },
      'Scheduled workspace deletion failed',
    );
    return 'failed';
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();
  const startedAtMs = Date.now();

  let candidates = 0;
  let purged = 0;
  let held = 0;
  let failed = 0;
  let deferred = 0;
  let cursor: DueOrganization | null = null;
  let budgetSpent = false;

  while (!budgetSpent) {
    let page: DueOrganization[];
    try {
      page = await db.query<DueOrganization>(DUE_ORGANIZATIONS_PAGE, [
        cursor?.scheduled_for ?? null,
        cursor?.id ?? null,
      ]);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Organization purge cron job failed to list due workspaces',
      );
      if (candidates === 0) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      break;
    }

    candidates += page.length;
    for (const { id: organizationId } of page) {
      if (budgetSpent || Date.now() - startedAtMs > SWEEP_BUDGET_MS) {
        budgetSpent = true;
        deferred++;
        continue;
      }
      const outcome = await purgeOrganization(organizationId);
      if (outcome === 'purged') purged++;
      else if (outcome === 'held') held++;
      else failed++;
    }

    if (page.length < ORGANIZATIONS_PER_PAGE) break;
    cursor = page[page.length - 1] ?? null;
  }

  return NextResponse.json({
    message: 'Deleted workspace purge completed',
    candidates,
    purged,
    held,
    failed,
    deferred,
  });
}
