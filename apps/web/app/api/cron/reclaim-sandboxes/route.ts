import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { reclaimAbandonedE2BSandboxes } from '@/lib/e2b/reclaim';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GOV-6: reclaim managed sandboxes that nothing can reach any more.
 *
 * Conversation-scoped sandboxes are paused rather than killed, and the Redis
 * mapping needed to resume one expires after 24h while `killE2BSession()` runs
 * only on explicit conversation delete. Without this job a paused sandbox
 * outlives its mapping and permanently occupies a slot in both the E2B team cap
 * and the owner's per-plan sandbox budget.
 */
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
