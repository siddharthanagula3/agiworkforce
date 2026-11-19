import 'server-only';

import { CHAT_LARGE_FILE_POLICY, type ChatLargeFilePolicy } from '@/lib/chat-attachment-policy';
import { logger } from '@/lib/logger';
import { chatFileSchemaReady } from '@/lib/server/chat-file-intake/schema';
import {
  defaultPreparationStorage,
  ocrPageKey,
  ocrPrefix,
  outlineKey,
  pagesIndexFirstPage,
  parseOutline,
  parsePagesIndex,
  preparationKeyPrefix,
  PREPARED_TEXT_CONTENT_TYPE,
  readDerivedText,
  textSegmentKey,
  writeDerivedObject,
  type PreparationStorage,
  type PreparedOutlineAnchor,
  type PreparedPageEntry,
} from './derived-keys';
import {
  mapPreparationRow,
  PREPARATION_COLUMNS,
  type PreparationCoverage,
  type PreparationDb,
  type PreparationRow,
  type PreparationState,
} from './progress-store';

export interface PreparedReaderDeps {
  db: PreparationDb;
  /** Every statement on the file's row also requires this owner. */
  userId: string;
  storage?: PreparationStorage;
  policy?: ChatLargeFilePolicy;
}

export class PreparedSegmentUnreadableError extends Error {
  constructor(
    readonly assetId: string,
    readonly segment: number,
  ) {
    super(`Prepared text segment ${segment} of a chat file is missing or does not match its row.`);
    this.name = 'PreparedSegmentUnreadableError';
  }
}

async function loadPreparation(
  db: PreparationDb,
  assetId: string,
  userId: string,
): Promise<PreparationRow | null> {
  if (!(await chatFileSchemaReady(db, { cached: true }))) return null;
  const [row] = await db.query<Record<string, unknown>>(
    `select ${PREPARATION_COLUMNS}
       from public.chat_file_preparations
      where media_asset_id = $1::uuid
        and user_id = $2`,
    [assetId, userId],
  );
  return row ? mapPreparationRow(row) : null;
}

function readySegmentChars(row: PreparationRow): number[] {
  return row.coverage.segmentChars.slice(0, row.segmentsReady);
}

function rowPrefix(row: PreparationRow, assetId: string): string {
  return preparationKeyPrefix(row.userId, assetId, row.preparerVersion);
}

function listed(row: PreparationRow, key: string): boolean {
  return row.derivedKeys.includes(key);
}

function listedOcrCount(row: PreparationRow, assetId: string): number {
  const ocrKeys = ocrPrefix(rowPrefix(row, assetId));
  return row.derivedKeys.filter((key) => key.startsWith(ocrKeys)).length;
}

function listedPageIndexes(
  row: PreparationRow,
  assetId: string,
): { key: string; firstPage: number }[] {
  const prefix = rowPrefix(row, assetId);
  return row.derivedKeys
    .map((key) => ({ key, firstPage: pagesIndexFirstPage(prefix, key) }))
    .filter(
      (index): index is { key: string; firstPage: number } =>
        index.firstPage !== null && index.firstPage <= row.pagesRead,
    )
    .sort((a, b) => a.firstPage - b.firstPage);
}

/** Entries for pages the row has committed, never ones a step wrote and did not record. */
async function readPageEntries(
  row: PreparationRow,
  indexes: readonly { key: string }[],
  storage: PreparationStorage,
): Promise<PreparedPageEntry[]> {
  const entries: PreparedPageEntry[] = [];
  for (const index of indexes) {
    const text = await readDerivedText(storage, index.key);
    if (text === null) continue;
    entries.push(...parsePagesIndex(text).filter((entry) => entry.page <= row.pagesRead));
  }
  return entries;
}

export interface PreparedFileCard {
  assetId: string;
  kind: string;
  state: PreparationState;
  segmentsReady: number;
  textChars: number;
  pageCount: number | null;
  pagesRead: number;
  sheetCount: number | null;
  indexedChars: number;
  coverage: PreparationCoverage;
  outline: PreparedOutlineAnchor[];
  error: string | null;
  updatedAt: string;
}

/** Null means there is no preparation: never written, or the schema is not there. */
export async function readPreparedCard(
  assetId: string,
  deps: PreparedReaderDeps,
): Promise<PreparedFileCard | null> {
  const row = await loadPreparation(deps.db, assetId, deps.userId);
  if (!row) return null;
  const key = outlineKey(rowPrefix(row, assetId));
  let outline: PreparedOutlineAnchor[] = [];
  if (listed(row, key)) {
    const text = await readDerivedText(deps.storage ?? defaultPreparationStorage(), key);
    outline = text === null ? [] : parseOutline(text);
  }
  return {
    assetId,
    kind: row.kind,
    state: row.state,
    segmentsReady: row.segmentsReady,
    textChars: readySegmentChars(row).reduce((total, chars) => total + chars, 0),
    pageCount: row.pageCount,
    pagesRead: row.pagesRead,
    sheetCount: row.sheetCount,
    indexedChars: row.indexedChars,
    coverage: row.coverage,
    outline,
    error: row.error,
    updatedAt: row.updatedAt,
  };
}

