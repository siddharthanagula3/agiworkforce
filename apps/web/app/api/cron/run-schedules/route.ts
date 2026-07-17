import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { processDueScheduleRuns } from '@/lib/services/schedule-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized scheduled-task cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await processDueScheduleRuns({
      limit: 10,
      // One wave must fit inside the 60-second serverless budget. Ten claims
      // at concurrency three could take four 40-second waves.
      concurrency: 10,
      timeoutMs: 40_000,
    });
    return NextResponse.json(summary);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Scheduled-task cron batch failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
