import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export type PreparationDb = Pick<DatabaseAdapter, 'query'>;

export const PREPARATION_STATES = [
  'preparing',
  'ready',
  'ready_partial',
  'prepare_failed',
] as const;
export type PreparationState = (typeof PREPARATION_STATES)[number];

export type PreparationCursor = Record<string, unknown>;

export const PREPARATION_FAILURE_REASONS = [
  'unreadable',
  'encrypted',
  'archive_bomb',
  'macro_present',
  'invalid_utf8',
  'row_too_long',
  'too_large_for_buffered_read',
  'over_kind_limit',
  'source_missing',
  'source_size_mismatch',
  'stalled',
] as const;
export type PreparationFailureReason = (typeof PREPARATION_FAILURE_REASONS)[number];

/** The file cannot be read as text; it stays sealed, attached and usable in the sandbox. */
export class PreparationRefusedError extends Error {
  constructor(readonly reason: PreparationFailureReason) {
    super(`The chat file could not be prepared: ${reason}`);
    this.name = 'PreparationRefusedError';
  }
}

export interface PreparationCoverage {
  /** Characters in each text segment, so `segmentChars[n - 1]` belongs to segment `n`. */
  segmentChars: number[];
  textChars: number;
  textTruncated?: boolean;
  [detail: string]: unknown;
}

export interface PreparationRow {
  id: string;
  mediaAssetId: string | null;
  userId: string;
  organizationId: string | null;
  kind: string;
  state: PreparationState;
  preparerVersion: number;
  cursor: PreparationCursor;
  segmentsReady: number;
  pagesRead: number;
  pageCount: number | null;
  sheetCount: number | null;
  indexedChars: number;
  derivedKeys: string[];
  coverage: PreparationCoverage;
  error: string | null;
  updatedAt: string;
}

export const PREPARATION_COLUMNS = `id, media_asset_id, user_id, organization_id, kind, state, preparer_version,
       cursor, segments_ready, pages_read, page_count, sheet_count, indexed_chars,
       derived_keys, coverage, error, updated_at`;

function parseJsonObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function coverageOf(value: unknown): PreparationCoverage {
  const raw = parseJsonObject(value);
  const segmentChars = Array.isArray(raw['segmentChars'])
    ? raw['segmentChars'].map((chars) => Number(chars))
    : [];
  return {
    ...raw,
    segmentChars,
    textChars: Number(raw['textChars'] ?? 0),
  };
}

function stateOf(value: unknown): PreparationState {
  const state = String(value);
  return (PREPARATION_STATES as readonly string[]).includes(state)
    ? (state as PreparationState)
    : 'prepare_failed';
}

export function mapPreparationRow(row: Record<string, unknown>): PreparationRow {
  const updatedAt = row['updated_at'];
  return {
    id: String(row['id']),
    mediaAssetId: row['media_asset_id'] == null ? null : String(row['media_asset_id']),
    userId: String(row['user_id']),
    organizationId: row['organization_id'] == null ? null : String(row['organization_id']),
    kind: String(row['kind']),
    state: stateOf(row['state']),
    preparerVersion: Number(row['preparer_version']),
    cursor: parseJsonObject(row['cursor']),
    segmentsReady: Number(row['segments_ready'] ?? 0),
    pagesRead: Number(row['pages_read'] ?? 0),
    pageCount: nullableNumber(row['page_count']),
    sheetCount: nullableNumber(row['sheet_count']),
    indexedChars: Number(row['indexed_chars'] ?? 0),
    derivedKeys: Array.isArray(row['derived_keys']) ? row['derived_keys'].map(String) : [],
    coverage: coverageOf(row['coverage']),
    error: row['error'] == null ? null : String(row['error']),
    updatedAt:
      updatedAt instanceof Date
        ? updatedAt.toISOString()
        : new Date(String(updatedAt)).toISOString(),
  };
}

/** A preparation row and the person it belongs to; every statement on a row carries both. */
export interface PreparationRef {
  id: string;
  userId: string;
}

export async function findPreparationById(
  db: PreparationDb,
  ref: PreparationRef,
): Promise<PreparationRow | null> {
  const [row] = await db.query<Record<string, unknown>>(
    `select ${PREPARATION_COLUMNS}
       from public.chat_file_preparations
      where id = $1::uuid
        and user_id = $2`,
    [ref.id, ref.userId],
  );
  return row ? mapPreparationRow(row) : null;
}

export interface OpenPreparationInput {
  assetId: string;
  userId: string;
  organizationId: string | null;
  kind: string;
  preparerVersion: number;
}

/**
 * One row per asset, created by whichever step reaches it first. The insert
 * and the read are separate statements, because a row another run committed
 * while this insert waited on the conflict is not in the insert's snapshot.
 */
export async function openPreparation(
  db: PreparationDb,
  input: OpenPreparationInput,
): Promise<PreparationRow | null> {
  await db.query(
    `insert into public.chat_file_preparations
            (media_asset_id, user_id, organization_id, kind, preparer_version)
     values ($1::uuid, $2, $3::uuid, $4, $5)
     on conflict (media_asset_id) do nothing`,
    [input.assetId, input.userId, input.organizationId, input.kind, input.preparerVersion],
  );
  const [row] = await db.query<Record<string, unknown>>(
    `select ${PREPARATION_COLUMNS}
       from public.chat_file_preparations
      where media_asset_id = $1::uuid
        and user_id = $2`,
    [input.assetId, input.userId],
  );
  return row ? mapPreparationRow(row) : null;
}

export interface PreparationAdvance {
  cursor: PreparationCursor;
  state: PreparationState;
  segmentsReady: number;
  pagesRead: number;
  pageCount: number | null;
  sheetCount: number | null;
  coverage: PreparationCoverage;
  error: string | null;
  addedKeys: readonly string[];
}