export interface PreparedTextSlice {
  text: string;
  startChar: number;
  endChar: number;
  totalChars: number;
  state: PreparationState;
  reachedEnd: boolean;
  pageAnchors: { page: number; char: number }[];
}

async function sliceOfRow(
  row: PreparationRow,
  assetId: string,
  startChar: number,
  maxChars: number,
  storage: PreparationStorage,
): Promise<PreparedTextSlice> {
  const segmentChars = readySegmentChars(row);
  const totalChars = segmentChars.reduce((total, chars) => total + chars, 0);
  const start = Math.min(startChar, totalChars);
  const end = Math.min(start + maxChars, totalChars);
  const prefix = rowPrefix(row, assetId);
  const parts: string[] = [];
  let segmentStart = 0;
  for (const [index, chars] of segmentChars.entries()) {
    const segmentEnd = segmentStart + chars;
    if (segmentEnd > start && segmentStart < end) {
      const segment = index + 1;
      const key = textSegmentKey(prefix, segment);
      const text = listed(row, key) ? await readDerivedText(storage, key) : null;
      if (text === null || text.length !== chars) {
        throw new PreparedSegmentUnreadableError(assetId, segment);
      }
      parts.push(
        text.slice(Math.max(start - segmentStart, 0), Math.min(end, segmentEnd) - segmentStart),
      );
    }
    if (segmentEnd >= end) break;
    segmentStart = segmentEnd;
  }
  const pageAnchors =
    row.kind === 'pdf' && end > start
      ? (await readPageEntries(row, listedPageIndexes(row, assetId), storage))
          .filter((entry) => entry.hasText && entry.start >= start && entry.start < end)
          .map((entry) => ({ page: entry.page, char: entry.start }))
      : [];
  return {
    text: parts.join(''),
    startChar: start,
    endChar: end,
    totalChars,
    state: row.state,
    reachedEnd: end >= totalChars,
    pageAnchors,
  };
}

/**
 * Text that is finished, never more: only segments numbered up to
 * `segments_ready` are read, so a file still preparing yields what is done.
 */
export async function readPreparedText(
  assetId: string,
  range: { startChar: number; maxChars: number },
  deps: PreparedReaderDeps,
): Promise<PreparedTextSlice | null> {
  if (!Number.isSafeInteger(range.startChar) || range.startChar < 0) {
    throw new RangeError('startChar is a whole number of characters.');
  }
  if (!Number.isSafeInteger(range.maxChars) || range.maxChars < 0) {
    throw new RangeError('maxChars is a whole number of characters.');
  }
  const row = await loadPreparation(deps.db, assetId, deps.userId);
  if (!row) return null;
  const maxChars = Math.min(
    range.maxChars,
    (deps.policy ?? CHAT_LARGE_FILE_POLICY).preparation.maxTextChars,
  );
  return sliceOfRow(
    row,
    assetId,
    range.startChar,
    maxChars,
    deps.storage ?? defaultPreparationStorage(),
  );
}

export type PreparedPage =
  | { status: 'text'; page: number; source: 'text_layer' | 'ocr'; text: string }
  | { status: 'no_text_layer'; page: number }
  | { status: 'not_read'; page: number }
  | { status: 'out_of_range'; page: number }
  | { status: 'not_paged'; page: number };

export async function readPreparedPage(
  assetId: string,
  page: number,
  deps: PreparedReaderDeps,
): Promise<PreparedPage | null> {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError('Pages are numbered from 1.');
  }
  const row = await loadPreparation(deps.db, assetId, deps.userId);
  if (!row) return null;
  if (row.kind !== 'pdf') return { status: 'not_paged', page };
  if (row.pageCount !== null && page > row.pageCount) return { status: 'out_of_range', page };
  const storage = deps.storage ?? defaultPreparationStorage();
  const prefix = rowPrefix(row, assetId);
  const ocrKey = ocrPageKey(prefix, page);
  if (listed(row, ocrKey)) {
    const text = await readDerivedText(storage, ocrKey);
    if (text !== null) return { status: 'text', page, source: 'ocr', text };
  }
  if (page > row.pagesRead) return { status: 'not_read', page };
  const batch = listedPageIndexes(row, assetId)
    .filter((index) => index.firstPage <= page)
    .at(-1);
  const entry = batch
    ? (await readPageEntries(row, [batch], storage)).find((candidate) => candidate.page === page)
    : undefined;
  if (!entry) return { status: 'not_read', page };
  if (!entry.hasText) return { status: 'no_text_layer', page };
  const slice = await sliceOfRow(row, assetId, entry.start, entry.end - entry.start, storage);
  return { status: 'text', page, source: 'text_layer', text: slice.text };
}

