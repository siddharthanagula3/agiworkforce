import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';
import { countHeldRows, legalHoldExclusion } from '@/lib/services/legal-hold-gate';
import { TEMPORARY_FILE_PURGE_BATCH, temporaryFileCutoff } from './retention';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isSchemaNotReady(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

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

// Bytes first, then the row, and only while still flagged temporary. A legal
// hold beats the promise: a held attachment survives until the hold is released.
export async function purgeTemporaryChatFiles(
  db: Pick<DatabaseAdapter, 'query'>,
  options: { nowMs?: number; batchSize?: number } = {},
): Promise<TemporaryChatFilePurge> {
  const batchSize = Math.max(1, options.batchSize ?? TEMPORARY_FILE_PURGE_BATCH);
  try {
    const cutoff = temporaryFileCutoff(options.nowMs).toISOString();
    const due = `candidate.temporary_chat
          and candidate.created_at < $1::timestamptz`;
    const heldFromPurge = await countHeldRows(db, 'file', {
      table: 'media_assets',
      alias: 'candidate',
      where: due,
      params: [cutoff],
    });
    // The hold decides candidacy before any byte is touched, so a held
    // attachment keeps its object as well as its row.
    const exclusion = legalHoldExclusion('file', { alias: 'candidate', nextParamIndex: 3 });

    const expired = await db.query<{ id: string; storage_pathname: string | null }>(
      `select candidate.id, candidate.storage_pathname
         from public.media_assets candidate
        where ${due}
          and ${exclusion.sql}
        order by candidate.created_at asc
        limit $2`,
      [cutoff, batchSize, ...exclusion.params],
    );
    if (expired.length === 0) return { ...EMPTY_PURGE, heldFromPurge };

    const { deleted, failedPathnames } = await deleteStoredMediaObjects(
      expired.map((row) => row.storage_pathname),
    );
    const stillStored = new Set(failedPathnames);
    const purgeableIds = expired
      .filter((row) => !row.storage_pathname || !stillStored.has(row.storage_pathname))
      .map((row) => row.id);

    let purged = 0;
    if (purgeableIds.length > 0) {
      const purgeExclusion = legalHoldExclusion('file', {
        alias: 'target',
        nextParamIndex: 2,
      });
      const rows = await db.query<{ id: string }>(
        `delete from public.media_assets target
          where target.id = any($1::uuid[]) and target.temporary_chat
            and ${purgeExclusion.sql}
          returning target.id`,
        [purgeableIds, ...purgeExclusion.params],
      );
      purged = rows.length;
    }

    return {
      candidates: expired.length,
      objectsDeleted: deleted,
      objectsFailed: failedPathnames.length,
      purged,
      heldFromPurge,
      remaining: expired.length === batchSize,
    };
  } catch (error) {
    if (isSchemaNotReady(error)) return EMPTY_PURGE;
    throw error;
  }
}
