import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { PLATFORM_SCHEDULE_RUNS_PER_SWEEP } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { processDueScheduleRuns } from '@/lib/services/schedule-service';
import type { ScheduleBatchSummary } from '@/lib/services/schedule-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Rows one wave claims; `processDueScheduleRuns` clamps its concurrency here too. */
const WAVE_CLAIM_LIMIT = 10;

/** Longest a single claimed run may occupy a worker. */
const WAVE_TIMEOUT_MS = 40_000;

/**
 * Wall clock the waves may share, leaving the rest of `maxDuration` for the
 * summary response. A wave that would start below `WAVE_TIMEOUT_MS` of remaining
 * budget still runs, with its per-run timeout cut to what is left, so no wave can
 * push the invocation past its limit and lose the batch entirely.
 */
const SWEEP_BUDGET_MS = 55_000;

/**
 * A single ten-row batch per day is an order of magnitude below what the tier
 * quotas in `PLATFORM_SCHEDULE_RUNS_PER_SWEEP` sell, so the sweep drains in waves
 * until the queue empties, the budget is spent, or that ceiling is reached.
 */
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
      // Below a second there is no room for even a trivial run to finalize, and
      // claiming rows we cannot finish would only park them behind a lease.
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

    // A sweep that stops with work still due is the backlog symptom the quotas
    // are sized to avoid, so it is worth a line in the logs rather than a silent
    // 200 that looks identical to an empty queue.
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