/**
 * Scanned pages whose transcription this file has kept, the number the
 * per-file cap counts. Null means there is no preparation.
 */
export async function countSavedOcrPages(
  assetId: string,
  deps: Pick<PreparedReaderDeps, 'db' | 'userId'>,
): Promise<number | null> {
  const row = await loadPreparation(deps.db, assetId, deps.userId);
  return row ? listedOcrCount(row, assetId) : null;
}

/**
 * Whether the file already lists a transcription key for this page, so
 * saving it again takes no slot of the per-file cap. Null means there is no
 * preparation.
 */
export async function isOcrPageListed(
  assetId: string,
  page: number,
  deps: Pick<PreparedReaderDeps, 'db' | 'userId'>,
): Promise<boolean | null> {
  const row = await loadPreparation(deps.db, assetId, deps.userId);
  return row ? listed(row, ocrPageKey(rowPrefix(row, assetId), page)) : null;
}

export type SavedPageText = 'saved' | 'already_saved' | 'cap_reached' | 'no_preparation';

/**
 * Keeps an OCR transcription so a page is paid for once. Its key goes into
 * `derived_keys`, in the same statement that enforces the per-file cap,
 * before the object is written, so no transcription is ever in storage
 * without a row naming it. A key listed by a save that died before its write
 * is written by the next save of that page.
 */
export async function savePreparedPageText(
  assetId: string,
  page: number,
  text: string,
  deps: PreparedReaderDeps,
): Promise<SavedPageText> {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError('Pages are numbered from 1.');
  }
  const policy = deps.policy ?? CHAT_LARGE_FILE_POLICY;
  if (Buffer.byteLength(text, 'utf8') > policy.preparation.segmentBytes) {
    throw new RangeError('A transcribed page is larger than one prepared segment.');
  }
  const row = await loadPreparation(deps.db, assetId, deps.userId);
  if (!row || row.kind !== 'pdf') return 'no_preparation';
  if (row.pageCount !== null && page > row.pageCount) return 'no_preparation';
  const prefix = rowPrefix(row, assetId);
  const key = ocrPageKey(prefix, page);
  const storage = deps.storage ?? defaultPreparationStorage();
  const keepIfStillListed = async (): Promise<SavedPageText> => {
    await writeDerivedObject(storage, key, text, PREPARED_TEXT_CONTENT_TYPE);
    const current = await loadPreparation(deps.db, assetId, deps.userId);
    if (current && listed(current, key)) return 'saved';
    await storage.store.delete(storage.bucket, key).catch((error: unknown) => {
      logger.warn(
        { objectKey: key, error: error instanceof Error ? error.message : String(error) },
        'Unrecorded chat file preparation object could not be deleted',
      );
    });
    return 'no_preparation';
  };
  if (listed(row, key)) {
    if (await storage.store.head(storage.bucket, key)) return 'already_saved';
    return keepIfStillListed();
  }
  if (listedOcrCount(row, assetId) >= policy.kinds.pdf.maxOcrPagesPerFile) return 'cap_reached';

  const rows = await deps.db.query<{ id: string }>(
    `update public.chat_file_preparations
        set derived_keys = derived_keys || array[$2::text],
            updated_at = now()
      where media_asset_id = $1::uuid
        and not ($2::text = any(derived_keys))
        and (select count(*)
               from unnest(derived_keys) as existing(key)
              where starts_with(existing.key, $3::text)) < $4
        and user_id = $5
      returning id`,
    [assetId, key, ocrPrefix(prefix), policy.kinds.pdf.maxOcrPagesPerFile, deps.userId],
  );
  if (rows.length > 0) return keepIfStillListed();

  const current = await loadPreparation(deps.db, assetId, deps.userId);
  if (current && listed(current, key)) return 'already_saved';
  return current ? 'cap_reached' : 'no_preparation';
}

/** Characters already indexed across the person's prepared chat files, for the per-person cap. */
export async function sumIndexedCharsForUser(
  userId: string,
  deps: Pick<PreparedReaderDeps, 'db'>,
): Promise<number> {
  if (!(await chatFileSchemaReady(deps.db, { cached: true }))) return 0;
  const [row] = await deps.db.query<{ indexed_chars: string | number | null }>(
    `select coalesce(sum(indexed_chars), 0)::bigint as indexed_chars
       from public.chat_file_preparations
      where user_id = $1
        and media_asset_id is not null`,
    [userId],
  );
  return Number(row?.indexed_chars ?? 0);
}
