import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { CreditService } from '@/lib/services/credit-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Returns the quota held by a reservation whose turn is gone.
 *
 * `recover_stale_managed_usage_requests` was written for a per-minute caller,
 * and its own comment in migration 0056 says so. Its only scheduled caller was
 * `reconcile-credits`, which runs once a day: a reservation that went stale
 * just after that sweep held its quota for close to 24 hours, and a backlog
 * above the 500-row cap drained a day at a time. The visible symptom is a user
 * who sent a few messages being told their rolling limit is reached.
 *
 * Splitting it out leaves daily accounting where it belongs. Stripe
 * reconciliation and the COGS import are once-a-day work against a third
 * party; releasing a stranded reservation is a promise about how fast a user
 * gets their quota back, which is why this sits with the other reapers rather
 * than with the ledger.
 *
 * Ordering: this only became safe once the lease renewed while a turn was
 * running (AGI-1, migration 0178). Before that, raising the cadence would have
 * turned a once-daily misfire on live turns into a frequent one.
 *
 * `processPendingSettlements` is the single call that does both halves:
 * `process_credit_settlement_queue` invokes recovery first, then drains the
 * jobs recovery enqueued, so the refund lands in the same sweep that found the
 * stranded row. Overlapping with the daily drain is safe: both take rows with
 * `for update skip locked`, and settlement is idempotent by key.
 */
const RECOVERY_DRAIN_BATCH = 500;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized reservation recovery cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await CreditService.processPendingSettlements(
      RECOVERY_DRAIN_BATCH,
      getNeonDb(),
    );
    if (summary.processed > 0) {
      logger.info(
        { event: 'managed_usage_reservation_recovery', ...summary },
        'Drained stranded managed usage reservations',
      );
    }
    if (summary.processed >= RECOVERY_DRAIN_BATCH) {
      logger.warn(
        { event: 'managed_usage_reservation_recovery_saturated', ...summary },
        'Reservation recovery filled its batch; a backlog remains for the next sweep',
      );
    }
    return NextResponse.json(summary);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Reservation recovery cron failed',
    );
    return NextResponse.json({ error: 'Reservation recovery failed' }, { status: 500 });
  }
}
