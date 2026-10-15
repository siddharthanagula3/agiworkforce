import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { lowPowerCronSkip } from '@/lib/server/cron-low-power';
import { getNeonDb } from '@/lib/server/neon-db';
import { notifyUpgradeWaitlist } from '@/lib/services/upgrade-waitlist-notice-service';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_NOTICES_PER_RUN = 100;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized upgrade waitlist notice cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lowPower = lowPowerCronSkip();
  if (lowPower) return lowPower;

  try {
    const summary = await notifyUpgradeWaitlist(getNeonDb(), MAX_NOTICES_PER_RUN);
    if (!summary.skipped && summary.emailChannel === 'not_configured') {
      logger.warn(
        summary,
        'Paid upgrades are open but RESEND_API_KEY and AGI_NOTIFICATIONS_FROM_EMAIL are not set; waitlisted accounts are told in the app only',
      );
    }
    if (summary.remaining) {
      logger.warn(summary, 'Upgrade waitlist notices hit their per-run ceiling');
    }
    if (summary.deferred > 0) {
      logger.warn(summary, 'Some upgrade waitlist emails wait for the next run');
    }
    logger.info(summary, 'Upgrade waitlist notices completed');
    return NextResponse.json(summary);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Upgrade waitlist notice cron failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
