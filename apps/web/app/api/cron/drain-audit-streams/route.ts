import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { enqueueJob } from '@/lib/jobs/job-service';
import {
  hasActiveAuditStreamDestinations,
  listStreamingOrganizations,
} from '@/lib/services/audit-streaming-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Bounded per run so one crowded minute cannot queue an unbounded fan-out. */
const MAX_DESTINATIONS_PER_RUN = 25;

/** One delivery job per destination per sweep, whatever this run is retried. */
const SWEEP_BUCKET_MS = 30 * 60 * 1000;

/**
 * Queues a delivery of new audit events to each workspace's SIEM.
 *
 * Queued rather than written inline on the audit path: delivering during an
 * audited action would couple every policy change to a customer endpoint being
 * up, and an unreachable SIEM must never stop the thing it is meant to record.
 * The job model (0208) owns the retry, the backoff and the dead letter, so a
 * destination that fails is retried on its own schedule instead of inside this
 * run's budget.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized audit stream drain request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasActiveDestinations = await hasActiveAuditStreamDestinations();
  if (hasActiveDestinations === false) {
    return NextResponse.json({
      destinationsConsidered: 0,
      destinationsQueued: 0,
      destinationsAlreadyQueued: 0,
      destinationsDeferred: 0,
      failed: 0,
      skippedDatabase: true,
    });
  }

  const db = getNeonDb();

  let organizationIds: string[];
  try {
    organizationIds = await listStreamingOrganizations(db);
  } catch (error) {
    logger.error({ error }, 'Audit stream drain could not list destinations');
    return NextResponse.json({ error: 'Audit streaming unavailable' }, { status: 503 });
  }

  const scheduled = organizationIds.slice(0, MAX_DESTINATIONS_PER_RUN);
  const bucket = Math.floor(Date.now() / SWEEP_BUCKET_MS);
  let queued = 0;
  let alreadyQueued = 0;
  let failed = 0;

  for (const organizationId of scheduled) {
    try {
      const job = await enqueueJob(db, {
        kind: 'webhooks.audit-stream-delivery',
        organizationId,
        idempotencyKey: `audit-stream:${organizationId}:${bucket}`,
        payload: { organizationId },
      });
      if (job.created) queued += 1;
      else alreadyQueued += 1;
    } catch (error) {
      failed += 1;
      logger.error({ error, organizationId }, 'Audit stream delivery could not be queued');
    }
  }

  const summary = {
    destinationsConsidered: organizationIds.length,
    destinationsQueued: queued,
    destinationsAlreadyQueued: alreadyQueued,
    destinationsDeferred: organizationIds.length - scheduled.length,
    failed,
  };

  // Deferral is normal for one busy run and a compliance problem if it
  // persists: the list rotates by staleness, so a standing backlog means the
  // per-run cap is below the real destination count and some SIEM is
  // permanently behind.
  if (summary.destinationsDeferred > 0) {
    logger.warn(summary, 'Audit stream drain deferred destinations · raise the per-run cap');
  }
  logger.info(summary, 'Audit stream deliveries queued');
  return NextResponse.json(summary);
}
