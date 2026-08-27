import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  drainAuditDestination,
  listStreamingOrganizations,
  type DrainResult,
} from '@/lib/services/audit-streaming-service';

export const runtime = 'nodejs';

/** Bounded per run so one crowded minute cannot exceed the function timeout. */
const MAX_DESTINATIONS_PER_RUN = 25;

/**
 * Delivers new audit events to each workspace's SIEM.
 *
 * Drained here rather than written inline on the audit path: delivering during
 * an audited action would couple every policy change to a customer endpoint
 * being up, and an unreachable SIEM must never stop the thing it is meant to
 * record.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized audit stream drain request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  const results: DrainResult[] = [];

  // Sequential: each delivery is an outbound request to a third party, and
  // fanning them out would let one slow endpoint's timeout overlap with every
  // other workspace's.
  for (const organizationId of scheduled) {
    try {
      results.push(await drainAuditDestination(db, organizationId));
    } catch (error) {
      logger.error({ error, organizationId }, 'Audit stream drain threw for one destination');
      results.push({
        organizationId,
        delivered: 0,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = {
    destinationsConsidered: organizationIds.length,
    destinationsDrained: scheduled.length,
    destinationsDeferred: organizationIds.length - scheduled.length,
    eventsDelivered: results.reduce((sum, r) => sum + r.delivered, 0),
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
  };

  // Deferral is normal for one busy run and a compliance problem if it
  // persists: the list rotates by staleness, so a standing backlog means the
  // per-run cap is below the real destination count and some SIEM is
  // permanently behind.
  if (summary.destinationsDeferred > 0) {
    logger.warn(summary, 'Audit stream drain deferred destinations · raise the per-run cap');
  }
  logger.info(summary, 'Audit stream drain completed');
  return NextResponse.json(summary);
}
