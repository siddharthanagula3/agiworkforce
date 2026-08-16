import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { PLATFORM_SCHEDULE_RUNS_PER_SWEEP } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { processDueScheduleRuns } from '@/lib/services/schedule-service';
import type { ScheduleBatchSummary } from '@/lib/services/schedule-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

const WAVE_CLAIM_LIMIT = 10;

const WAVE_TIMEOUT_MS = 40_000;

const SWEEP_BUDGET_MS = 55_000;

const MAX_WAVES = Math.ceil(PLATFORM_SCHEDULE_RUNS_PER_SWEEP / WAVE_CLAIM_LIMIT);

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized scheduled-task cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const totals: ScheduleBatchSummary = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    timedOut: 0,
    cancelled: 0,
  };
  let waves = 0;
  let drained = false;

  try {
    while (waves < MAX_WAVES) {
      const remainingMs = SWEEP_BUDGET_MS - (Date.now() - startedAt);
      if (remainingMs < 1_000) break;

      const summary = await processDueScheduleRuns({
        limit: WAVE_CLAIM_LIMIT,
        concurrency: WAVE_CLAIM_LIMIT,
        timeoutMs: Math.min(WAVE_TIMEOUT_MS, remainingMs),
      });
      waves += 1;
      totals.claimed += summary.claimed;
      totals.succeeded += summary.succeeded;
      totals.failed += summary.failed;
      totals.timedOut += summary.timedOut;
      totals.cancelled += summary.cancelled;

      if (summary.claimed < WAVE_CLAIM_LIMIT) {
        drained = true;
        break;
      }
    }

    if (!drained) {
      logger.warn(
        { ...totals, waves, elapsedMs: Date.now() - startedAt },
        'Scheduled-task sweep ended with schedules still due',
      );
    }

    return NextResponse.json({ ...totals, waves, drained });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Scheduled-task cron batch failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
