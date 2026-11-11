import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
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
  select id
    from public.organizations
   where deletion_scheduled_for is not null
     and deletion_scheduled_for <= now()
     and not (id = any($1::uuid[]))
   order by deletion_last_attempt_at asc nulls first, deletion_scheduled_for asc, id asc
   limit ${ORGANIZATIONS_PER_PAGE}
`;

const STAMP_ATTEMPT = `
  update public.organizations
     set deletion_last_attempt_at = now()
   where id = $1::uuid
     and deletion_scheduled_for is not null
`;

interface DueOrganization {
  id: string;
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

async function stampAttempt(db: DatabaseAdapter, organizationId: string): Promise<void> {
  try {
    await db.query(STAMP_ATTEMPT, [organizationId]);
  } catch (error) {
    logger.error(
      { organizationId, error: error instanceof Error ? error.message : String(error) },
      'Workspace purge could not record its attempt',
    );
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
  const attempted: string[] = [];
  let budgetSpent = false;

  while (!budgetSpent) {
    let page: DueOrganization[];
    try {
      page = await db.query<DueOrganization>(DUE_ORGANIZATIONS_PAGE, [[...attempted]]);
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
      attempted.push(organizationId);
      await stampAttempt(db, organizationId);
      const outcome = await purgeOrganization(organizationId);
      if (outcome === 'purged') purged++;
      else if (outcome === 'held') held++;
      else failed++;
    }

    if (page.length < ORGANIZATIONS_PER_PAGE) break;
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
