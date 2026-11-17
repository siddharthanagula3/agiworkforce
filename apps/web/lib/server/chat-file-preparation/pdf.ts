import 'server-only';

import type { ChatLargeFilePolicy } from '@/lib/chat-attachment-policy';
import {
  isPdfPasswordError,
  loadPdfjs,
  pdfPageText,
  type PdfDocumentProxy,
  type PdfjsModule,
} from '@/lib/server/pdf-attachment-content';
import { MAX_OUTLINE_TITLE_CHARS, readWholeObject, type PreparationStorage } from './derived-keys';
import { createPdfRangeSource, PDF_RANGE_CHUNK_BYTES } from './pdf-range-source';
import { PreparationRefusedError } from './progress-store';
import { sliceWholeCodePoints } from './text-stream';

const PDF_MAGIC = '%PDF-';
const MAX_OUTLINE_ANCHORS = 100;
export const MAX_OUTLINE_NODES = 1_000;

export interface PdfOutlineEntry {
  title: string;
  level: number;
  page: number;
}

export interface PdfBatch {
  pageCount: number;
  pages: { page: number; text: string }[];
  outline: PdfOutlineEntry[] | null;
  bytesFetched: number;
}

export interface PdfBatchRequest {
  storage: PreparationStorage;
  key: string;
  byteCount: number;
  policy: ChatLargeFilePolicy;
  fromPage: number;
  /** Characters this batch may still add before the file's text cap. */
  remainingChars: number;
  withOutline: boolean;
}

export interface OpenedPdf {
  document: PdfDocumentProxy;
  guard: <T>(work: Promise<T>) => Promise<T>;
  bytesFetched: () => number;
  close: () => Promise<void>;
}

/** A storage failure, kept apart from pdf.js errors so it retries instead of failing the file. */
export class PdfSourceReadError extends Error {
  constructor(override readonly cause: unknown) {
    super('The stored PDF could not be read.');
    this.name = 'PdfSourceReadError';
  }
}

function asSourceReadError(error: unknown): never {
  throw new PdfSourceReadError(error);
}

type OutlineNode = Awaited<ReturnType<PdfDocumentProxy['getOutline']>>[number];

type StoredPdf = Pick<PdfBatchRequest, 'storage' | 'key' | 'byteCount' | 'policy'>;

export async function openStoredPdf(
  request: StoredPdf,
  { getDocument }: PdfjsModule,
): Promise<OpenedPdf> {
  const pdfPolicy = request.policy.kinds.pdf;
  if (pdfPolicy.rangeLoading) {
    const source = await createPdfRangeSource(request.storage, request.key, request.byteCount);
    const task = getDocument({
      range: source.transport,
      rangeChunkSize: PDF_RANGE_CHUNK_BYTES,
      disableAutoFetch: true,
      disableStream: true,
      useWorkerFetch: false,
      verbosity: 0,
    });
    const failure = source.failure.catch(asSourceReadError);
    failure.catch(() => undefined);
    const guard = <T>(work: Promise<T>) => Promise.race([work, failure]);
    return {
      document: await guard(task.promise).catch(async (error: unknown) => {
        await task.destroy().catch(() => undefined);
        throw error;
      }),
      guard,
      bytesFetched: () => source.bytesFetched,
      close: () => task.destroy(),
    };
  }

  if (request.byteCount > pdfPolicy.bufferedMaxBytes) {
    throw new PreparationRefusedError('too_large_for_buffered_read');
  }
  const data = await readWholeObject(request.storage, request.key, request.byteCount).catch(
    asSourceReadError,
  );
  if (new TextDecoder('latin1').decode(data.subarray(0, PDF_MAGIC.length)) !== PDF_MAGIC) {
    throw new PreparationRefusedError('unreadable');
  }
  const task = getDocument({ data, useWorkerFetch: false, verbosity: 0 });
  return {
    document: await task.promise.catch(async (error: unknown) => {
      await task.destroy().catch(() => undefined);
      throw error;
    }),
    guard: (work) => work,
    bytesFetched: () => request.byteCount,
    close: () => task.destroy(),
  };
}

async function outlinePage(
  document: PdfDocumentProxy,
  dest: OutlineNode['dest'],
): Promise<number | null> {
  const explicit = typeof dest === 'string' ? await document.getDestination(dest) : dest;
  const target = Array.isArray(explicit) ? explicit[0] : null;
  if (typeof target === 'number') return target + 1;
  if (target && typeof target === 'object') {
    return (
      (await document.getPageIndex(target as Parameters<PdfDocumentProxy['getPageIndex']>[0])) + 1
    );
  }
  return null;
}

export async function readOutline(opened: OpenedPdf): Promise<PdfOutlineEntry[]> {
  const nodes = await opened.guard(opened.document.getOutline());
  const anchors: PdfOutlineEntry[] = [];
  const pending: { node: OutlineNode; level: number }[] = (nodes ?? [])
    .map((node) => ({ node, level: 0 }))
    .reverse();
  let visited = 0;
  while (
    pending.length > 0 &&
    anchors.length < MAX_OUTLINE_ANCHORS &&
    visited < MAX_OUTLINE_NODES
  ) {
    visited += 1;
    const { node, level } = pending.pop()!;
    const title = sliceWholeCodePoints(
      node.title.replace(/\s+/g, ' ').trim(),
      MAX_OUTLINE_TITLE_CHARS,
    ).trimEnd();
    const page = title
      ? await opened.guard(outlinePage(opened.document, node.dest)).catch(() => null)
      : null;
    if (title && page !== null) anchors.push({ title, level, page });
    const children = (node.items ?? []) as OutlineNode[];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({ node: children[index]!, level: level + 1 });
    }
  }
  return anchors;
}

/**
 * Text of the next batch of pages. A batch is fixed by its first page and the
 * characters left, so a retried or losing run writes the same segments under
 * the same keys. Storage failures and a pdf.js module that fails to load
 * propagate so the step is retried; anything pdf.js refuses once loaded is a
 * file that cannot be read as text.
 */
export async function readPdfBatch(request: PdfBatchRequest): Promise<PdfBatch> {
  const pdfjs = await loadPdfjs();
  let opened: OpenedPdf | null = null;
  try {
    opened = await openStoredPdf(request, pdfjs);
    const pdfPolicy = request.policy.kinds.pdf;
    const pageCount = opened.document.numPages;
    const lastPage = Math.min(
      pageCount,
      pdfPolicy.maxTextPages,
      request.fromPage + pdfPolicy.pagesPerStep - 1,
    );
    const outline = request.withOutline ? await readOutline(opened).catch(() => []) : null;
    const pages: PdfBatch['pages'] = [];
    let chars = 0;
    for (let page = request.fromPage; page <= lastPage; page += 1) {
      const text = await opened.guard(
        opened.guard(opened.document.getPage(page)).then((proxy) => pdfPageText(proxy)),
      );
      pages.push({ page, text });
      chars += text.length;
      if (chars >= request.remainingChars) break;
    }
    return { pageCount, pages, outline, bytesFetched: opened.bytesFetched() };
  } catch (error) {
    if (error instanceof PreparationRefusedError) throw error;
    if (error instanceof PdfSourceReadError) throw error.cause;
    if (isPdfPasswordError(error)) throw new PreparationRefusedError('encrypted');
    throw new PreparationRefusedError('unreadable');
  } finally {
    await opened?.close().catch(() => undefined);
  }
}
