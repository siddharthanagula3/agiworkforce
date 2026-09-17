import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { drainBackgroundJobs } from '@/lib/jobs/job-drain';
import { BACKGROUND_JOB_HANDLERS } from '@/lib/jobs/job-handlers';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';

export const runtime = 'nodejs';
export const maxDuration = 300;

const DRAIN_BUDGET_MS = 250_000;
const MAX_JOBS_IN_FLIGHT = 12;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized background job drain request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await drainBackgroundJobs({
      db: getNeonDb(),
      handlers: BACKGROUND_JOB_HANDLERS,
      budgetMs: DRAIN_BUDGET_MS,
      maxInFlight: MAX_JOBS_IN_FLIGHT,
    });
    if (!summary.drained) {
      logger.warn(summary, 'Background job drain ended with work still queued');
    }
    return NextResponse.json(summary);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Background job drain failed',
    );
    return NextResponse.json({ error: 'Background job drain failed' }, { status: 500 });
  }
}
