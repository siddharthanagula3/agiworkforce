import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';
import { countHeldRows, legalHoldExclusion } from '@/lib/services/legal-hold-gate';
import { serializeDestructionWithHolds } from '@/lib/services/legal-hold-placement';
import { purgeDerivedRecords } from '@/lib/resources/purge-soft-deleted';
import { TEMPORARY_FILE_PURGE_BATCH, temporaryFileCutoff } from './retention';

export interface TemporaryChatFilePurge {
  candidates: number;
  objectsDeleted: number;
  objectsFailed: number;
  purged: number;
  /** Expired attachments an active legal hold preserved. */
  heldFromPurge: number;
  remaining: boolean;
}

const EMPTY_PURGE: TemporaryChatFilePurge = {
  candidates: 0,
  objectsDeleted: 0,
  objectsFailed: 0,
  purged: 0,
  heldFromPurge: 0,
  remaining: false,
};

interface DueAttachment {
  id: string;
  storage_pathname: string | null;
  organization_id: string | null;
}

function byWorkspace(rows: readonly DueAttachment[]): Map<string | null, DueAttachment[]> {
  const grouped = new Map<string | null, DueAttachment[]>();
  for (const row of rows) {
    const workspace = row.organization_id ?? null;
    grouped.set(workspace, [...(grouped.get(workspace) ?? []), row]);
  }
  return grouped;
}

// Bytes first, then the row, and only while still flagged temporary. A legal
// hold beats the promise: a held attachment survives until the hold is released.
// The row lock is what makes saving to the Library safe against this sweep: a
// save that lands first clears the flag the locked re-read requires, and one
// that lands later waits for the delete and finds nothing to save.
export async function purgeTemporaryChatFiles(
  db: Pick<DatabaseAdapter, 'query' | 'transaction'>,
  options: { nowMs?: number; batchSize?: number } = {},
): Promise<TemporaryChatFilePurge> {
  const batchSize = Math.max(1, options.batchSize ?? TEMPORARY_FILE_PURGE_BATCH);
  const cutoff = temporaryFileCutoff(options.nowMs).toISOString();
  const due = `candidate.temporary_chat
        and candidate.created_at < $1::timestamptz`;
  const heldFromPurge = await countHeldRows(db, 'file', {
    table: 'media_assets',
    alias: 'candidate',
    where: due,
    params: [cutoff],
  });
  const exclusion = legalHoldExclusion('file', { alias: 'candidate', nextParamIndex: 3 });

  const expired = await db.query<DueAttachment>(
    `select candidate.id, candidate.storage_pathname, candidate.organization_id
       from public.media_assets candidate
      where ${due}
        and ${exclusion.sql}
      order by candidate.created_at asc
      limit $2`,
    [cutoff, batchSize, ...exclusion.params],
  );
  if (expired.length === 0) return { ...EMPTY_PURGE, heldFromPurge };

  let objectsDeleted = 0;
  let objectsFailed = 0;
  let purged = 0;
  for (const [organizationId, rows] of byWorkspace(expired)) {
    const removed = await db.transaction(async (tx) => {
      await serializeDestructionWithHolds(tx, organizationId);
      const confirmedExclusion = legalHoldExclusion('file', {
        alias: 'candidate',
        nextParamIndex: 3,
      });
      const confirmed = await tx.query<{ id: string; storage_pathname: string | null }>(
        `select candidate.id, candidate.storage_pathname
           from public.media_assets candidate
          where candidate.id = any($1::uuid[])
            and candidate.temporary_chat
            and candidate.created_at < $2::timestamptz
            and ${confirmedExclusion.sql}
            for update of candidate`,
        [rows.map((row) => row.id), cutoff, ...confirmedExclusion.params],
      );
      if (confirmed.length === 0) return [];

      const { deleted, failedPathnames } = await deleteStoredMediaObjects(
        confirmed.map((row) => row.storage_pathname),
      );
      objectsDeleted += deleted;
      objectsFailed += failedPathnames.length;
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
          where target.id = any($1::uuid[]) and target.temporary_chat
            and ${purgeExclusion.sql}
          returning target.id, target.user_id`,
        [purgeableIds, ...purgeExclusion.params],
      );
    });
    purged += removed.length;
    await purgeDerivedRecords(
      db,
      'media_assets',
      removed.map((row) => ({ owner: row.user_id, key: String(row.id) })),
    );
  }

  return {
    candidates: expired.length,
    objectsDeleted,
    objectsFailed,
    purged,
    heldFromPurge,
    remaining: expired.length === batchSize,
  };
}
