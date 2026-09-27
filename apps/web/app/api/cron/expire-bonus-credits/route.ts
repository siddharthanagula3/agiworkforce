import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { expireDueBonusCredits } from '@/lib/services/bonus-credit-service';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_USERS_PER_RUN = 500;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized bonus credit expiry cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await expireDueBonusCredits(getNeonDb(), MAX_USERS_PER_RUN);
    if (summary.remaining) {
      logger.warn(summary, 'Bonus credit expiry hit its per-run ceiling');
    }
    if (summary.failed > 0) {
      logger.error(summary, 'Bonus credit expiry failed for some accounts');
    }
    logger.info(summary, 'Bonus credit expiry completed');
    return NextResponse.json(summary);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Bonus credit expiry cron failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
