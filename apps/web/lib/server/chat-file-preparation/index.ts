import 'server-only';

import type { ChatLargeFilePreparedKind } from '@agiworkforce/cloud-contracts';
import {
  CHAT_LARGE_FILE_POLICY,
  MAX_CHAT_ATTACHMENT_BYTES,
  chatLargeFileKind,
  type ChatLargeFilePolicy,
} from '@/lib/chat-attachment-policy';
import { logger } from '@/lib/logger';
import { chatFileSchemaReady } from '@/lib/server/chat-file-intake/schema';
import { getMediaAssetById, type MediaAssetForServing } from '@/lib/server/media-assets';
import {
  defaultPreparationStorage,
  outlineKey,
  pagesIndexKey,
  preparationKeyPrefix,
  PREPARED_INDEX_CONTENT_TYPE,
  PREPARED_TEXT_CONTENT_TYPE,
  readWholeObject,
  serializeOutline,
  serializePagesIndex,
  sourceObjectLength,
  textSegmentKey,
  writeDerivedObject,
  type PreparationStorage,
  type PreparedOutlineAnchor,
  type PreparedPageEntry,
} from './derived-keys';
import {
  delimiterFor,
  initialDelimitedCursor,
  parseDelimitedCursor,
  readDelimitedBatch,
} from './delimited';
import { prepareOfficeText } from './office';
import { readPdfBatch } from './pdf';
import {
  advancePreparation,
  findPreparationById,
  listPreparationKeys,
  openPreparation,
  PreparationRefusedError,
  type PreparationAdvance,
  type PreparationCoverage,
  type PreparationCursor,
  type PreparationDb,
  type PreparationFailureReason,
  type PreparationRef,
  type PreparationRow,
  type PreparationState,
} from './progress-store';
import { prepareWorkbook } from './spreadsheet';
import {
  extractNotebookCellText,
  readTextBatch,
  sliceWholeCodePoints,
  splitIntoSegments,
} from './text-stream';

export {
  deleteOrphanedPreparation,
  failStalledPreparations,
  listOrphanedPreparations,
  PREPARATION_FAILURE_REASONS,
  PREPARATION_STATES,
  recordPreparedIndexedChars,
  type OrphanedPreparation,
  type PreparationCoverage,
  type PreparationDb,
  type PreparationFailureReason,
  type PreparationState,
} from './progress-store';
export {
  countSavedOcrPages,
  isOcrPageListed,
  PreparedSegmentUnreadableError,
  readPreparedCard,
  readPreparedPage,
  readPreparedText,
  savePreparedPageText,
  sumIndexedCharsForUser,
  type PreparedFileCard,
  type PreparedPage,
  type PreparedReaderDeps,
  type PreparedTextSlice,
  type SavedPageText,
} from './readers';
export type { PreparationStorage, PreparedOutlineAnchor } from './derived-keys';

export interface PreparationDeps {
  db: PreparationDb;
  storage?: PreparationStorage;
  policy?: ChatLargeFilePolicy;
}

export type PreparationStepResult =
  | {
      outcome: 'not_prepared';
      reason: 'schema_absent' | 'asset_missing' | 'inline' | 'unsupported_kind';
      done: true;
    }
  | { outcome: 'advanced' | 'finished'; state: PreparationState; done: boolean }
  | { outcome: 'superseded'; done: true };

interface DerivedObject {
  key: string;
  body: string;
  contentType: string;
}

interface StepPlan {
  objects: DerivedObject[];
  advance: PreparationAdvance;
}

interface StepContext {
  assetId: string;
  row: PreparationRow;
  asset: MediaAssetForServing & { storagePathname: string; byteSize: number };
  fileName: string;
  kind: ChatLargeFilePreparedKind;
  policy: ChatLargeFilePolicy;
  storage: PreparationStorage;
  prefix: string;
}

interface TextProgress {
  cursor: PreparationCursor;
  state: PreparationState;
  pagesRead?: number;
  pageCount?: number | null;
  sheetCount?: number | null;
  coverage?: Record<string, unknown>;
  objects?: DerivedObject[];
}

function notPrepared(
  reason: 'schema_absent' | 'asset_missing' | 'inline' | 'unsupported_kind',
): PreparationStepResult {
  return { outcome: 'not_prepared', reason, done: true };
}

function remainingChars(context: StepContext): number {
  return Math.max(context.policy.preparation.maxTextChars - context.row.coverage.textChars, 0);
}

