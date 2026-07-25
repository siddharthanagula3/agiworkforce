import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { eraseUserAccountData } from '@/lib/server/account-erasure';

/**
 * PER-24 — the background job `DELETE /api/user/delete-account` promised.
 *
 * That route sets `profiles.deletion_requested_at` / `deletion_scheduled_for`
 * and tells the user "your account and all data will be permanently deleted
 * within 24 hours", with a comment reading "A background job will perform the
 * actual erasure after 24 hours". No such job existed, so the grace window
 * never ended: the profile row kept its columns, every conversation, artifact,
 * memory and setting survived, and the R2 objects stayed live.
 *
 * This job closes the window: for every profile whose `deletion_scheduled_for`
 * has passed it erases all user-scoped data (including the stored bytes) and
 * then removes the identity-provider account. Erasure runs BEFORE the Clerk
 * delete so a failure leaves an account that can still sign in and retry rather
 * than orphaned data with no owner.
 */

export const runtime = 'nodejs';

/** Bound per run so a backlog cannot exceed the function timeout. */
const MAX_ACCOUNTS_PER_RUN = 25;

const PG_UNDEFINED_COLUMN = '42703';

function isMissingDeletionColumns(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as Record<string, unknown>)['code'] === PG_UNDEFINED_COLUMN;
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();

  let due: Array<{ id: string }> = [];
  try {
    due = await db.query<{ id: string }>(
      `
        select id
          from public.profiles
         where deletion_scheduled_for is not null
           and deletion_scheduled_for <= now()
         order by deletion_scheduled_for asc
         limit ${MAX_ACCOUNTS_PER_RUN}
      `,
      [],
    );
  } catch (error) {
    if (isMissingDeletionColumns(error)) {
      // The scheduling columns are not provisioned on this deployment, so no
      // account can be scheduled for deletion in the first place. Report it
      // honestly instead of returning a fake success.
      logger.warn('profiles.deletion_scheduled_for is not provisioned; nothing to purge');
      return NextResponse.json({
        message: 'Account deletion columns are not provisioned',
        purged: 0,
        failed: 0,
      });
    }
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Deleted account purge cron job failed to list due accounts',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  let purged = 0;
  let failed = 0;

  for (const { id: userId } of due) {
    try {
      const report = await eraseUserAccountData(userId);
      if (!report.complete) {
        failed++;
        logger.error(
          { userId, report },
          'Account erasure incomplete; leaving the account scheduled for a retry',
        );
        continue;
      }

      // Data is gone; now remove the identity-provider account so the user can
      // no longer sign in. A failure here is retried on the next run because
      // the profile row is already deleted only on success below.
      const { clerkClient } = await import('@clerk/nextjs/server');
      const client = await clerkClient();
      try {
        await client.users.deleteUser(userId);
      } catch (clerkError) {
        const message = clerkError instanceof Error ? clerkError.message : String(clerkError);
        // A already-deleted Clerk user is a success for our purposes.
        if (!/not\s*found|404/i.test(message)) {
          failed++;
          logger.error({ userId, error: message }, 'Clerk account deletion failed');
          continue;
        }
      }

      purged++;
      logger.info({ userId }, 'Scheduled account deletion completed');
    } catch (error) {
      failed++;
      logger.error(
        { userId, error: error instanceof Error ? error.message : String(error) },
        'Scheduled account deletion failed',
      );
    }
  }

  return NextResponse.json({
    message: 'Deleted account purge completed',
    candidates: due.length,
    purged,
    failed,
  });
}
