import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { expirePendingInvitations } from '@/lib/services/organization-invitation-service';

export const runtime = 'nodejs';

const PG_UNDEFINED_TABLE = '42P01';

function isMissingInvitationTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE;
}

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
    if (isMissingInvitationTable(error)) {
      logger.warn('public.organization_invitations is not provisioned; nothing to expire');
      return NextResponse.json({
        message: 'Organization invitations are not provisioned',
        expired: 0,
      });
    }
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Organization invitation expiry cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
