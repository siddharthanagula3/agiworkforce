import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  expireDuePurchasedCredits,
  remindExpiringPurchasedCredits,
} from '@/lib/services/purchased-credit-expiry-service';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_REMINDERS_PER_RUN = 500;
const MAX_USERS_PER_RUN = 500;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized purchased credit expiry cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getNeonDb();
    const reminders = await remindExpiringPurchasedCredits(db, MAX_REMINDERS_PER_RUN);
    const expiry = await expireDuePurchasedCredits(db, MAX_USERS_PER_RUN);
    const summary = { reminders, expiry };
    if (reminders.remaining || expiry.remaining) {
      logger.warn(summary, 'Purchased credit expiry hit its per-run ceiling');
    }
    if (reminders.failed > 0 || expiry.failed > 0) {
      logger.error(summary, 'Purchased credit expiry failed for some accounts');
    }
    logger.info(summary, 'Purchased credit expiry completed');
    return NextResponse.json(summary);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Purchased credit expiry cron failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
