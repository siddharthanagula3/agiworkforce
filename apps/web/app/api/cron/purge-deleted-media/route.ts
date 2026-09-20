import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  abortOrphanedMultipartUploads,
  hasObjectStorageCredentials,
  type OrphanedMultipartSweep,
} from '@agiworkforce/object-storage';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';
import { countHeldRows, legalHoldExclusion } from '@/lib/services/legal-hold-gate';
import { getObjectStore, objectStorageConfig } from '@/lib/server/object-storage-runtime';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RECOVERY_WINDOW_DAYS = 30;

const MAX_ASSETS_PER_RUN = 500;

const MAX_MULTIPART_ABORTS_PER_RUN = 200;

/**
 * Parts uploaded into a session nobody completed are billed bytes no request
 * can reach. Nothing expires them, so this sweep is what closes them.
 */
async function sweepOrphanedMultipartUploads(): Promise<Record<string, OrphanedMultipartSweep>> {
  const config = objectStorageConfig();
  if (!hasObjectStorageCredentials(config)) return {};

  const store = getObjectStore();
  const buckets = [...new Set([config.publicBucket, config.privateBucket])].filter(
    (bucket): bucket is string => Boolean(bucket),
  );

  const swept: Record<string, OrphanedMultipartSweep> = {};
  for (const bucket of buckets) {
    try {
      swept[bucket] = await abortOrphanedMultipartUploads(store, {
        bucket,
        limit: MAX_MULTIPART_ABORTS_PER_RUN,
      });
    } catch (error) {
      logger.error(
        { bucket, error: error instanceof Error ? error.message : String(error) },
        'Orphan multipart sweep failed for a bucket',
      );
    }
  }
  return swept;
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getNeonDb();
    const multipart = await sweepOrphanedMultipartUploads();

    // The hold decides candidacy before any byte is touched: one that only
    // reached the DELETE would still have lost the file it preserved.
    const due = `candidate.deleted_at is not null
           and candidate.deleted_at < now() - interval '${RECOVERY_WINDOW_DAYS} days'`;
    const heldFromPurge = await countHeldRows(db, 'file', {
      table: 'media_assets',
      alias: 'candidate',
      where: due,
      params: [],
    });
    const candidateExclusion = legalHoldExclusion('file', {
      alias: 'candidate',
      nextParamIndex: 1,
    });

    const expired = await db.query<{ id: string; storage_pathname: string | null }>(
      `
        select candidate.id, candidate.storage_pathname
          from public.media_assets candidate
         where ${due}
           and ${candidateExclusion.sql}
         order by candidate.deleted_at asc
         limit ${MAX_ASSETS_PER_RUN}
      `,
      candidateExclusion.params,
    );

    if (expired.length === 0) {
      return NextResponse.json({
        message: 'No expired media to purge',
        purged: 0,
        heldFromPurge,
        multipart,
      });
    }

    const { deleted: objectsDeleted, failedPathnames } = await deleteStoredMediaObjects(
      expired.map((row) => row.storage_pathname),
    );
    const stillStored = new Set(failedPathnames);

    const purgeableIds = expired
      .filter((row) => !row.storage_pathname || !stillStored.has(row.storage_pathname))
      .map((row) => row.id);

    let rowsPurged = 0;
    if (purgeableIds.length > 0) {
      // Carried again: a hold placed between the two statements has to win.
      const purgeExclusion = legalHoldExclusion('file', {
        alias: 'target',
        nextParamIndex: 2,
      });
      const purged = await db.query<{ id: string }>(
        `delete from public.media_assets target
          where target.id = any($1::uuid[])
            and ${purgeExclusion.sql}
          returning target.id`,
        [purgeableIds, ...purgeExclusion.params],
      );
      rowsPurged = purged.length;
    }

    // Counted, never named: whose files they are is not for a log.
    logger.info(
      {
        candidates: expired.length,
        objectsDeleted,
        objectsFailed: failedPathnames.length,
        rowsPurged,
        heldFromPurge,
        multipart,
      },
      heldFromPurge > 0
        ? 'Purged expired soft-deleted media assets; some were preserved by an active legal hold and will be purged once it is released'
        : 'Purged expired soft-deleted media assets',
    );

    return NextResponse.json({
      message: 'Deleted media purge completed',
      candidates: expired.length,
      objectsDeleted,
      objectsFailed: failedPathnames.length,
      purged: rowsPurged,
      heldFromPurge,
      multipart,
    });
  } catch (error) {
    // Nothing was destroyed: the predicate is inside the candidate statement,
    // so an unreadable hold set fails it before any object or row is touched.
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Deleted media purge cron job failed; nothing was purged',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
