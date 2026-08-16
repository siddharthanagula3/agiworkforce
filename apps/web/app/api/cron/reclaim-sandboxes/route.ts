import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { reclaimAbandonedE2BSandboxes } from '@/lib/e2b/reclaim';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await reclaimAbandonedE2BSandboxes();
    logger.info(report, 'Sandbox reclaim completed');
    return NextResponse.json({ message: 'Sandbox reclaim completed', ...report });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Sandbox reclaim cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
