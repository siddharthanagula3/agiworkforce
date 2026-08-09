import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  closeErasureTombstone,
  eraseProfileRow,
  eraseUserAccountData,
  openErasureTombstone,
} from '@/lib/server/account-erasure';

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
 *
 * It runs TWO queues, because the due queue alone cannot survive a restore.
 * `deletion_scheduled_for` lives on the row the erasure deletes, so once an
 * erasure finished nothing remembered the account had ever been erased. The
 * second queue is the suppression list in `erasure_tombstones` (0103), which
 * outlives the profile row and puts a resurrected subject back in the queue.
 *
 * What that second queue does NOT reach, stated here because the DPA sentence
 * it backs ("restored data is re-subjected to the same erasure on the next
 * scheduled run") is broader than the mechanism:
 *   - A whole-database point-in-time restore rolls the suppression list back
 *     with the data. Landing between the deletion request and the erasure is
 *     covered by the due queue below (the restored profile still carries
 *     `deletion_scheduled_for`); landing before the request loses the request
 *     too, and re-erasing that window is manual. The list covers PARTIAL
 *     restores — `profiles` or its child tables copied back while the list
 *     stays current.
 *   - Object storage. Every object this job deletes is enumerated from database
 *     rows, so R2 objects restored while their rows stay erased are not seen.
 * Both limits are repeated in 0103_erasure_tombstones.sql.
 */

export const runtime = 'nodejs';

/** Bound per run so a backlog cannot exceed the function timeout. */
const MAX_ACCOUNTS_PER_RUN = 25;

/**
 * Bounded well below the due queue: a sweep re-runs a FULL erasure (some sixty
 * deletes plus the object-storage lookups) and both queues share one function
 * timeout.
 */
const MAX_TOMBSTONE_SWEEPS_PER_RUN = 5;

/**
 * How stale a settled tombstone may get before it is re-erased regardless of
 * evidence. A restore that brings back child tables but not `profiles` leaves
 * nothing for the resurrection join to see, so the list is also walked
 * round-robin — at this bound the walk covers 150 subjects a month, which is
 * the honest limit of this queue, not a guarantee about larger lists.
 */
const TOMBSTONE_RESWEEP_INTERVAL = '30 days';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isMissingDeletionColumns(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as Record<string, unknown>)['code'] === PG_UNDEFINED_COLUMN;
}

function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE;
}

/**
 * Remove the identity-provider account. Both queues need it: the due queue ends
 * the grace window, and the sweep may be looking at a subject whose data was
 * erased but whose Clerk delete failed on an earlier run. Idempotent — an
 * already-deleted user is a success.
 */
