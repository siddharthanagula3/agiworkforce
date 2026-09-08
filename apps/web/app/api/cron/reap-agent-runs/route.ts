import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { reapOrphanedCloudAgentRuns } from '@/lib/services/cloud-agent-run-reaper';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await reapOrphanedCloudAgentRuns(getNeonDb());
    if (report.reaped > 0) {
      logger.info({ ...report }, 'Reaped cloud agent runs whose invocation had ended');
    }
    return NextResponse.json(report);
  } catch (error) {
    logger.error({ error }, 'Cloud agent run reaper failed');
    return NextResponse.json({ error: 'Cloud agent run reaper failed' }, { status: 500 });
  }
}
