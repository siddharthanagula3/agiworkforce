import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { reapOrphanedCloudAgentRuns } from '@/lib/services/cloud-agent-run-reaper';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Ends cloud agent runs whose workflow invocation died before settling them.
 *
 * A settle is the only thing that transitions a run, and on 2026-09-07 nine
 * runs reached a state where no invocation could ever run it: the platform
 * killed each one mid-step, and the replay that followed died the same way.
 * They stayed at `running` for days and were cleared by hand.
 *
 * This is the backstop, not the fix. A run should settle itself; this exists
 * because a process that is killed runs no code, so some orphan will always be
 * possible.
 */
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