async function deleteClerkIdentity(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { clerkClient } = await import('@clerk/nextjs/server');
  const client = await clerkClient();
  try {
    await client.users.deleteUser(userId);
    return { ok: true };
  } catch (clerkError) {
    const message = clerkError instanceof Error ? clerkError.message : String(clerkError);
    if (/not\s*found|404/i.test(message)) return { ok: true };
    return { ok: false, error: message };
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();

  let due: Array<{ id: string }> = [];
  let deletionColumnsProvisioned = true;
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
      // honestly instead of returning a fake success — and keep going, because
      // the suppression list is a separate queue that does not depend on them.
      deletionColumnsProvisioned = false;
      logger.warn('profiles.deletion_scheduled_for is not provisioned; nothing is due');
    } else {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Deleted account purge cron job failed to list due accounts',
      );
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  let purged = 0;
  let failed = 0;
  /** Subjects this run already erased; the sweep below must not redo them. */
  const handled = new Set<string>();

  for (const { id: userId } of due) {
    handled.add(userId);
    try {
      // Suppression list first. The erasure destroys the `profiles` row that
      // queues this account, so the record that the subject must stay erased
      // has to exist before that row can go — a tombstone written afterwards
      // would be missing for exactly the runs that died in between.
      const tombstone = await openErasureTombstone(userId);
      if (!tombstone.recorded && !tombstone.skipped) {
        // Fail closed, BEFORE anything is destroyed: erasing now would delete
        // the data with nothing anywhere remembering the obligation, which is
        // exactly the state that made a restore permanent. The profile row is
        // untouched, so this account is still due on the next run.
        failed++;
        logger.error(
          { userId, error: tombstone.error },
          'Erasure tombstone could not be written; leaving the account scheduled for a retry',
        );
        continue;
      }

      // `retainProfile` keeps the row this loop selects on. It is the only
      // thing that puts the account back in the queue, so it must outlive both
      // a partial erasure and a failed Clerk delete — otherwise a failure here
      // left a signed-in-able identity with no profile and no way to retry.
      const report = await eraseUserAccountData(userId, { retainProfile: true });
      if (!report.complete) {
        failed++;
        logger.error(
          { userId, report },
          'Account erasure incomplete; leaving the account scheduled for a retry',
        );
        continue;
      }

      // An unsettled tombstone is the SAFE state: it keeps the subject in the
      // sweep queue, where the re-erasure is a no-op and settles it later.
      const settled = await closeErasureTombstone(userId);
      if (!settled.recorded && !settled.skipped) {
        logger.warn(
          { userId, error: settled.error },
          'Erasure tombstone left open; the sweep will settle it',
        );
      }

      // Data is gone; now remove the identity-provider account so the user can
      // no longer sign in.
      const identity = await deleteClerkIdentity(userId);
      if (!identity.ok) {
        failed++;
        logger.error({ userId, error: identity.error }, 'Clerk account deletion failed');
        continue;
      }

      // Retry pointer last: nothing above can be resumed once it is gone.
      await eraseProfileRow(userId);
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

  /**
   * Second queue: subjects the suppression list says must stay erased. A live
   * `profiles` row for a tombstoned subject is a resurrection and is swept
   * first; an unsettled tombstone is an erasure that never finished and comes
   * next; the interval clause walks the rest so a restore of child tables alone
   * is still re-erased eventually. Both keys are in the ORDER BY, in that order,
   * or the tiers would only be a claim in this comment.
   */
  let tombstones: Array<{ user_id: string; profile_present: boolean }> = [];
  let sweepAvailable = true;
  try {
    tombstones = await db.query<{ user_id: string; profile_present: boolean }>(
      `
        select tombstone.user_id,
               (profile.id is not null) as profile_present
          from public.erasure_tombstones as tombstone
          left join public.profiles as profile on profile.id = tombstone.user_id
         where profile.id is not null
            or tombstone.erased_at is null
            or tombstone.last_swept_at < now() - interval '${TOMBSTONE_RESWEEP_INTERVAL}'
         order by (profile.id is not null) desc,
                  (tombstone.erased_at is null) desc,
                  tombstone.last_swept_at asc
         limit ${MAX_TOMBSTONE_SWEEPS_PER_RUN}
      `,
      [],
    );
  } catch (error) {
    sweepAvailable = false;
    if (isMissingTable(error)) {
      logger.warn(
        'public.erasure_tombstones is not provisioned; restored data cannot be re-erased',
      );
    } else {
      // The due queue above already did its work, so a broken sweep is reported
      // in the body rather than turned into a failed run.
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Deleted account purge cron job failed to list erasure tombstones',
      );
    }
  }

  let resurrected = 0;
  let reErased = 0;
  let reErasureFailed = 0;

  for (const { user_id: userId, profile_present: profilePresent } of tombstones) {
    if (handled.has(userId)) continue;
    if (profilePresent) resurrected++;
    try {
      // Advances `last_swept_at`, which is this queue's round-robin cursor: a
      // subject that is never re-recorded is a subject the walk never leaves.
      // The row is reachable here only because the SELECT above read the table,
      // so a write failure is a real failure, never a missing table.
      const tombstone = await openErasureTombstone(userId);
      if (!tombstone.recorded) {
        reErasureFailed++;
        logger.error({ userId, error: tombstone.error }, 'Erasure tombstone could not be advanced');
        continue;
      }

      // Same order as the due queue, for the same reason: `retainProfile` keeps
      // the only row that can put this subject back in either queue until the
      // identity is gone. Erasing the profile row here without deleting the
      // Clerk user would strand a signed-in-able identity with no profile and
      // no retry pointer.
      const report = await eraseUserAccountData(userId, { retainProfile: true });
      if (!report.complete) {
        reErasureFailed++;
        logger.error({ userId, report }, 'Tombstoned account could not be fully re-erased');
        continue;
      }
      await closeErasureTombstone(userId);

      if (profilePresent) {
        // A live profile row means either a restore or a due-queue run whose
        // Clerk delete failed. Either way the identity may still sign in.
        const identity = await deleteClerkIdentity(userId);
        if (!identity.ok) {
          reErasureFailed++;
          logger.error(
            { userId, error: identity.error },
            'Resurrected account re-erased but its identity could not be deleted; keeping the profile row for a retry',
          );
          continue;
        }
        await eraseProfileRow(userId);
        logger.warn({ userId }, 'Resurrected account re-erased from the suppression list');
      }
      reErased++;
    } catch (error) {
      reErasureFailed++;
      logger.error(
        { userId, error: error instanceof Error ? error.message : String(error) },
        'Tombstoned account re-erasure failed',
      );
    }
  }

  return NextResponse.json({
    message: deletionColumnsProvisioned
      ? 'Deleted account purge completed'
      : 'Account deletion columns are not provisioned',
    candidates: due.length,
    purged,
    failed,
    sweepAvailable,
    tombstoneCandidates: tombstones.length,
    resurrected,
    reErased,
    reErasureFailed,
  });
}
