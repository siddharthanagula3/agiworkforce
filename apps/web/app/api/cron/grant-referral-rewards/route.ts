import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { grantDueReferralRewards } from '@/lib/services/referral-service';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_REFERRALS_PER_RUN = 500;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized referral reward cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await grantDueReferralRewards(getNeonDb(), MAX_REFERRALS_PER_RUN);
    if (summary.remaining) {
      logger.warn(summary, 'Referral rewards hit their per-run ceiling');
    }
    if (summary.failed > 0) {
      logger.error(summary, 'Some referral rewards could not be settled');
    }
    logger.info(summary, 'Referral rewards settled');
    return NextResponse.json(summary);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Referral reward cron failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
