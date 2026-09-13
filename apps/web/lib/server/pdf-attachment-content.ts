import 'server-only';

import { deflateSync } from 'node:zlib';

import { logger } from '@/lib/logger';

export const MAX_PDF_TEXT_CHARS = 200_000;

const MAX_TEXT_PAGES = 250;
const MAX_IMAGE_PAGES = 10;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_TEXT_CHARS = 16;

const RGB_24BPP = 2;
const RGBA_32BPP = 3;

export interface PdfAttachmentContent {
  text: string | null;
  pageImages: { mimeType: 'image/png'; base64: string }[];
}

export class PdfAttachmentUnreadableError extends Error {
  constructor(readonly filename: string) {
    super(`${filename} could not be read as a PDF.`);
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
  if (normalized.length <= MAX_PDF_TEXT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_PDF_TEXT_CHARS)}\n\n[Content truncated during extraction.]`;
}

/**
 * The content of a PDF in a form every route can read.
 *
 * A route whose wire format has no document channel cannot take the bytes at
 * all, and rotating to one that can is not available to every account, so the
 * turn died with nothing on screen. Text comes out as text; a scan with no
 * text layer comes out as page images, which every vision route accepts.
 */
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
      if (text) pages.push(text);
    }

    const text = boundText(pages.join('\n\n'));
    if (text) return { text, pageImages: [] };

    const pageImages: PdfAttachmentContent['pageImages'] = [];
    let imageBytes = 0;
    for (
      let pageNumber = 1;
      pageNumber <= Math.min(document.numPages, MAX_IMAGE_PAGES);
      pageNumber += 1
    ) {
      const page = await document.getPage(pageNumber);
      const operators = await page.getOperatorList();
      for (const [index, operator] of operators.fnArray.entries()) {
        if (operator !== OPS.paintImageXObject) continue;
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
        const png = encodePng(candidate.width, candidate.height, rgb);
        if (imageBytes + png.byteLength > MAX_IMAGE_BYTES) break;
        imageBytes += png.byteLength;
        pageImages.push({ mimeType: 'image/png', base64: png.toString('base64') });
        break;
      }
    }

    return { text: null, pageImages };
  } catch (error) {
    if (error instanceof PdfAttachmentUnreadableError) throw error;
    logger.warn({ err: error, filename }, '[pdf] attachment content extraction failed');
    throw new PdfAttachmentUnreadableError(filename);
  } finally {
    await loadingTask.destroy();
  }
}
