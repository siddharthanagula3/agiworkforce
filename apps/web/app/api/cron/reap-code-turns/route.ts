import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { reapStuckCloudCodeTurns } from '@/lib/services/cloud-code-turn-reaper';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Ends Code turns whose invocation died before it could write a terminal row.
 *
 * Nothing else ends them. The session's run lease expires on its own and the
 * managed-usage reservation is recovered by the reconcile-credits drain, but
 * the turn row itself stays at `running` with a null stop reason forever, which
 * is what a reader sees as a task that never finished and never failed.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await reapStuckCloudCodeTurns(getNeonDb());
    if (report.reaped > 0) {
      logger.info({ ...report }, 'Reaped Code turns whose run had ended');
    }
    return NextResponse.json(report);
  } catch (error) {
    logger.error({ error }, 'Code turn reaper failed');
    return NextResponse.json({ error: 'Code turn reaper failed' }, { status: 500 });
  }
}
