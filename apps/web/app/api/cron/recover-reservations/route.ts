import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { lowPowerCronSkip } from '@/lib/server/cron-low-power';
import { getNeonDb } from '@/lib/server/neon-db';
import { CreditService } from '@/lib/services/credit-service';
import { releaseExpiredFreeTrialReservations } from '@/lib/services/free-trial-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { getVoiceLiveBackendModel } from '@agiworkforce/types';
import { settleAbandonedVoiceSessions } from '@/app/api/voice/live/sessions/lib/voice-session-settlement';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Returns the quota held by a reservation whose turn is gone, at reaper cadence
 * rather than with the once-a-day ledger work: how fast a user gets a stranded
 * reservation back is how soon a rolling limit stops refusing them.
 *
 * Ordering: this is safe at a high cadence only because the lease renews while
 * a turn is running (migration 0178); without that, every sweep would misfire
 * on live turns.
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

  const lowPower = lowPowerCronSkip();
  if (lowPower) return lowPower;

  try {
    const db = getNeonDb();
    const voice = await settleAbandonedVoiceSessions({
      db,
      userId: null,
      claimOwner: true,
      limit: RECOVERY_DRAIN_BATCH,
      backendModelFor: async (record) =>
        getVoiceLiveBackendModel((await resolveEntitlementBundle(db, record.userId)).plan),
    });
    if (voice > 0) {
      logger.info(
        { event: 'voice_abandoned_session_recovery', settled: voice },
        'Settled abandoned voice sessions a lease past their last check-in',
      );
    }
    const summary = await CreditService.processPendingSettlements(RECOVERY_DRAIN_BATCH, db);
    const free = await releaseExpiredFreeTrialReservations(db, RECOVERY_DRAIN_BATCH);
    if (free.released > 0) {
      logger.info(
        { event: 'free_usage_reservation_recovery', ...free },
        'Released expired Free usage reservations',
      );
    }
    if (free.released >= RECOVERY_DRAIN_BATCH) {
      logger.warn(
        { event: 'free_usage_reservation_recovery_saturated', ...free },
        'Free reservation recovery filled its batch; a backlog remains for the next sweep',
      );
    }
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
    return NextResponse.json({ ...summary, free, voice });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Reservation recovery cron failed',
    );
    return NextResponse.json({ error: 'Reservation recovery failed' }, { status: 500 });
  }
}
