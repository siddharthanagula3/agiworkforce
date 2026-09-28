import 'server-only';

import { deflateSync } from 'node:zlib';

import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { truncateExtractedText } from '@/lib/server/extraction-truncation';

const MAX_TEXT_PAGES = 250;
const MAX_IMAGE_PAGES = 30;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_TEXT_CHARS = 16;

const RGB_24BPP = 2;
const RGBA_32BPP = 3;

export interface PdfAttachmentContent {
  text: string | null;
  /**
   * One entry per page read, empty where a page had no text layer, so an index
   * into this array is the page number a caller can anchor an offset to.
   */
  pages: string[];
  pageImages: { mimeType: 'image/png'; base64: string; page: number }[];
  /**
   * The document has more pages than `MAX_TEXT_PAGES`, so `text` covers only
   * the first of them. A chat turn lives with that; a store that keeps the
   * document as its only record of the file refuses instead of holding a
   * silently partial copy.
   */
  pagesOmitted: boolean;
  /** Pages with no text layer that did not fit the image budget and reach no caller. */
  scannedPagesOmitted: number[];
  pageCount: number;
}

type PdfAttachmentFailureReason = 'corrupt' | 'encrypted';

const PDF_FAILURE_MESSAGES: Readonly<Record<PdfAttachmentFailureReason, string>> = {
  corrupt: 'could not be read as a PDF.',
  encrypted: 'is password protected. Remove the password and upload it again.',
};

const PDF_PASSWORD_EXCEPTION = 'PasswordException';

export class PdfAttachmentUnreadableError extends Error {
  constructor(
    readonly filename: string,
    readonly reason: PdfAttachmentFailureReason = 'corrupt',
  ) {
    super(`${filename} ${PDF_FAILURE_MESSAGES[reason]}`);
    this.name = 'PdfAttachmentUnreadableError';
  }
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A scanned page reaches the model as an image, so the bitmap pdf.js hands
 * back has to become a real image file. Encoding it here keeps the fallback
 * inside the dependencies the product already ships rather than adding a
 * native image toolchain for one code path.
 */
function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0;
    rgb.copy(raw, row * (stride + 1) + 1, row * stride, row * stride + stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function toRgb(bitmap: {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array;
}): Buffer | null {
  const pixels = bitmap.width * bitmap.height;
  if (bitmap.kind === RGB_24BPP) {
    return bitmap.data.length >= pixels * 3
      ? Buffer.from(bitmap.data.subarray(0, pixels * 3))
      : null;
  }
  if (bitmap.kind === RGBA_32BPP) {
    if (bitmap.data.length < pixels * 4) return null;
    const rgb = Buffer.alloc(pixels * 3);
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      rgb[pixel * 3] = bitmap.data[pixel * 4]!;
      rgb[pixel * 3 + 1] = bitmap.data[pixel * 4 + 1]!;
      rgb[pixel * 3 + 2] = bitmap.data[pixel * 4 + 2]!;
    }
    return rgb;
  }
  return null;
}

function boundText(value: string): string | null {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (normalized.length < MIN_TEXT_CHARS) return null;
  return truncateExtractedText(normalized, MAX_FILE_TEXT_CHARS);
}

/**
 * The content of a PDF in a form every route can read.
 *
 * A route whose wire format has no document channel cannot take the bytes at
 * all, and rotating to one that can is not available to every account, so the
 * turn died with nothing on screen. Text comes out as text; a scan with no
 * text layer comes out as page images, which every vision route accepts.
 */
type PdfDocumentProxy = Awaited<
  ReturnType<(typeof import('pdfjs-dist/legacy/build/pdf.mjs'))['getDocument']>['promise']
>;

async function renderPageImage(
  document: PdfDocumentProxy,
  paintImageOperator: number,
  pageNumber: number,
): Promise<Buffer | null> {
  const page = await document.getPage(pageNumber);
  const operators = await page.getOperatorList();
  for (const [index, operator] of operators.fnArray.entries()) {
    if (operator !== paintImageOperator) continue;
    const name = operators.argsArray[index]?.[0];
    if (typeof name !== 'string') continue;
    const bitmap = await new Promise<unknown>((resolve) => {
      try {
        page.objs.get(name, resolve);
      } catch {
        resolve(null);
      }
    });
    const candidate = bitmap as {
      width?: number;
      height?: number;
      kind?: number;
      data?: Uint8Array;
    } | null;
    if (!candidate?.width || !candidate.height || !candidate.data || !candidate.kind) continue;
    const rgb = toRgb({
      width: candidate.width,
      height: candidate.height,
      kind: candidate.kind,
      data: candidate.data,
    });
    if (!rgb) continue;
    return encodePng(candidate.width, candidate.height, rgb);
  }
  return null;
}

export async function extractPdfAttachmentContent(
  data: Buffer,
  filename: string,
): Promise<PdfAttachmentContent> {
  if (!data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new PdfAttachmentUnreadableError(filename);
  }

  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({
    data: new Uint8Array(data),
    useWorkerFetch: false,
    verbosity: 0,
  });

  try {
    const document = await loadingTask.promise;
    const pagesOmitted = document.numPages > MAX_TEXT_PAGES;
    const pageCount = Math.min(document.numPages, MAX_TEXT_PAGES);
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean)
        .join(' ')
        .trim();
      pages.push(text);
    }

    const hasTextLayer = boundText(pages.filter(Boolean).join('\n\n')) !== null;
    const imageCandidates = hasTextLayer
      ? pages.flatMap((pageText, index) => (pageText ? [] : [index + 1]))
      : Array.from({ length: document.numPages }, (_, index) => index + 1);

    const pageImages: PdfAttachmentContent['pageImages'] = [];
    const scannedPagesOmitted: number[] = [];
    let imageBytes = 0;
    for (const pageNumber of imageCandidates) {
      if (pageImages.length >= MAX_IMAGE_PAGES) {
        scannedPagesOmitted.push(pageNumber);
        continue;
      }
      const png = await renderPageImage(document, OPS.paintImageXObject, pageNumber);
      if (!png) continue;
      if (imageBytes + png.byteLength > MAX_IMAGE_BYTES) {
        scannedPagesOmitted.push(pageNumber);
        continue;
      }
      imageBytes += png.byteLength;
      pageImages.push({ mimeType: 'image/png', base64: png.toString('base64'), page: pageNumber });
    }

    const imagedPages = new Set(pageImages.map((image) => image.page));
    const text = hasTextLayer
      ? boundText(
          pages
            .map((pageText, index) => {
              const pageNumber = index + 1;
              if (pageText) return `[Page ${pageNumber}]\n${pageText}`;
              if (imagedPages.has(pageNumber)) {
                return `[Page ${pageNumber}]\n(scanned page, attached as an image)`;
              }
              return '';
            })
            .filter(Boolean)
            .join('\n\n'),
        )
      : null;
    return {
      text,
      pages,
      pageImages,
      pagesOmitted,
      scannedPagesOmitted,
      pageCount: document.numPages,
    };
  } catch (error) {
    if (error instanceof PdfAttachmentUnreadableError) throw error;
    if (error instanceof Error && error.name === PDF_PASSWORD_EXCEPTION) {
      throw new PdfAttachmentUnreadableError(filename, 'encrypted');
    }
    logger.warn({ err: error, filename }, '[pdf] attachment content extraction failed');
    throw new PdfAttachmentUnreadableError(filename);
  } finally {
    await loadingTask.destroy();
  }
}
