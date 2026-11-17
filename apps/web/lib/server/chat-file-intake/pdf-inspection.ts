import 'server-only';

import type { ChatFileIntakeRefusalCode } from '@agiworkforce/cloud-contracts';

import { chatLargeFileKind, type ChatLargeFilePolicy } from '@/lib/chat-attachment-policy';
import type { UploadScanFinding } from '@/lib/security/upload-scan';
import type { PreparationStorage } from '@/lib/server/chat-file-preparation/derived-keys';
import {
  openStoredPdf,
  PdfSourceReadError,
  readOutline,
  type OpenedPdf,
} from '@/lib/server/chat-file-preparation/pdf';
import { PreparationRefusedError } from '@/lib/server/chat-file-preparation/progress-store';
import { isPdfPasswordError, loadPdfjs, pdfPageText } from '@/lib/server/pdf-attachment-content';
import {
  mergeInspectionFindings,
  openBytesRange,
  scanCredentialRange,
  type OpenObjectRange,
} from './full-inspection';

/**
 * How far the credential scan of a PDF has got: first the file's own bytes,
 * then the text of each page. It holds an offset, a page number and detector
 * names only, never any of the file's text, and moves only through the
 * directive a step returns, so a retried step reads the same bytes and pages
 * again.
 */
export interface PdfInspectionCursor {
  scan: 'pdf';
  etag: string;
  /** The first byte whose detections the next step answers for: the file's length once its bytes are read. */
  ownedFrom: number;
  /** The page the next step's text scan starts at, counted from 1. */
  page: number;
  /** Milliseconds the steps before the next one spent, held to `kinds.pdf.maxScanMs`. */
  scanMs: number;
  findings: UploadScanFinding[];
}

interface UnreadablePdf {
  kind: 'unreadable';
  refusal: ChatFileIntakeRefusalCode;
  reason: string;
}

export type PdfScanOutcome =
  | { kind: 'continue'; cursor: PdfInspectionCursor }
  | { kind: 'finished'; findings: UploadScanFinding[] }
  | { kind: 'rejected'; findings: UploadScanFinding[] }
  | { kind: 'short' }
  | UnreadablePdf;

const PDF_MEDIA_TYPE = 'application/pdf';
const CREDENTIAL_TEXT_TYPE = 'text/plain';
const FIRST_PAGE = 1;
const LINE_BREAK = '\n';

function unreadable(refusal: ChatFileIntakeRefusalCode, reason: string): UnreadablePdf {
  return { kind: 'unreadable', refusal, reason };
}

/**
 * A PDF whose text cannot be read is refused whatever the workspace's policy,
 * with the reasons preparation gives it: a password as encrypted, anything
 * pdf.js refuses as not the type it was declared, and one too large for the
 * whole-file read preparation is set to as over the limits.
 */
const ENCRYPTED = unreadable('encrypted', 'encrypted');
const DAMAGED = unreadable('type_mismatch', 'unreadable');
const TOO_LARGE_FOR_BUFFERED_READ = unreadable('limits_exceeded', 'too_large_for_buffered_read');
const TOO_MANY_PAGES = unreadable('limits_exceeded', 'scan_pages');
const TOO_LONG_TO_READ = unreadable('limits_exceeded', 'scan_time');

/**
 * Whether a reader of the sealed file would open it as a PDF: preparation
 * picks its reader by the kind, the turn's attachment reader by the declared
 * type. A `.pdf` name whose declared type gives a stricter kind, such as a
 * DOCX, is read as that kind by both.
 */
export function pdfScanApplies(row: { fileName: string; mimeType: string }): boolean {
  return (
    chatLargeFileKind(row.fileName, row.mimeType) === 'pdf' ||
    row.mimeType.split(';', 1)[0]?.trim().toLowerCase() === PDF_MEDIA_TYPE
  );
}

/**
 * The share of the inspecting lease one pages step may spend before it hands
 * on from the page it reached. pdf.js extracts a page without yielding to a
 * timer, so a page cannot be cut short, only the next one not started.
 */
const PAGES_STEP_LEASE_SHARE = 3;

export function firstPdfCursor(etag: string): PdfInspectionCursor {
  return { scan: 'pdf', etag, ownedFrom: 0, page: FIRST_PAGE, scanMs: 0, findings: [] };
}

