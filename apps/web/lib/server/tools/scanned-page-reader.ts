import 'server-only';

import { randomUUID } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { CHAT_LARGE_FILE_POLICY, type ChatLargeFilePolicy } from '@/lib/chat-attachment-policy';
import { logger } from '@/lib/logger';
import type { PreparationStorage } from '@/lib/server/chat-file-preparation/derived-keys';
import type { PreparationDb } from '@/lib/server/chat-file-preparation/progress-store';
import {
  countSavedOcrPages,
  isOcrPageListed,
  readPreparedPage,
  savePreparedPageText,
  type SavedPageText,
} from '@/lib/server/chat-file-preparation/readers';
import { storableText } from '@/lib/server/chat-file-preparation/text-stream';
import {
  SCANNED_PAGES_OCR_NOTE,
  transcribeScannedPages,
  type ScannedPageImage,
} from '@/lib/server/scanned-document-text';

export const SCANNED_PAGE_SANDBOX_ONLY_MESSAGE =
  "This page has no text layer and can't be read here. The whole file is in the code sandbox.";
export const SCANNED_PAGE_UNREADABLE_MESSAGE = 'This page has no text layer and could not be read.';
export const SCANNED_PAGE_TURN_CAP_MESSAGE =
  'This page has no text layer, and this turn has already read as many scanned pages as it can. Ask again in a new message to read it.';
export const SCANNED_PAGE_FILE_CAP_MESSAGE =
  'This page has no text layer, and this file has already had as many scanned pages read as it can.';

export interface ScannedPageRenderRequest {
  assetId: string;
  storagePathname: string;
  byteSize: number;
  pages: readonly number[];
}

/** Page images of a stored PDF, read by range; a page it cannot render is left out. */
export type ScannedPageRenderer = (
  request: ScannedPageRenderRequest,
) => Promise<ReadonlyMap<number, ScannedPageImage>>;

/**
 * Given only in an entitled managed turn. `turn` is shared by every file-tool
 * call of the turn, so parallel calls cannot together pass the per-turn cap.
 */
export interface ScannedPageOcr {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  planTier: string;
  forceNoTraining?: boolean;
  renderPages: ScannedPageRenderer;
  turn: { pagesTranscribed: number; filesAtOcrCap?: Set<string> };
}

export interface ScannedPageReaderDeps {
  db: PreparationDb;
  userId: string;
  storage?: PreparationStorage;
  policy?: ChatLargeFilePolicy;
}

export type ScannedPageReading =
  | { status: 'read'; pages: { page: number; text: string }[]; note: string }
  | { status: 'unavailable'; message: string };

async function followingScannedPages(
  assetId: string,
  page: number,
  limit: number,
  deps: ScannedPageReaderDeps,
): Promise<number[]> {
  const pages = [page];
  for (let next = page + 1; pages.length < limit; next += 1) {
    const prepared = await readPreparedPage(assetId, next, deps);
    if (prepared?.status !== 'no_text_layer') break;
    pages.push(next);
  }
  return pages;
}

async function transcribePage(
  ocr: ScannedPageOcr,
  assetId: string,
  page: number,
  image: ScannedPageImage | undefined,
): Promise<string | null> {
  if (!image) return null;
  try {
    const text = await transcribeScannedPages({
      db: ocr.db,
      userId: ocr.userId,
      organizationId: ocr.organizationId,
      planTier: ocr.planTier,
      documentId: `${assetId}:p${page}:${randomUUID().replaceAll('-', '')}`,
      pageImages: [image],
      ...(ocr.forceNoTraining === true ? { forceNoTraining: true } : {}),
    });
    return text === null ? null : storableText(text);
  } catch (error) {
    logger.warn({ err: error, assetId, page }, '[file-tools] scanned page transcription refused');
    return null;
  }
}

async function savePage(
  assetId: string,
  page: number,
  text: string,
  deps: ScannedPageReaderDeps,
): Promise<SavedPageText | 'failed'> {
  try {
    return await savePreparedPageText(assetId, page, text, deps);
  } catch (error) {
    logger.warn(
      { err: error, assetId, page },
      '[file-tools] scanned page transcription was not saved',
    );
    return 'failed';
  }
}