/** Appends `text` as the next segments after the ones the row already trusts. */
function textPlan(context: StepContext, text: string, progress: TextProgress): StepPlan {
  const { row } = context;
  const segments =
    text.length > 0 ? splitIntoSegments(text, context.policy.preparation.segmentBytes) : [];
  const objects: DerivedObject[] = segments.map((segment, index) => ({
    key: textSegmentKey(context.prefix, row.segmentsReady + index + 1),
    body: segment,
    contentType: PREPARED_TEXT_CONTENT_TYPE,
  }));
  objects.push(...(progress.objects ?? []));
  const coverage: PreparationCoverage = {
    ...row.coverage,
    ...progress.coverage,
    segmentChars: [
      ...row.coverage.segmentChars.slice(0, row.segmentsReady),
      ...segments.map((segment) => segment.length),
    ],
    textChars: row.coverage.textChars + text.length,
  };
  return {
    objects,
    advance: {
      cursor: progress.cursor,
      state: progress.state,
      segmentsReady: row.segmentsReady + segments.length,
      pagesRead: progress.pagesRead ?? row.pagesRead,
      pageCount: progress.pageCount === undefined ? row.pageCount : progress.pageCount,
      sheetCount: progress.sheetCount === undefined ? row.sheetCount : progress.sheetCount,
      coverage,
      error: null,
      addedKeys: objects.map((object) => object.key),
    },
  };
}

function failurePlan(row: PreparationRow, reason: PreparationFailureReason): StepPlan {
  return {
    objects: [],
    advance: {
      cursor: row.cursor,
      state: 'prepare_failed',
      segmentsReady: row.segmentsReady,
      pagesRead: row.pagesRead,
      pageCount: row.pageCount,
      sheetCount: row.sheetCount,
      coverage: row.coverage,
      error: reason,
      addedKeys: [],
    },
  };
}

