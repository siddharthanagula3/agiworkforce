import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const READY_ANSWER_TTL_MS = 5 * 60_000;
const ABSENT_ANSWER_TTL_MS = 60_000;

const CHAT_FILE_SCHEMA_PROBE_SQL = `select to_regclass('public.chat_file_intakes') is not null as intakes_table,
       to_regclass('public.chat_file_preparations') is not null as preparations_table,
       exists (
         select 1
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'media_assets'
            and column_name = 'scanned_sha256'
       ) as scanned_sha256_column`;

interface ChatFileSchemaProbeRow {
  intakes_table: boolean | null;
  preparations_table: boolean | null;
  scanned_sha256_column: boolean | null;
}

let cachedAnswer: { ready: boolean; expiresAt: number } | null = null;

/**
 * Erasure must ask uncached: an instance that cached "absent" just before 0422
 * was applied would report rows deleted that exist.
 */
export async function chatFileSchemaReady(
  db: Pick<DatabaseAdapter, 'query'>,
  options: { cached?: boolean } = {},
): Promise<boolean> {
  const now = Date.now();
  if (options.cached && cachedAnswer !== null && cachedAnswer.expiresAt > now) {
    return cachedAnswer.ready;
  }
  const [row] = await db.query<ChatFileSchemaProbeRow>(CHAT_FILE_SCHEMA_PROBE_SQL);
  const ready =
    row?.intakes_table === true &&
    row.preparations_table === true &&
    row.scanned_sha256_column === true;
  if (options.cached) {
    cachedAnswer = {
      ready,
      expiresAt: now + (ready ? READY_ANSWER_TTL_MS : ABSENT_ANSWER_TTL_MS),
    };
  }
  return ready;
}
