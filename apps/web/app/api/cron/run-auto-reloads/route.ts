import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { lowPowerCronSkip } from '@/lib/server/cron-low-power';
import { sweepAutoReloads } from '@/lib/services/auto-reload-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SWEEP_BUDGET_MS = 240_000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized auto-reload cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lowPower = lowPowerCronSkip();
  if (lowPower) return lowPower;

  try {
    const report = await sweepAutoReloads(Date.now() + SWEEP_BUDGET_MS);
    if (!report.drained) {
      logger.warn(report, 'Auto-reload sweep ran out of budget before visiting every account');
    }
    logger.info(report, 'Auto-reload sweep completed');
    return NextResponse.json(report);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Auto-reload sweep failed',
    );
    return NextResponse.json({ error: 'Auto-reload sweep failed' }, { status: 500 });
  }
}
