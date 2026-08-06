/**
 * GET /api/cron/expire-support-handoffs
 *
 * The enforcer that works when the browser is gone.
 *
 * The client honours `waitExpiresAt` — until the tab is backgrounded. The status
 * poll performs the transition — until the user closes the tab. Neither covers
 * the case that matters most: a user who asks for a human, gets no answer, and
 * walks away. Without this sweep their escalation would sit in `waiting`
 * forever and nobody would ever read it.
 *
 * It shares the same conditional UPDATE as the poll path, so the two compose:
 * whichever gets the row sends the email, the other sends nothing.
 *
 * Also closes `connected` sessions idle past AGI_SUPPORT_HANDOFF_IDLE_TIMEOUT_SECONDS
 * (a user who closed the tab mid-chat leaves a human talking to nobody) and
 * purges transcripts past AGI_SUPPORT_HANDOFF_RETENTION_DAYS.
 *
 * Registered in vercel.json at every 5 minutes.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { sweepExpiredHandoffs } from '@/lib/support/handoff/handoff-service';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized support handoff expiry cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await sweepExpiredHandoffs();
    if (summary.expiredEmailed > 0 || summary.idleClosed > 0) {
      logger.info(summary, 'Support handoff sweep completed');
    }
    return NextResponse.json(summary);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Support handoff expiry cron failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
