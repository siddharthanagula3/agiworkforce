import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { lowPowerCronSkip } from '@/lib/server/cron-low-power';
import { getNeonDb } from '@/lib/server/neon-db';
import { refreshLiveArtifacts } from './refresh-live-artifacts';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized live artifact refresh cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lowPower = lowPowerCronSkip();
  if (lowPower) return lowPower;

  try {
    const summary = await refreshLiveArtifacts(getNeonDb());
    logger.info(summary, 'Live artifact readiness refreshed');
    return NextResponse.json(summary);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Live artifact refresh cron failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
