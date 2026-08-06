import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { expirePendingInvitations } from '@/lib/services/organization-invitation-service';

/**
 * A pending invitation HOLDS a licensed seat (0085 trigger on
 * `organization_invitations`). If nothing ever flips a lapsed invitation to
 * 'expired', that seat is never returned and a team silently locks itself out
 * of the seats it paid for.
 *
 * The invite/add-member paths already expire lapsed rows lazily inside the
 * transaction that is about to consume a seat, so a dead invitation can never
 * block a live one. This job is the durable half: it releases the seat even
 * when nobody in the organization tries to invite anyone again.
 *
 * The update is bounded by `status = 'pending' and expires_at <= now()`, so it
 * is idempotent and a re-run releases nothing twice.
 */
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
      // 0085 is not applied on this deployment. Report that honestly instead of
      // returning a fake success that hides an unapplied migration.
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
