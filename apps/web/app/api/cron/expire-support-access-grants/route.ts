import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { expireStaleSupportAccessGrants } from '@/lib/server/support-access-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { expired, failed, more } = await expireStaleSupportAccessGrants(getNeonDb());
    if (failed > 0) {
      logger.error(
        { expired, failed, more },
        'Support access grant expiry left grants approved in the database; the next run retries them',
      );
      return NextResponse.json(
        { error: 'Some grants could not be closed', expired, failed, more },
        { status: 500 },
      );
    }
    if (more) {
      logger.warn(
        { expired },
        'Support access grant expiry stopped at its batch size with grants left',
      );
    } else if (expired > 0) {
      logger.info({ expired }, 'Closed lapsed support access grants and recorded their expiry');
    }
    return NextResponse.json({ expired, failed, more });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Support access grant expiry cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