/**
 * Reads a page that has no text layer, with the pages after it that have
 * none either, up to one OCR batch. Each page is transcribed in a call of its
 * own because a batch's transcription comes back as one text that cannot be
 * split by page, and a page must be saved alone to be paid for once. The
 * pages the file has already kept are counted first, so a file at its cap
 * costs nothing and a batch is cut to the pages it has left; a page whose key
 * the file already lists, left by a save that died before its write, is still
 * read at the cap because saving it takes no new slot. Pages then go
 * one at a time, and a save that is refused for the cap ends the batch, so
 * parallel calls that raced past the count pay for at most one page unsaved.
 */
export async function readScannedPages(input: {
  assetId: string;
  source: { storagePathname: string; byteSize: number };
  page: number;
  ocr: ScannedPageOcr | null | undefined;
  deps: ScannedPageReaderDeps;
}): Promise<ScannedPageReading> {
  const policy = (input.deps.policy ?? CHAT_LARGE_FILE_POLICY).kinds.pdf;
  if (!policy.rangeLoading)
    return { status: 'unavailable', message: SCANNED_PAGE_SANDBOX_ONLY_MESSAGE };
  const { ocr } = input;
  if (!ocr) return { status: 'unavailable', message: SCANNED_PAGE_UNREADABLE_MESSAGE };
  if (ocr.turn.filesAtOcrCap?.has(input.assetId)) {
    return { status: 'unavailable', message: SCANNED_PAGE_FILE_CAP_MESSAGE };
  }
  if (ocr.turn.pagesTranscribed >= policy.ocrPagesPerTurn) {
    return { status: 'unavailable', message: SCANNED_PAGE_TURN_CAP_MESSAGE };
  }

  const saved = await countSavedOcrPages(input.assetId, input.deps);
  if (saved === null) return { status: 'unavailable', message: SCANNED_PAGE_UNREADABLE_MESSAGE };
  let slotsInFile = policy.maxOcrPagesPerFile - saved;
  if (slotsInFile <= 0) {
    if (!(await isOcrPageListed(input.assetId, input.page, input.deps))) {
      (ocr.turn.filesAtOcrCap ??= new Set()).add(input.assetId);
      return { status: 'unavailable', message: SCANNED_PAGE_FILE_CAP_MESSAGE };
    }
    slotsInFile = 1;
  }

  const candidates = await followingScannedPages(
    input.assetId,
    input.page,
    Math.min(policy.ocrBatchPages, policy.ocrPagesPerTurn - ocr.turn.pagesTranscribed, slotsInFile),
    input.deps,
  );
  const batch = candidates.slice(
    0,
    Math.max(policy.ocrPagesPerTurn - ocr.turn.pagesTranscribed, 0),
  );
  if (batch.length === 0) return { status: 'unavailable', message: SCANNED_PAGE_TURN_CAP_MESSAGE };
  ocr.turn.pagesTranscribed += batch.length;

  let images: ReadonlyMap<number, ScannedPageImage>;
  try {
    images = await ocr.renderPages({ assetId: input.assetId, ...input.source, pages: batch });
  } catch (error) {
    ocr.turn.pagesTranscribed -= batch.length;
    logger.warn(
      { err: error, assetId: input.assetId },
      '[file-tools] scanned pages could not be rendered',
    );
    return { status: 'unavailable', message: SCANNED_PAGE_UNREADABLE_MESSAGE };
  }

  const pages: { page: number; text: string }[] = [];
  let attempted = 0;
  for (const page of batch) {
    attempted += 1;
    const text = await transcribePage(ocr, input.assetId, page, images.get(page));
    if (text === null) {
      if (page === input.page) break;
      continue;
    }
    pages.push({ page, text });
    const saved = await savePage(input.assetId, page, text, input.deps);
    if (saved === 'cap_reached') (ocr.turn.filesAtOcrCap ??= new Set()).add(input.assetId);
    if (saved !== 'saved' && saved !== 'already_saved') break;
  }
  ocr.turn.pagesTranscribed -= batch.length - attempted;
  if (!pages.some((entry) => entry.page === input.page)) {
    return { status: 'unavailable', message: SCANNED_PAGE_UNREADABLE_MESSAGE };
  }
  return { status: 'read', pages, note: SCANNED_PAGES_OCR_NOTE };
}