function nextPdfPage(cursor: PreparationCursor): number {
  const page = cursor['nextPage'];
  return typeof page === 'number' && Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

async function pdfStep(context: StepContext): Promise<StepPlan> {
  const fromPage = nextPdfPage(context.row.cursor);
  const budget = remainingChars(context);
  const batch = await readPdfBatch({
    storage: context.storage,
    key: context.asset.storagePathname,
    byteCount: context.asset.byteSize,
    policy: context.policy,
    fromPage,
    remainingChars: budget,
    withOutline: fromPage === 1,
  });

  const base = context.row.coverage.textChars;
  const entries: PreparedPageEntry[] = [];
  const bodyStarts: number[] = [];
  let text = '';
  for (const { page, text: pageText } of batch.pages) {
    const start = base + text.length;
    const header = `[Page ${page}]\n`;
    if (pageText) text += `${header}${pageText}\n\n`;
    entries.push({ page, start, end: base + text.length, hasText: pageText.length > 0 });
    bodyStarts.push(start + header.length);
  }
  const truncated = text.length > budget;
  if (truncated) text = sliceWholeCodePoints(text, budget);
  let limit = base + text.length;
  const firstUnread = entries.findIndex(
    (entry, index) => entry.hasText && bodyStarts[index]! >= limit,
  );
  if (firstUnread !== -1) {
    limit = entries[firstUnread]!.start;
    text = text.slice(0, limit - base);
    entries.length = firstUnread;
  }
  for (const entry of entries) {
    entry.start = Math.min(entry.start, limit);
    entry.end = Math.min(entry.end, limit);
  }

  const lastRead = entries.at(-1)?.page ?? fromPage - 1;
  const readable = Math.min(batch.pageCount, context.policy.kinds.pdf.maxTextPages);
  const finished = truncated || lastRead >= readable;
  const state: PreparationState = !finished
    ? 'preparing'
    : truncated || batch.pageCount > readable
      ? 'ready_partial'
      : 'ready';

  const objects: DerivedObject[] = [];
  if (entries.length > 0) {
    objects.push({
      key: pagesIndexKey(context.prefix, fromPage),
      body: serializePagesIndex(entries),
      contentType: PREPARED_INDEX_CONTENT_TYPE,
    });
  }
  if (batch.outline && batch.outline.length > 0) {
    const anchors: PreparedOutlineAnchor[] = batch.outline;
    objects.push({
      key: outlineKey(context.prefix),
      body: serializeOutline(anchors),
      contentType: PREPARED_INDEX_CONTENT_TYPE,
    });
  }
  const pagesWithoutText =
    Number(context.row.coverage['pagesWithoutText'] ?? 0) +
    entries.filter((entry) => !entry.hasText).length;
  return textPlan(context, text, {
    cursor: { nextPage: lastRead + 1 },
    state,
    pagesRead: lastRead,
    pageCount: batch.pageCount,
    coverage: { pagesWithoutText, ...(truncated ? { textTruncated: true } : {}) },
    objects,
  });
}

async function textStep(context: StepContext): Promise<StepPlan> {
  const offset = context.row.cursor['byteOffset'];
  const batch = await readTextBatch({
    storage: context.storage,
    key: context.asset.storagePathname,
    byteCount: context.asset.byteSize,
    byteOffset: typeof offset === 'number' ? offset : 0,
    bytesPerStep: context.policy.kinds.text.bytesPerStep,
    remainingChars: remainingChars(context),
  });
  const state: PreparationState = batch.truncated
    ? 'ready_partial'
    : batch.reachedEnd
      ? 'ready'
      : 'preparing';
  return textPlan(context, batch.text, {
    cursor: { byteOffset: batch.nextOffset },
    state,
    ...(batch.truncated ? { coverage: { textTruncated: true } } : {}),
  });
}

async function delimitedStep(context: StepContext): Promise<StepPlan> {
  const cursor =
    parseDelimitedCursor(context.row.cursor) ??
    initialDelimitedCursor(delimiterFor(context.fileName, context.asset.mimeType), context.assetId);
  const batch = await readDelimitedBatch({
    storage: context.storage,
    key: context.asset.storagePathname,
    byteCount: context.asset.byteSize,
    cursor,
    policy: context.policy,
  });
  if (!batch.finished) {
    return textPlan(context, '', { cursor: batch.cursor, state: 'preparing' });
  }
  return textPlan(context, sliceWholeCodePoints(batch.text ?? '', remainingChars(context)), {
    cursor: { byteOffset: batch.cursor.byteOffset },
    state: 'ready',
    coverage: { table: batch.profile },
  });
}

async function wholeFile(context: StepContext): Promise<Uint8Array> {
  return readWholeObject(context.storage, context.asset.storagePathname, context.asset.byteSize);
}

async function officeStep(context: StepContext): Promise<StepPlan> {
  const prepared = await prepareOfficeText({
    data: await wholeFile(context),
    fileName: context.fileName,
    mimeType: context.asset.mimeType,
    policy: context.policy,
  });
  return textPlan(context, prepared.text, {
    cursor: { done: true },
    state: prepared.truncated || prepared.slidesOmitted > 0 ? 'ready_partial' : 'ready',
    ...(prepared.truncated || prepared.slidesOmitted > 0
      ? {
          coverage: {
            ...(prepared.truncated ? { textTruncated: true } : {}),
            ...(prepared.slidesOmitted > 0 ? { slidesOmitted: prepared.slidesOmitted } : {}),
          },
        }
      : {}),
    objects:
      prepared.outline.length > 0
        ? [
            {
              key: outlineKey(context.prefix),
              body: serializeOutline(prepared.outline),
              contentType: PREPARED_INDEX_CONTENT_TYPE,
            },
          ]
        : [],
  });
}

async function spreadsheetStep(context: StepContext): Promise<StepPlan> {
  const workbook = await prepareWorkbook({
    data: await wholeFile(context),
    fileName: context.fileName,
    policy: context.policy,
  });
  const budget = remainingChars(context);
  const truncated = workbook.text.length > budget;
  return textPlan(context, sliceWholeCodePoints(workbook.text, budget), {
    cursor: { done: true },
    state: workbook.partial || truncated ? 'ready_partial' : 'ready',
    sheetCount: workbook.sheetCount,
    coverage: { sheets: workbook.sheets, ...(truncated ? { textTruncated: true } : {}) },
  });
}

async function notebookStep(context: StepContext): Promise<StepPlan> {
  const text = extractNotebookCellText(await wholeFile(context), context.policy.kinds.notebook);
  const budget = remainingChars(context);
  const truncated = text.length > budget;
  return textPlan(context, sliceWholeCodePoints(text, budget), {
    cursor: { done: true },
    state: truncated ? 'ready_partial' : 'ready',
    ...(truncated ? { coverage: { textTruncated: true } } : {}),
  });
}

const STEP_BY_KIND: Readonly<
  Record<ChatLargeFilePreparedKind, (context: StepContext) => Promise<StepPlan>>
> = {
  pdf: pdfStep,
  office: officeStep,
  spreadsheet: spreadsheetStep,
  delimited: delimitedStep,
  text: textStep,
  html: textStep,
  notebook: notebookStep,
};

function isPreparedKind(kind: string): kind is ChatLargeFilePreparedKind {
  return Object.hasOwn(STEP_BY_KIND, kind);
}

async function planStep(context: StepContext): Promise<StepPlan> {
  const { asset, kind, policy } = context;
  if (asset.byteSize > policy.kinds[kind].maxBytes) {
    throw new PreparationRefusedError('over_kind_limit');
  }
  if (
    kind === 'pdf' &&
    !policy.kinds.pdf.rangeLoading &&
    asset.byteSize > policy.kinds.pdf.bufferedMaxBytes
  ) {
    throw new PreparationRefusedError('too_large_for_buffered_read');
  }
  const stored = await sourceObjectLength(context.storage, asset.storagePathname);
  if (stored === null) throw new PreparationRefusedError('source_missing');
  if (stored !== asset.byteSize) throw new PreparationRefusedError('source_size_mismatch');
  return STEP_BY_KIND[kind](context);
}

/**
 * Objects this step wrote that no row lists have no other cleaner: erasure
 * and the sweeper find derived objects only through `derived_keys`. A key a
 * row lists belongs to the run that recorded it, and deterministic keys mean
 * it holds the same bytes, so it stays.
 */
async function discardUnlisted(
  db: PreparationDb,
  storage: PreparationStorage,
  ref: PreparationRef,
  written: readonly string[],
): Promise<void> {
  if (written.length === 0) return;
  const current = await findPreparationById(db, ref);
  const listed = new Set(current?.derivedKeys ?? []);
  for (const key of written) {
    if (listed.has(key)) continue;
    try {
      await storage.store.delete(storage.bucket, key);
    } catch (error) {
      logger.warn(
        { objectKey: key, error: error instanceof Error ? error.message : String(error) },
        'Unrecorded chat file preparation object could not be deleted',
      );
    }
  }
}

async function commit(
  db: PreparationDb,
  storage: PreparationStorage,
  row: PreparationRow,
  plan: StepPlan,
): Promise<PreparationStepResult> {
  const keys = [...new Set(plan.objects.map((object) => object.key))];
  const listed = new Set(row.derivedKeys);
  if (
    keys.some((key) => !listed.has(key)) &&
    !(await listPreparationKeys(db, row, row.cursor, keys))
  ) {
    return { outcome: 'superseded', done: true };
  }
  for (const object of plan.objects) {
    await writeDerivedObject(storage, object.key, object.body, object.contentType);
  }
  const advanced = await advancePreparation(db, row, row.cursor, {
    ...plan.advance,
    addedKeys: keys,
  });
  if (!advanced) {
    await discardUnlisted(db, storage, row, keys);
    return { outcome: 'superseded', done: true };
  }
  const done = advanced.state !== 'preparing';
  return { outcome: done ? 'finished' : 'advanced', state: advanced.state, done };
}

/**
 * Advances one sealed chat file's preparation by one bounded batch. The
 * caller loops until `done`; a step payload is the asset id, never bytes.
 * Everything a step writes is under deterministic keys, listed on the row
 * before it is written and written before the row's cursor moves, so a
 * retried step rewrites the same objects and none is ever unlisted.
 */
export async function prepareChatFileStep(
  assetId: string,
  deps: PreparationDeps,
): Promise<PreparationStepResult> {
  const { db } = deps;
  const policy = deps.policy ?? CHAT_LARGE_FILE_POLICY;
  if (!(await chatFileSchemaReady(db, { cached: true }))) return notPrepared('schema_absent');

  const asset = await getMediaAssetById(assetId, db);
  if (!asset || asset.deletedAt !== null || asset.storagePathname === null) {
    return notPrepared('asset_missing');
  }
  if (asset.byteSize === null || asset.byteSize <= MAX_CHAT_ATTACHMENT_BYTES) {
    return notPrepared('inline');
  }
  const fileName = typeof asset.metadata['filename'] === 'string' ? asset.metadata['filename'] : '';
  const kind = chatLargeFileKind(fileName, asset.mimeType);
  if (kind === null || kind === 'image') return notPrepared('unsupported_kind');

  const row = await openPreparation(db, {
    assetId,
    userId: asset.userId,
    organizationId: asset.organizationId,
    kind,
    preparerVersion: policy.preparation.preparerVersion,
  });
  if (!row) return notPrepared('asset_missing');
  if (row.state !== 'preparing') return { outcome: 'finished', state: row.state, done: true };

  const storage = deps.storage ?? defaultPreparationStorage();
  if (!isPreparedKind(row.kind)) return commit(db, storage, row, failurePlan(row, 'unreadable'));
  const context: StepContext = {
    assetId,
    row,
    asset: { ...asset, storagePathname: asset.storagePathname, byteSize: asset.byteSize },
    fileName,
    kind: row.kind,
    policy,
    storage,
    prefix: preparationKeyPrefix(row.userId, assetId, row.preparerVersion),
  };
  let plan: StepPlan;
  try {
    plan = await planStep(context);
  } catch (error) {
    if (!(error instanceof PreparationRefusedError)) throw error;
    plan = failurePlan(row, error.reason);
  }
  return commit(db, storage, row, plan);
}
