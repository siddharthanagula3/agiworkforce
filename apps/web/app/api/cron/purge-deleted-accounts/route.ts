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
import { getIdentityProvider } from '@/lib/server/identity';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_ACCOUNTS_PER_RUN = 100;

/**
 * Stop claiming new accounts with this much of the invocation left, so the run
 * finishes the account it is on and reports honest counts instead of being
 * killed mid-erasure.
 */
const SWEEP_BUDGET_MS = 240_000;

const MAX_TOMBSTONE_SWEEPS_PER_RUN = 5;

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

async function deleteProviderIdentity(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await getIdentityProvider().deleteUser(userId);
    return { ok: true };
  } catch (deleteError) {
    const message = deleteError instanceof Error ? deleteError.message : String(deleteError);
    if (/not\s*found|404/i.test(message)) return { ok: true };
    return { ok: false, error: message };
  }
}

const DUE_ACCOUNTS_BY_SCHEDULE = `
  select id
    from public.profiles
   where deletion_scheduled_for is not null
     and deletion_scheduled_for <= now()
   order by deletion_scheduled_for asc
   limit ${MAX_ACCOUNTS_PER_RUN}
`;

/**
 * Least-recently-attempted account first.
 *
 * A failed erasure leaves `deletion_scheduled_for` where it was, deliberately,
 * because moving it would re-open the user's cancellation window on an account
 * whose data is already partly gone. Ordered by that column alone, a handful of
 * accounts that cannot be erased (a legal hold, a Clerk identity that will not
 * delete) held the head of the queue permanently and nobody else's deletion
 * ever ran. `erasure_tombstones.last_swept_at` is stamped by
 * `openErasureTombstone` on every attempt, succeeded or not, its own schema
 * calls it "the round-robin cursor", so it rotates the queue without touching
 * the user-facing schedule. Never-attempted accounts have no tombstone and sort
 * first.
 */
const DUE_ACCOUNTS_BY_ATTEMPT = `
  select profile.id
    from public.profiles as profile
    left join public.erasure_tombstones as tombstone on tombstone.user_id = profile.id
   where profile.deletion_scheduled_for is not null
     and profile.deletion_scheduled_for <= now()
   order by tombstone.last_swept_at asc nulls first, profile.deletion_scheduled_for asc
   limit ${MAX_ACCOUNTS_PER_RUN}
`;

async function listDueAccounts(db: ReturnType<typeof getNeonDb>): Promise<Array<{ id: string }>> {
  try {
    return await db.query<{ id: string }>(DUE_ACCOUNTS_BY_ATTEMPT, []);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    logger.warn('public.erasure_tombstones is not provisioned; the due queue cannot rotate');
    return db.query<{ id: string }>(DUE_ACCOUNTS_BY_SCHEDULE, []);
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();

  const startedAtMs = Date.now();

  let due: Array<{ id: string }> = [];
  let deletionColumnsProvisioned = true;
  try {
    due = await listDueAccounts(db);
  } catch (error) {
    if (isMissingDeletionColumns(error)) {
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
  let deferred = 0;
  const handled = new Set<string>();

  for (const { id: userId } of due) {
    if (Date.now() - startedAtMs > SWEEP_BUDGET_MS) {
      deferred = due.length - handled.size;
      logger.warn(
        { deferred, purged, failed },
        'Deleted account purge ran out of budget · remaining accounts roll to the next run',
      );
      break;
    }
    handled.add(userId);
    try {
      const tombstone = await openErasureTombstone(userId);
      if (!tombstone.recorded && !tombstone.skipped) {
        failed++;
        logger.error(
          { userId, error: tombstone.error },
          'Erasure tombstone could not be written; leaving the account scheduled for a retry',
        );
        continue;
      }

      const report = await eraseUserAccountData(userId, { retainProfile: true });
      if (!report.complete) {
        failed++;
        logger.error(
          { userId, report },
          'Account erasure incomplete; leaving the account scheduled for a retry',
        );
        continue;
      }

      const settled = await closeErasureTombstone(userId);
      if (!settled.recorded && !settled.skipped) {
        logger.warn(
          { userId, error: settled.error },
          'Erasure tombstone left open; the sweep will settle it',
        );
      }

      const identity = await deleteProviderIdentity(userId);
      if (!identity.ok) {
        failed++;
        logger.error({ userId, error: identity.error }, 'Clerk account deletion failed');
        continue;
      }

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
    if (Date.now() - startedAtMs > SWEEP_BUDGET_MS) break;
    if (profilePresent) resurrected++;
    try {
      const tombstone = await openErasureTombstone(userId);
      if (!tombstone.recorded) {
        reErasureFailed++;
        logger.error({ userId, error: tombstone.error }, 'Erasure tombstone could not be advanced');
        continue;
      }

      const report = await eraseUserAccountData(userId, { retainProfile: true });
      if (!report.complete) {
        reErasureFailed++;
        logger.error({ userId, report }, 'Tombstoned account could not be fully re-erased');
        continue;
      }
      await closeErasureTombstone(userId);

      if (profilePresent) {
        const identity = await deleteProviderIdentity(userId);
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
    deferred,
    sweepAvailable,
    tombstoneCandidates: tombstones.length,
    resurrected,
    reErased,
    reErasureFailed,
  });
}
