import 'server-only';

import { isUtf8 } from 'node:buffer';

import { readObjectRange, type PreparationStorage } from './derived-keys';
import { PreparationRefusedError } from './progress-store';

const BYTE_ORDER_MARK = '\uFEFF';
const CARRIAGE_RETURN = 0x0d;
const UTF8_CONTINUATION_MASK = 0xc0;
const UTF8_CONTINUATION = 0x80;
const JSON_QUOTE = 0x22;
const JSON_BACKSLASH = 0x5c;
const JSON_OPEN_OBJECT = 0x7b;
const JSON_OPEN_ARRAY = 0x5b;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * Text Postgres can hold in jsonb: a NUL or an unpaired surrogate escape is
 * rejected there, so a file holding one would fail its step on every retry.
 */
export function storableText(text: string): string {
  return text.replaceAll('\u0000', '').toWellFormed();
}

/** The longest prefix of `text` with at most `maxChars` characters that ends on a whole code point. */
export function sliceWholeCodePoints(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const end =
    maxChars > 0 && isHighSurrogate(text.charCodeAt(maxChars - 1)) ? maxChars - 1 : maxChars;
  return text.slice(0, Math.max(end, 0));
}

/** Pieces of at most `maxBytes` UTF-8 bytes each, cut between code points. */
export function splitIntoSegments(text: string, maxBytes: number): string[] {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4) {
    throw new RangeError('A segment holds at least one code point.');
  }
  const segments: string[] = [];
  let index = 0;
  while (index < text.length) {
    let low = index + 1;
    let high = Math.min(text.length, index + maxBytes);
    if (Buffer.byteLength(text.slice(index, high), 'utf8') > maxBytes) {
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (Buffer.byteLength(text.slice(index, middle), 'utf8') <= maxBytes) low = middle;
        else high = middle - 1;
      }
      high = low;
    }
    if (high < text.length && high - index > 1 && isHighSurrogate(text.charCodeAt(high - 1))) {
      high -= 1;
    }
    segments.push(text.slice(index, high));
    index = high;
  }
  return segments;
}

/** Where to end a read that stops mid-file so it never splits a UTF-8 sequence or a CRLF. */
export function wholeTextCut(data: Uint8Array): number {
  let start = data.length - 1;
  let continuation = 0;
  while (
    start >= 0 &&
    continuation < 3 &&
    (data[start]! & UTF8_CONTINUATION_MASK) === UTF8_CONTINUATION
  ) {
    start -= 1;
    continuation += 1;
  }
  let cut = data.length;
  if (start >= 0) {
    const lead = data[start]!;
    const length =
      lead < 0x80
        ? 1
        : (lead & 0xe0) === 0xc0
          ? 2
          : (lead & 0xf0) === 0xe0
            ? 3
            : (lead & 0xf8) === 0xf0
              ? 4
              : 1;
    if (start + length > data.length) cut = start;
  }
  if (cut > 0 && data[cut - 1] === CARRIAGE_RETURN) cut -= 1;
  return cut;
}

export function decodeStrictUtf8(data: Uint8Array): string {
  if (!isUtf8(data)) throw new PreparationRefusedError('invalid_utf8');
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
}

export interface TextBatchRequest {
  storage: PreparationStorage;
  key: string;
  byteCount: number;
  byteOffset: number;
  bytesPerStep: number;
  remainingChars: number;
}

export interface TextBatch {
  text: string;
  nextOffset: number;
  reachedEnd: boolean;
  truncated: boolean;
}

/**
 * The next range of a text file as normalised text. A range that stops
 * mid-file ends before an incomplete code point or a lone CR, so the cursor is
 * only a byte offset and the next range starts on a whole character.
 */
export async function readTextBatch(request: TextBatchRequest): Promise<TextBatch> {
  const end = Math.min(request.byteOffset + request.bytesPerStep, request.byteCount);
  const data = await readObjectRange(request.storage, request.key, request.byteOffset, end);
  const atEnd = end === request.byteCount;
  const cut = atEnd ? data.length : wholeTextCut(data);
  if (cut === 0 && !atEnd) throw new PreparationRefusedError('invalid_utf8');
  let text = decodeStrictUtf8(data.subarray(0, cut));
  if (request.byteOffset === 0 && text.startsWith(BYTE_ORDER_MARK)) text = text.slice(1);
  text = text.replace(/\r\n?/g, '\n');
  const truncated = text.length > request.remainingChars;
  if (truncated) text = sliceWholeCodePoints(text, request.remainingChars);
  return {
    text,
    nextOffset: request.byteOffset + cut,
    reachedEnd: atEnd && !truncated,
    truncated,
  };
}

function joinNotebookSource(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((line) => typeof line === 'string').join('');
  return '';
}

/**
 * Parsing allocates tens of bytes for each object or array, so a file of empty
 * containers grows the heap about twenty times its own size, while strings and
 * numbers stay near it. Containers are counted over the bytes before any parse.
 */
function holdsMoreContainersThan(data: Uint8Array, maxContainers: number): boolean {
  let containers = 0;
  let inString = false;
  for (let index = 0; index < data.byteLength; index += 1) {
    const byte = data[index]!;
    if (inString) {
      if (byte === JSON_BACKSLASH) index += 1;
      else if (byte === JSON_QUOTE) inString = false;
    } else if (byte === JSON_QUOTE) {
      inString = true;
    } else if (byte === JSON_OPEN_OBJECT || byte === JSON_OPEN_ARRAY) {
      containers += 1;
      if (containers > maxContainers) return true;
    }
  }
  return false;
}

/** Cell sources and text outputs of a notebook; rendered outputs (base64 images) are dropped. */
export function extractNotebookCellText(
  data: Uint8Array,
  limits: { maxContainers: number },
): string {
  if (holdsMoreContainersThan(data, limits.maxContainers)) {
    throw new PreparationRefusedError('over_kind_limit');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeStrictUtf8(data).replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error instanceof PreparationRefusedError) throw error;
    throw new PreparationRefusedError('unreadable');
  }
  const cells = (parsed as { cells?: unknown } | null)?.cells;
  if (!Array.isArray(cells)) throw new PreparationRefusedError('unreadable');

  const parts: string[] = [];
  for (const rawCell of cells) {
    if (!rawCell || typeof rawCell !== 'object') continue;
    const cell = rawCell as { cell_type?: unknown; source?: unknown; outputs?: unknown };
    const source = joinNotebookSource(cell.source).trim();
    if (cell.cell_type === 'markdown') {
      if (source) parts.push(source);
      continue;
    }
    if (cell.cell_type !== 'code') continue;
    if (source) parts.push(['```', source, '```'].join('\n'));
    if (!Array.isArray(cell.outputs)) continue;
    for (const rawOutput of cell.outputs) {
      if (!rawOutput || typeof rawOutput !== 'object') continue;
      const output = rawOutput as {
        text?: unknown;
        data?: Record<string, unknown>;
        ename?: unknown;
        evalue?: unknown;
      };
      const stream = joinNotebookSource(output.text).trim();
      if (stream) parts.push(`Output:\n${stream}`);
      const plain = joinNotebookSource(output.data?.['text/plain']).trim();
      if (plain) parts.push(`Output:\n${plain}`);
      if (typeof output.ename === 'string' && output.ename) {
        const detail = typeof output.evalue === 'string' ? `: ${output.evalue}` : '';
        parts.push(`Error: ${output.ename}${detail}`);
      }
    }
  }
  return parts.join('\n\n').replace(/\r\n?/g, '\n').trim();
}
