import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import { remindConvertingTrials } from '@/lib/services/trial-reminder-service';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_REMINDERS_PER_RUN = 100;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized trial reminder cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripe = getStripeClientOrNull();
  if (!stripe) {
    logger.warn('STRIPE_SECRET_KEY is not set; no trial reminders were sent');
    return NextResponse.json({ reminded: 0, reason: 'stripe_not_configured' });
  }

  try {
    const summary = await remindConvertingTrials(getNeonDb(), stripe, MAX_REMINDERS_PER_RUN);
    if (summary.remaining) {
      logger.warn(summary, 'Trial reminders hit their per-run ceiling');
    }
    if (summary.failed > 0) {
      logger.error(summary, 'Trial reminders failed for some accounts');
    }
    logger.info(summary, 'Trial reminders completed');
    return NextResponse.json(summary);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Trial reminder cron failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
