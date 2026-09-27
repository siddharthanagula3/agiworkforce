import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { expireEndedCodeTrials } from '@/lib/services/code-trial-expiry';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_LIMIT = 200;
const MAX_BATCHES_PER_RUN = 10;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();
  let expired = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const trials = await expireEndedCodeTrials(db, new Date(), BATCH_LIMIT);
      for (const trial of trials) {
        await recordAuditEvent({
          userId: trial.userId,
          eventType: 'plan_changed',
          endpoint: '/api/cron/expire-code-trials',
          surface: 'cron',
          detail: {
            resourceType: 'subscription',
            previousPlanTier: trial.previousPlanTier,
            planTier: 'free',
            source: 'code_trial_expiry',
            status: 'canceled',
          },
        });
      }
      expired += trials.length;
      if (trials.length < BATCH_LIMIT) break;
    }

    logger.info({ expired }, 'Ended code-granted trials whose period is over');
    return NextResponse.json({ expired });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), expired },
      'Code trial expiry cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