export function isPdfCursor(cursor: { scan?: unknown }): cursor is PdfInspectionCursor {
  return cursor.scan === 'pdf';
}

/** What pdf.js refused, as the refusal it is; a storage failure is thrown so the step is retried. */
function unreadableFrom(error: unknown): UnreadablePdf {
  if (error instanceof PdfSourceReadError) throw error.cause;
  if (error instanceof PreparationRefusedError) {
    return error.reason === 'too_large_for_buffered_read' ? TOO_LARGE_FOR_BUFFERED_READ : DAMAGED;
  }
  return isPdfPasswordError(error) ? ENCRYPTED : DAMAGED;
}

type TextContentItems = Awaited<
  ReturnType<Awaited<ReturnType<OpenedPdf['document']['getPage']>>['getTextContent']>
>['items'];

/** Characters a typesetter may break a long token after, keeping them at the end of the line. */
const WRAPPING_CHARACTERS: ReadonlySet<string> = new Set(['-', '_']);

/**
 * The page's runs end to end, with a line break where pdf.js ends a line: the
 * text pdf.js's own viewer searches. pdf.js already puts a space in a run
 * wherever the glyphs leave a gap, so two runs meet here with nothing between
 * them only where they print as one word, such as a key half of which is set
 * in bold. `unwrapped` is the same text without a line break after a line that
 * ends in a hyphen or an underscore, where a long key wraps at its own
 * separator.
 */
function runsJoined(items: TextContentItems): { printed: string; unwrapped: string } {
  let printed = '';
  let unwrapped = '';
  let lastCharacter = '';
  for (const item of items) {
    if (!('str' in item)) continue;
    printed += item.str;
    unwrapped += item.str;
    if (item.str.length > 0) lastCharacter = item.str.at(-1)!;
    if (!item.hasEOL) continue;
    printed += LINE_BREAK;
    if (!WRAPPING_CHARACTERS.has(lastCharacter)) unwrapped += LINE_BREAK;
    lastCharacter = LINE_BREAK;
  }
  return { printed, unwrapped };
}

type PdfPage = Parameters<typeof pdfPageText>[0];

/**
 * The page as preparation reads it, as its runs print, and with its wrapped
 * lines rejoined, each distinct text once, from one extraction by pdf.js under
 * the step's guard: preparation's own join reads the items already extracted.
 */
async function pageTexts(opened: OpenedPdf, page: number): Promise<string[]> {
  const proxy = await opened.guard(opened.document.getPage(page));
  try {
    const content = await opened.guard(proxy.getTextContent());
    const extracted: Pick<PdfPage, 'getTextContent'> = { getTextContent: async () => content };
    const read = await pdfPageText(extracted as PdfPage);
    const { printed, unwrapped } = runsJoined(content.items);
    return [...new Set([read, printed, unwrapped])];
  } finally {
    proxy.cleanup();
  }
}

/**
 * The outline titles preparation hands to a model with the file's card. An
 * outline it cannot read it hands over empty, so only a storage failure stops
 * the step.
 */
async function outlineText(opened: OpenedPdf): Promise<string> {
  try {
    return (await readOutline(opened)).map((entry) => entry.title).join(LINE_BREAK);
  } catch (error) {
    if (error instanceof PdfSourceReadError) throw error.cause;
    return '';
  }
}

const encoder = new TextEncoder();

async function scanPageText(
  text: string,
): Promise<{ findings: UploadScanFinding[]; rejected: boolean }> {
  const bytes = encoder.encode(text);
  if (bytes.byteLength === 0) return { findings: [], rejected: false };
  const scanned = await scanCredentialRange({
    openRange: openBytesRange(bytes),
    key: 'page',
    mimeType: CREDENTIAL_TEXT_TYPE,
    byteCount: bytes.byteLength,
    ownedFrom: 0,
    ownedTo: bytes.byteLength,
    readsDocument: true,
  });
  if (scanned.kind === 'short') throw new RangeError('Page text in memory read short.');
  return scanned;
}

