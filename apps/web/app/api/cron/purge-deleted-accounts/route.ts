import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { enqueueJob } from '@/lib/jobs/job-service';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  sweepExpiredMcpDiscoveryCache,
  sweepExpiredMcpResponseCache,
} from '@/lib/connectors/mcp-runtime-cache';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ACCOUNTS_PER_RUN = 100;

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

const DUE_ACCOUNTS_BY_SCHEDULE = `
  select id, deletion_scheduled_for
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
  select profile.id, profile.deletion_scheduled_for
    from public.profiles as profile
    left join public.erasure_tombstones as tombstone on tombstone.user_id = profile.id
   where profile.deletion_scheduled_for is not null
     and profile.deletion_scheduled_for <= now()
   order by tombstone.last_swept_at asc nulls first, profile.deletion_scheduled_for asc
   limit ${MAX_ACCOUNTS_PER_RUN}
`;

interface DueAccount {
  id: string;
  deletion_scheduled_for: string | Date | null;
}

async function listDueAccounts(db: ReturnType<typeof getNeonDb>): Promise<DueAccount[]> {
  try {
    return await db.query<DueAccount>(DUE_ACCOUNTS_BY_ATTEMPT, []);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    logger.warn('public.erasure_tombstones is not provisioned; the due queue cannot rotate');
    return db.query<DueAccount>(DUE_ACCOUNTS_BY_SCHEDULE, []);
  }
}

function scheduleStamp(value: string | Date | null): string {
  if (!value) return 'unscheduled';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : 'unscheduled';
}

/**
 * Queues the erasure of every account whose deletion is due, and the re-erasure
 * of every tombstoned subject whose rows came back.
 *
 * The sweep only decides what is due; the erasure itself runs as a background
 * job (0208) so a subject whose deletion fails is retried with backoff and ends
 * up in the dead-letter list with the stage that refused, instead of silently
 * holding the head of a fixed per-run budget.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();
  const connectorCacheRowsExpired =
    (await sweepExpiredMcpResponseCache()) + (await sweepExpiredMcpDiscoveryCache());

  let due: DueAccount[] = [];
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

  let queued = 0;
  let alreadyQueued = 0;
  let failed = 0;
  const handled = new Set<string>();

  for (const account of due.slice(0, MAX_ACCOUNTS_PER_RUN)) {
    handled.add(account.id);
    try {
      const job = await enqueueJob(db, {
        kind: 'data-deletion.scheduled-account-erasure',
        idempotencyKey: `account-erasure:${account.id}:${scheduleStamp(account.deletion_scheduled_for)}`,
        payload: { subjectUserId: account.id, mode: 'scheduled' },
      });
      if (job.created) queued += 1;
      else alreadyQueued += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { userId: account.id, error: error instanceof Error ? error.message : String(error) },
        'Scheduled account erasure could not be queued',
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

  const resweepBucket = new Date().toISOString().slice(0, 10);
  let resweepsQueued = 0;
  let resurrected = 0;

  for (const { user_id: userId, profile_present: profilePresent } of tombstones) {
    if (handled.has(userId)) continue;
    if (profilePresent) resurrected += 1;
    try {
      const job = await enqueueJob(db, {
        kind: 'data-deletion.scheduled-account-erasure',
        idempotencyKey: `account-reerasure:${userId}:${resweepBucket}`,
        payload: { subjectUserId: userId, mode: 'resweep' },
      });
      if (job.created) resweepsQueued += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { userId, error: error instanceof Error ? error.message : String(error) },
        'Tombstoned account re-erasure could not be queued',
      );
    }
  }

  return NextResponse.json({
    message: deletionColumnsProvisioned
      ? 'Deleted account erasures queued'
      : 'Account deletion columns are not provisioned',
    candidates: due.length,
    queued,
    alreadyQueued,
    failed,
    deferred: Math.max(0, due.length - MAX_ACCOUNTS_PER_RUN),
    sweepAvailable,
    tombstoneCandidates: tombstones.length,
    resurrected,
    resweepsQueued,
    connectorCacheRowsExpired,
  });
}
