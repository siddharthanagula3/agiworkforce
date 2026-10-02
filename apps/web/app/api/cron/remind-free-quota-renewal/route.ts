import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { isProductionRuntime } from '@/lib/config/runtime-environment';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { remindFreeQuotaRenewals } from '@/lib/server/free-quota-renewal';

export const runtime = 'nodejs';

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized free quota renewal cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const run = await remindFreeQuotaRenewals(Date.now());
    if (!run.checked) {
      if (isProductionRuntime() && !run.missing.includes('inventory')) {
        logger.error(
          { event: 'free_quota_renewal_unconfigured', missing: run.missing },
          'Every free quota model is off: this production deployment lacks the provider key or shared store they need',
        );
        return NextResponse.json(run, { status: 500 });
      }
      logger.info(
        { event: 'free_quota_renewal_skipped', missing: run.missing },
        'Free quota renewal check finished',
      );
      return NextResponse.json(run);
    }
    if (run.reminders.some((reminder) => reminder.outcome === 'undelivered')) {
      logger.error(
        { event: 'free_quota_renewal_undelivered', reminders: run.reminders },
        'Free quota renewal check could not tell anyone; the next run tries again',
      );
      return NextResponse.json(run, { status: 500 });
    }
    logger.info(
      { event: 'free_quota_renewal_checked', reminders: run.reminders },
      'Free quota renewal check finished',
    );
    return NextResponse.json(run);
  } catch (error) {
    logger.error(
      {
        event: 'free_quota_renewal_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Free quota renewal check failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