/**
 * One step of the credential scan of a PDF, held by the caller to the entity
 * tag the head was read under. It reads at most a text step of the file's own
 * bytes, in the windows the text scan uses, which covers uncompressed streams
 * and the plain strings of the information dictionary and XMP metadata; once
 * they are read, it opens the file as preparation does and reads the text of
 * at most a step's pages, as preparation joins a page's runs, as the runs
 * print and with wrapped lines rejoined, and with the first page the outline
 * titles preparation keeps. It starts no page once a share of the inspecting
 * lease has gone, after reading at least one, and refuses the file once the
 * steps together have spent `kinds.pdf.maxScanMs` without reaching its last
 * page. Only the detectors that name a credential format answer over
 * any of it, an `sk-` key only at a word's start, unless the file is declared
 * as text, when its own bytes answer to every detector as the text scan would
 * read them.
 */
export async function scanPdfStep(input: {
  row: { stagingKey: string; byteCount: number };
  cursor: PdfInspectionCursor;
  policy: ChatLargeFilePolicy;
  openRange: OpenObjectRange;
  storage: PreparationStorage;
  declaredAsText: boolean;
  now: () => number;
}): Promise<PdfScanOutcome> {
  const { row, cursor, policy, openRange, storage, declaredAsText, now } = input;
  const startedAt = now();
  const stepBudgetMs = policy.intake.leaseMs.inspecting / PAGES_STEP_LEASE_SHARE;
  const spent = () => now() - startedAt;
  let { ownedFrom, page, findings } = cursor;
  const continueHere = (spentMs: number): PdfScanOutcome => {
    const scanMs = cursor.scanMs + spentMs;
    if (scanMs >= policy.kinds.pdf.maxScanMs) return TOO_LONG_TO_READ;
    return {
      kind: 'continue',
      cursor: { scan: 'pdf', etag: cursor.etag, ownedFrom, page, scanMs, findings },
    };
  };

  if (ownedFrom < row.byteCount) {
    const ownedTo = Math.min(row.byteCount, ownedFrom + policy.kinds.text.bytesPerStep);
    const scanned = await scanCredentialRange({
      openRange,
      key: row.stagingKey,
      mimeType: CREDENTIAL_TEXT_TYPE,
      byteCount: row.byteCount,
      ownedFrom,
      ownedTo,
      readsDocument: !declaredAsText,
    });
    if (scanned.kind === 'short') return { kind: 'short' };
    findings = mergeInspectionFindings(findings, scanned.findings);
    if (scanned.rejected) return { kind: 'rejected', findings };
    ownedFrom = ownedTo;
    const spentMs = spent();
    if (ownedFrom < row.byteCount || spentMs >= stepBudgetMs) return continueHere(spentMs);
  }

  const pdfjs = await loadPdfjs();
  let opened: OpenedPdf;
  try {
    opened = await openStoredPdf(
      { storage, key: row.stagingKey, byteCount: row.byteCount, policy },
      pdfjs,
    );
  } catch (error) {
    return unreadableFrom(error);
  }
  try {
    const pageCount = opened.document.numPages;
    if (pageCount > policy.kinds.pdf.maxScanPages) return TOO_MANY_PAGES;
    const firstPageOfStep = page;
    const lastPage = Math.min(pageCount, page + policy.kinds.pdf.pagesPerStep - 1);
    if (page === FIRST_PAGE) {
      const outline = await scanPageText(await outlineText(opened));
      findings = mergeInspectionFindings(findings, outline.findings);
      if (outline.rejected) return { kind: 'rejected', findings };
    }
    for (; page <= lastPage; page += 1) {
      if (page > firstPageOfStep) {
        const spentMs = spent();
        if (spentMs >= stepBudgetMs || cursor.scanMs + spentMs >= policy.kinds.pdf.maxScanMs) {
          return continueHere(spentMs);
        }
      }
      let texts: string[];
      try {
        texts = await pageTexts(opened, page);
      } catch (error) {
        return unreadableFrom(error);
      }
      for (const text of texts) {
        const scanned = await scanPageText(text);
        findings = mergeInspectionFindings(findings, scanned.findings);
        if (scanned.rejected) return { kind: 'rejected', findings };
      }
    }
    return page > pageCount ? { kind: 'finished', findings } : continueHere(spent());
  } finally {
    await opened.close().catch(() => undefined);
  }
}
