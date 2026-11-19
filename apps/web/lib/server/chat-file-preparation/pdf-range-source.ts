import 'server-only';

import type { PDFDataRangeTransport } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { loadPdfjs } from '@/lib/server/pdf-attachment-content';
import { readObjectRange, type PreparationStorage } from './derived-keys';

export const PDF_RANGE_CHUNK_BYTES = 1024 * 1024;

export interface PdfRangeSource {
  transport: PDFDataRangeTransport;
  /**
   * pdf.js has no way to hear that a range failed, so it would wait for the
   * bytes for ever. A read failure rejects this instead, and the caller races
   * every pdf.js call against it and destroys the document.
   */
  failure: Promise<never>;
  readonly bytesFetched: number;
  readonly requests: number;
}

/**
 * pdf.js reading a stored PDF through ranged GETs of the private object, so a
 * step loads the cross-reference table and the pages it reads, not the file.
 */
export async function createPdfRangeSource(
  storage: PreparationStorage,
  key: string,
  byteCount: number,
): Promise<PdfRangeSource> {
  const { PDFDataRangeTransport: Transport } = await loadPdfjs();
  let fail: (error: unknown) => void = () => undefined;
  const failure = new Promise<never>((_resolve, reject) => {
    fail = reject;
  });
  failure.catch(() => undefined);
  const stats = { bytesFetched: 0, requests: 0, failed: false, aborted: false };

  /**
   * pdf.js drops its range readers when the document is destroyed and then
   * asserts on a range it no longer waits for, so a read that lands after
   * `abort()` is dropped instead of handed over.
   */
  class StoredObjectRangeTransport extends Transport {
    override requestDataRange(begin: number, end: number): void {
      stats.requests += 1;
      readObjectRange(storage, key, begin, Math.min(end, byteCount)).then(
        (chunk) => {
          if (stats.failed || stats.aborted) return;
          stats.bytesFetched += chunk.byteLength;
          try {
            this.onDataRange(begin, chunk);
          } catch (error) {
            stats.failed = true;
            fail(error);
          }
        },
        (error: unknown) => {
          if (stats.aborted) return;
          stats.failed = true;
          fail(error);
        },
      );
    }

    override abort(): void {
      stats.aborted = true;
    }
  }

  return {
    transport: new StoredObjectRangeTransport(byteCount, new Uint8Array(0)),
    failure,
    get bytesFetched() {
      return stats.bytesFetched;
    },
    get requests() {
      return stats.requests;
    },
  };
}
