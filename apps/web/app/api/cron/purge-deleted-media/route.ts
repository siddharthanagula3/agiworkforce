import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  abortOrphanedMultipartUploads,
  hasObjectStorageCredentials,
  type OrphanedMultipartSweep,
} from '@agiworkforce/object-storage';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';
import { countHeldRows, legalHoldExclusion } from '@/lib/services/legal-hold-gate';
import { serializeDestructionWithHolds } from '@/lib/services/legal-hold-placement';
import { purgeDerivedRecords } from '@/lib/resources/purge-soft-deleted';
import { getObjectStore, objectStorageConfig } from '@/lib/server/object-storage-runtime';
import {
  sweepAbandonedFeedbackScreenshots,
  type FeedbackScreenshotSweep,
} from '@/lib/server/feedback-screenshot-cleanup';

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

async function sweepFeedbackScreenshots(
  db: DatabaseAdapter,
): Promise<FeedbackScreenshotSweep | null> {
  try {
    return await sweepAbandonedFeedbackScreenshots(db);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Abandoned feedback screenshot sweep failed',
    );
    return null;
  }
}

const BATCH_SIZE = 50;

const DUE_FOR_PURGE = `candidate.deleted_at is not null
           and candidate.deleted_at < now() - interval '${RECOVERY_WINDOW_DAYS} days'`;

interface PurgeCandidate {
  id: string;
  storage_pathname: string | null;
  organization_id: string | null;
}

interface PurgeTally {
  objectsDeleted: number;
  objectsFailed: number;
  rowsPurged: number;
  derivedRecordsPurged: number;
}

function batchesByWorkspace(
  candidates: readonly PurgeCandidate[],
): Array<{ organizationId: string | null; ids: string[] }> {
  const byWorkspace = new Map<string | null, string[]>();
  for (const candidate of candidates) {
    const workspace = candidate.organization_id ?? null;
    const ids = byWorkspace.get(workspace) ?? [];
    ids.push(candidate.id);
    byWorkspace.set(workspace, ids);
  }
  const batches: Array<{ organizationId: string | null; ids: string[] }> = [];
  for (const [organizationId, ids] of byWorkspace) {
    for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
      batches.push({ organizationId, ids: ids.slice(offset, offset + BATCH_SIZE) });
    }
  }
  return batches;
}

async function purgeBatch(
  db: DatabaseAdapter,
  organizationId: string | null,
  ids: readonly string[],
  tally: PurgeTally,
): Promise<void> {
  const purged = await db.transaction(async (tx) => {
    await serializeDestructionWithHolds(tx, organizationId);
    const confirmedExclusion = legalHoldExclusion('file', {
      alias: 'candidate',
      nextParamIndex: 2,
    });
    const confirmed = await tx.query<{ id: string; storage_pathname: string | null }>(
      `select candidate.id, candidate.storage_pathname
         from public.media_assets candidate
        where candidate.id = any($1::uuid[])
          and ${DUE_FOR_PURGE}
          and ${confirmedExclusion.sql}
        for update of candidate`,
      [ids, ...confirmedExclusion.params],
    );
    if (confirmed.length === 0) return [];

    const { deleted, failedPathnames } = await deleteStoredMediaObjects(
      confirmed.map((row) => row.storage_pathname),
    );
    tally.objectsDeleted += deleted;
    tally.objectsFailed += failedPathnames.length;
    const stillStored = new Set(failedPathnames);
    const purgeableIds = confirmed
      .filter((row) => !row.storage_pathname || !stillStored.has(row.storage_pathname))
      .map((row) => row.id);
    if (purgeableIds.length === 0) return [];

    const purgeExclusion = legalHoldExclusion('file', {
      alias: 'target',
      nextParamIndex: 2,
    });
    return tx.query<{ id: string; user_id: string }>(
      `delete from public.media_assets target
        where target.id = any($1::uuid[])
          and ${purgeExclusion.sql}
        returning target.id, target.user_id`,
      [purgeableIds, ...purgeExclusion.params],
    );
  });
  tally.rowsPurged += purged.length;
  tally.derivedRecordsPurged += await purgeDerivedRecords(
    db,
    'media_assets',
    purged.map((row) => ({ owner: row.user_id, key: String(row.id) })),
  );
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tally: PurgeTally = {
    objectsDeleted: 0,
    objectsFailed: 0,
    rowsPurged: 0,
    derivedRecordsPurged: 0,
  };

  try {
    const db = getNeonDb();
    const multipart = await sweepOrphanedMultipartUploads();
    const feedbackScreenshots = await sweepFeedbackScreenshots(db);

    // The hold decides candidacy before any byte is touched: one that only
    // reached the DELETE would still have lost the file it preserved.
    const heldFromPurge = await countHeldRows(db, 'file', {
      table: 'media_assets',
      alias: 'candidate',
      where: DUE_FOR_PURGE,
      params: [],
    });
    const candidateExclusion = legalHoldExclusion('file', {
      alias: 'candidate',
      nextParamIndex: 1,
    });

    const expired = await db.query<PurgeCandidate>(
      `
        select candidate.id, candidate.storage_pathname, candidate.organization_id
          from public.media_assets candidate
         where ${DUE_FOR_PURGE}
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
        feedbackScreenshots,
      });
    }

    for (const batch of batchesByWorkspace(expired)) {
      await purgeBatch(db, batch.organizationId, batch.ids, tally);
    }

    // Counted, never named: whose files they are is not for a log.
    logger.info(
      {
        candidates: expired.length,
        ...tally,
        heldFromPurge,
        multipart,
        feedbackScreenshots,
      },
      heldFromPurge > 0
        ? 'Purged expired soft-deleted media assets; some were preserved by an active legal hold and will be purged once it is released'
        : 'Purged expired soft-deleted media assets',
    );

    return NextResponse.json({
      message: 'Deleted media purge completed',
      candidates: expired.length,
      objectsDeleted: tally.objectsDeleted,
      objectsFailed: tally.objectsFailed,
      purged: tally.rowsPurged,
      derivedRecordsPurged: tally.derivedRecordsPurged,
      heldFromPurge,
      multipart,
      feedbackScreenshots,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), ...tally },
      'Deleted media purge cron job failed; the counts show what had been removed before the failure',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
