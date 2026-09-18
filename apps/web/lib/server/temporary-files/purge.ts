import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';
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
  remaining: boolean;
}

const EMPTY_PURGE: TemporaryChatFilePurge = {
  candidates: 0,
  objectsDeleted: 0,
  objectsFailed: 0,
  purged: 0,
  remaining: false,
};

/**
 * Bytes first, then the row, and only for rows still flagged temporary: a file
 * saved to the Library has no flag left. Not the soft-delete path, whose 30-day
 * recovery window would double the 30 days the privacy pages promise.
 */
export async function purgeTemporaryChatFiles(
  db: Pick<DatabaseAdapter, 'query'>,
  options: { nowMs?: number; batchSize?: number } = {},
): Promise<TemporaryChatFilePurge> {
  const batchSize = Math.max(1, options.batchSize ?? TEMPORARY_FILE_PURGE_BATCH);
  try {
    const expired = await db.query<{ id: string; storage_pathname: string | null }>(
      `select id, storage_pathname
         from public.media_assets
        where temporary_chat
          and created_at < $1::timestamptz
        order by created_at asc
        limit $2`,
      [temporaryFileCutoff(options.nowMs).toISOString(), batchSize],
    );
    if (expired.length === 0) return EMPTY_PURGE;

    const { deleted, failedPathnames } = await deleteStoredMediaObjects(
      expired.map((row) => row.storage_pathname),
    );
    const stillStored = new Set(failedPathnames);
    const purgeableIds = expired
      .filter((row) => !row.storage_pathname || !stillStored.has(row.storage_pathname))
      .map((row) => row.id);

    let purged = 0;
    if (purgeableIds.length > 0) {
      const rows = await db.query<{ id: string }>(
        `delete from public.media_assets
          where id = any($1::uuid[]) and temporary_chat
          returning id`,
        [purgeableIds],
      );
      purged = rows.length;
    }

    return {
      candidates: expired.length,
      objectsDeleted: deleted,
      objectsFailed: failedPathnames.length,
      purged,
      remaining: expired.length === batchSize,
    };
  } catch (error) {
    if (isSchemaNotReady(error)) return EMPTY_PURGE;
    throw error;
  }
}
