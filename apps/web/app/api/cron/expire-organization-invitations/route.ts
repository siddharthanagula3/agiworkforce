import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { expirePendingInvitations } from '@/lib/services/organization-invitation-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();

  try {
    const expired = await expirePendingInvitations(db);
    if (expired > 0) {
      logger.info({ expired }, 'Expired lapsed organization invitations and released their seats');
    }
    return NextResponse.json({ expired });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Organization invitation expiry cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
