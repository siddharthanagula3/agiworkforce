import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { purgeExpiredSecurityAuditLogs } from '@/lib/server/security-log-retention';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized security audit log retention cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const run = await purgeExpiredSecurityAuditLogs('cron');

    if (run.retentionHolds) {
      logger.info(run, 'Security audit log retention purge completed');
    } else {
      logger.error(run, 'Security audit log retention purge left rows past the retention window');
    }

    return NextResponse.json(run);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Security audit log retention cron failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
