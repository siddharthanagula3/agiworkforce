export const PDF_VIEWER_CHUNK_BYTES = 256 * 1024;
export const PDF_VIEWER_SILENCE_MS = 15000;

export type PdfViewerFailure = 'password' | 'invalid' | 'error';

export type PdfViewerMessage =
  | { type: 'ready' }
  | { type: 'received'; bytes: number }
  | { type: 'loaded'; pages: number }
  | { type: 'page'; page: number }
  | { type: 'failed'; reason: PdfViewerFailure };

export interface PdfViewerStart {
  size: number;
  page: number;
  background: string;
  border: string;
}

const FAILURES: ReadonlySet<string> = new Set(['password', 'invalid', 'error']);

function wholeNumber(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum;
}

export function parsePdfViewerMessage(data: string): PdfViewerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'ready':
      return { type: 'ready' };
    case 'received':
      return wholeNumber(message.bytes, 0) ? { type: 'received', bytes: message.bytes } : null;
    case 'loaded':
      return wholeNumber(message.pages, 1) ? { type: 'loaded', pages: message.pages } : null;
    case 'page':
      return wholeNumber(message.page, 1) ? { type: 'page', page: message.page } : null;
    case 'failed':
      return typeof message.reason === 'string' && FAILURES.has(message.reason)
        ? { type: 'failed', reason: message.reason as PdfViewerFailure }
        : null;
    default:
      return null;
  }
}

export function pdfViewerStartScript(start: PdfViewerStart): string {
  return `window.pdfViewer.begin(${JSON.stringify(start)});true;`;
}

export function pdfViewerChunkScript(encoded: string): string {
  return `window.pdfViewer.chunk(${JSON.stringify(encoded)});true;`;
}

/** The viewer is one page that never leaves itself, so any navigation away from it is refused. */
export function isPdfViewerNavigation(url: string): boolean {
  return url === 'about:blank' || url === '';
}
