import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';

/**
 * PER-25 — the job that finally deletes the BYTES.
 *
 * `DELETE /api/media` only set `deleted_at`, and `media_assets.storage_pathname`
 * — documented in migration 0036 as "used for deletion" — was never used that
 * way anywhere in the repository: `deleteStoredMedia` had exactly one
 * occurrence, its own definition. Combined with PER-26's permanent public URLs
 * that made deletion cosmetic: the object stayed in R2 and stayed fetchable.
 *
 * Soft delete is deliberate — the Library's Recently-deleted bin restores an
 * asset for 30 days, and `restoreMediaAsset` enforces exactly that window. This
 * job runs after the window closes: it hard-deletes rows whose `deleted_at` is
 * older than 30 days and removes their objects from storage.
 *
 * Ordering: the rows are read first, the objects are deleted next, and the rows
 * are removed last. If object deletion fails the row survives and the next run
 * retries it — a retryable leak is strictly better than a row deleted with its
 * bytes still live and no remaining pointer to them.
 */

export const runtime = 'nodejs';

/** Must match the restore window enforced by `restoreMediaAsset`. */
const RECOVERY_WINDOW_DAYS = 30;

/** Bound per run so a large backlog cannot exceed the function timeout. */
const MAX_ASSETS_PER_RUN = 500;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getNeonDb();

    const expired = await db.query<{ id: string; storage_pathname: string | null }>(
      `
        select id, storage_pathname
          from public.media_assets
         where deleted_at is not null
           and deleted_at < now() - interval '${RECOVERY_WINDOW_DAYS} days'
         order by deleted_at asc
         limit ${MAX_ASSETS_PER_RUN}
      `,
      [],
    );

    if (expired.length === 0) {
      return NextResponse.json({ message: 'No expired media to purge', purged: 0 });
    }

    const { deleted: objectsDeleted, failedPathnames } = await deleteStoredMediaObjects(
      expired.map((row) => row.storage_pathname),
    );
    const stillStored = new Set(failedPathnames);

    // Only drop rows whose bytes are gone (or that never had a stored object).
    // A row whose object deletion failed keeps its pointer so the next run can
    // retry instead of orphaning the bytes forever.
    const purgeableIds = expired
      .filter((row) => !row.storage_pathname || !stillStored.has(row.storage_pathname))
      .map((row) => row.id);

    let rowsPurged = 0;
    if (purgeableIds.length > 0) {
      const purged = await db.query<{ id: string }>(
        `delete from public.media_assets where id = any($1::uuid[]) returning id`,
        [purgeableIds],
      );
      rowsPurged = purged.length;
    }

    logger.info(
      {
        candidates: expired.length,
        objectsDeleted,
        objectsFailed: failedPathnames.length,
        rowsPurged,
      },
      'Purged expired soft-deleted media assets',
    );

    return NextResponse.json({
      message: 'Deleted media purge completed',
      candidates: expired.length,
      objectsDeleted,
      objectsFailed: failedPathnames.length,
      purged: rowsPurged,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Deleted media purge cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