/**
 * The only way a step records progress: a compare-and-set on the cursor the
 * step started from, so a second run or a retried step that lost the race
 * changes nothing. New keys are appended once each, whatever order runs
 * finish in, and `updated_at` moves with every advance because the sweeper's
 * stall rule reads it.
 */
export async function advancePreparation(
  db: PreparationDb,
  ref: PreparationRef,
  expectedCursor: PreparationCursor,
  next: PreparationAdvance,
): Promise<PreparationRow | null> {
  const [row] = await db.query<Record<string, unknown>>(
    `update public.chat_file_preparations
        set cursor = $3::jsonb,
            state = $4,
            segments_ready = $5,
            pages_read = $6,
            page_count = $7,
            sheet_count = $8,
            coverage = $9::jsonb,
            error = $10,
            derived_keys = derived_keys || coalesce(
              (select array_agg(added.key order by added.position)
                 from unnest($11::text[]) with ordinality as added(key, position)
                where not (added.key = any(chat_file_preparations.derived_keys))),
              '{}'::text[]),
            updated_at = now()
      where id = $1::uuid
        and user_id = $12
        and state = 'preparing'
        and cursor = $2::jsonb
      returning ${PREPARATION_COLUMNS}`,
    [
      ref.id,
      JSON.stringify(expectedCursor),
      JSON.stringify(next.cursor),
      next.state,
      next.segmentsReady,
      next.pagesRead,
      next.pageCount,
      next.sheetCount,
      JSON.stringify(next.coverage),
      next.error,
      [...next.addedKeys],
      ref.userId,
    ],
  );
  return row ? mapPreparationRow(row) : null;
}

/**
 * Lists the keys a step is about to write before it writes them, with the
 * same compare-and-set on the cursor, so an object is never in storage
 * without a row naming it: erasure and the sweeper find derived objects only
 * through `derived_keys`, and a step can die between its writes and its
 * advance. Answers false when the row moved on, was erased, or is gone.
 */
export async function listPreparationKeys(
  db: PreparationDb,
  ref: PreparationRef,
  expectedCursor: PreparationCursor,
  keys: readonly string[],
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `update public.chat_file_preparations
        set derived_keys = derived_keys || coalesce(
              (select array_agg(added.key order by added.position)
                 from unnest($3::text[]) with ordinality as added(key, position)
                where not (added.key = any(chat_file_preparations.derived_keys))),
              '{}'::text[])
      where id = $1::uuid
        and user_id = $4
        and state = 'preparing'
        and media_asset_id is not null
        and cursor = $2::jsonb
      returning id`,
    [ref.id, JSON.stringify(expectedCursor), [...keys], ref.userId],
  );
  return rows.length > 0;
}

export async function recordPreparedIndexedChars(
  db: PreparationDb,
  assetId: string,
  userId: string,
  indexedChars: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(indexedChars) || indexedChars < 0) {
    throw new RangeError('Indexed characters are a whole number.');
  }
  const rows = await db.query<{ id: string }>(
    `update public.chat_file_preparations
        set indexed_chars = $2,
            updated_at = now()
      where media_asset_id = $1::uuid
        and user_id = $3
      returning id`,
    [assetId, indexedChars, userId],
  );
  return rows.length > 0;
}

/**
 * A step that died without throwing never advances its cursor again, so a
 * turn would keep saying the file is still being read. Runs on the sweeper's
 * owner connection.
 */
export async function failStalledPreparations(
  db: PreparationDb,
  options: { stalledForMs: number; limit: number },
): Promise<string[]> {
  if (!Number.isSafeInteger(options.stalledForMs) || options.stalledForMs <= 0) {
    throw new RangeError('A stall window is a positive whole number of milliseconds.');
  }
  const rows = await db.query<{ id: string }>(
    `update public.chat_file_preparations
        set state = 'prepare_failed',
            error = 'stalled',
            updated_at = now()
      where id in (
              select id
                from public.chat_file_preparations
               where state = 'preparing'
                 and updated_at < now() - ($1::bigint * interval '1 millisecond')
               order by updated_at
               limit $2
            )
        and state = 'preparing'
        and updated_at < now() - ($1::bigint * interval '1 millisecond')
      returning id`,
    [options.stalledForMs, options.limit],
  );
  return rows.map((row) => String(row.id));
}

export interface OrphanedPreparation {
  id: string;
  userId: string;
  derivedKeys: string[];
  /** Postgres's own text for the timestamp, so comparing it back loses no microseconds. */
  updatedAt: string;
}

export async function listOrphanedPreparations(
  db: PreparationDb,
  options: { limit: number },
): Promise<OrphanedPreparation[]> {
  const rows = await db.query<{
    id: string;
    user_id: string;
    derived_keys: string[] | null;
    updated_at: string;
  }>(
    `select id, user_id, derived_keys, updated_at::text as updated_at
       from public.chat_file_preparations
      where media_asset_id is null
      order by updated_at
      limit $1`,
    [options.limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    derivedKeys: row.derived_keys ?? [],
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Deletes an orphaned row only if it is unchanged since the caller listed it:
 * the same key list, so a key appended in between is never lost, and the same
 * `updated_at`, because a step lists its keys before writing them and may
 * write and advance after the caller deleted the objects it was listed with.
 */
export async function deleteOrphanedPreparation(
  db: PreparationDb,
  orphan: OrphanedPreparation,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from public.chat_file_preparations
      where id = $1::uuid
        and user_id = $4
        and media_asset_id is null
        and derived_keys = $2::text[]
        and updated_at = $3::timestamptz
      returning id`,
    [orphan.id, orphan.derivedKeys, orphan.updatedAt, orphan.userId],
  );
  return rows.length > 0;
}
