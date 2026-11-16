import 'server-only';

import { isUtf8 } from 'node:buffer';

import { bareMediaType, documentClassById, fileExtension } from '@agiworkforce/types';
import type { ChatLargeFilePolicy } from '@/lib/chat-attachment-policy';
import { readObjectRange, type PreparationStorage } from './derived-keys';
import { PreparationRefusedError } from './progress-store';
import { sliceWholeCodePoints, storableText } from './text-stream';

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const QUOTE = 0x22;
const COMMA = 0x2c;
const BYTE_ORDER_MARK = [0xef, 0xbb, 0xbf] as const;

const MAX_PROFILED_COLUMNS = 256;
export const MAX_COLUMN_NAME_BYTES = 256;
const MAX_SAMPLE_ROW_BYTES = 2048;
export const MAX_DELIMITED_CURSOR_BYTES = 1024 * 1024;

const TAB_SEPARATED = documentClassById('tsv');
const MAX_TYPED_VALUE_CHARS = 64;
const UNESCAPE_JOIN_GROUP = 256;

export type ColumnType = 'empty' | 'integer' | 'number' | 'boolean' | 'date' | 'text';

const COLUMN_TYPES: readonly ColumnType[] = [
  'empty',
  'integer',
  'number',
  'boolean',
  'date',
  'text',
];

export type ColumnCounts = Record<ColumnType, number>;

export interface DelimitedCursor {
  [field: string]: unknown;
  byteOffset: number;
  delimiter: ',' | '\t';
  header: string[] | null;
  columnCount: number;
  rowCount: number;
  columns: ColumnCounts[];
  firstRows: string[];
  reservoir: string[];
  random: number;
}

export interface DelimitedColumnProfile {
  name: string;
  type: ColumnType;
}

export interface DelimitedProfile {
  rowCount: number;
  columnCount: number;
  columns: DelimitedColumnProfile[];
  columnsTruncated: boolean;
  delimiter: 'comma' | 'tab';
}

export interface DelimitedBatch {
  cursor: DelimitedCursor;
  finished: boolean;
  text: string | null;
  profile: DelimitedProfile | null;
}

export function emptyCounts(): ColumnCounts {
  return { empty: 0, integer: 0, number: 0, boolean: 0, date: 0, text: 0 };
}

function seedOf(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 1;
}

/** mulberry32: a retried step draws the same sample, because its state is in the cursor. */
function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let mixed = Math.imul(next ^ (next >>> 15), next | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return [((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296, next];
}

export function delimiterFor(fileName: string, mimeType: string): ',' | '\t' {
  const tabSeparated =
    TAB_SEPARATED !== null &&
    (TAB_SEPARATED.extensions.includes(fileExtension(fileName)) ||
      TAB_SEPARATED.mediaTypes.includes(bareMediaType(mimeType)));
  return tabSeparated ? '\t' : ',';
}

export function initialDelimitedCursor(delimiter: ',' | '\t', seedKey: string): DelimitedCursor {
  return {
    byteOffset: 0,
    delimiter,
    header: null,
    columnCount: 0,
    rowCount: 0,
    columns: [],
    firstRows: [],
    reservoir: [],
    random: seedOf(seedKey),
  };
}

export function parseDelimitedCursor(value: Record<string, unknown>): DelimitedCursor | null {
  if (typeof value['byteOffset'] !== 'number') return null;
  return value as unknown as DelimitedCursor;
}

export function boundedStorableText(text: string, maxBytes: number): string {
  let bounded = storableText(text);
  while (bounded.length > 0 && bounded.length >= maxBytes - 1) {
    bounded = sliceWholeCodePoints(bounded, Math.floor(bounded.length / 2));
  }
  while (Buffer.byteLength(JSON.stringify(bounded), 'utf8') > maxBytes) {
    bounded = sliceWholeCodePoints(bounded, Math.floor(bounded.length / 2));
  }
  return bounded;
}

/** Where the quoted run that starts at `from` ends: the first quote not doubled, or the record's end. */
function closingQuote(record: string, from: number): number {
  let index = from;
  for (;;) {
    const at = record.indexOf('"', index);
    if (at === -1) return record.length;
    if (record.charCodeAt(at + 1) !== QUOTE) return at;
    index = at + 2;
  }
}

/**
 * The quoted run between `from` and `to` with each doubled quote read as one.
 * Pieces are joined in small groups, since one join over millions of pieces,
 * or `replaceAll` over millions of matches, holds tens of bytes per character.
 */
function unescapeQuoted(record: string, from: number, to: number): string {
  let at = record.indexOf('"', from);
  if (at === -1 || at >= to) return record.slice(from, to);
  const groups: string[] = [];
  let pieces: string[] = [];
  let start = from;
  while (at !== -1 && at < to) {
    pieces.push(record.slice(start, at + 1));
    start = at + 2;
    if (pieces.length === UNESCAPE_JOIN_GROUP) {
      groups.push(pieces.join(''));
      pieces = [];
    }
    at = record.indexOf('"', start);
  }
  pieces.push(record.slice(start, to));
  groups.push(pieces.join(''));
  return groups.join('');
}

/**
 * Fields are slices of the record rather than strings grown a character at a
 * time, which V8 keeps as chains costing tens of bytes per character.
 */
export function splitDelimitedFields(record: string, delimiter: ',' | '\t'): string[] {
  if (delimiter === '\t') return record.split('\t');
  const fields: string[] = [];
  let quoted = '';
  let runStart = 0;
  let index = 0;
  while (index < record.length) {
    const char = record.charCodeAt(index);
    if (char === QUOTE && index === runStart && quoted.length === 0) {
      const close = closingQuote(record, index + 1);
      quoted = unescapeQuoted(record, index + 1, close);
      index = close + 1;
      runStart = index;
    } else if (char === COMMA) {
      fields.push(quoted + record.slice(runStart, index));
      quoted = '';
      index += 1;
      runStart = index;
    } else {
      index += 1;
    }
  }
  fields.push(quoted + record.slice(runStart));
  return fields;
}

const INTEGER = /^[-+]?\d+$/;
const NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const BOOLEAN = /^(?:true|false|yes|no)$/i;
const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export function valueType(raw: string): ColumnType {
  const value = raw.trim();
  if (!value) return 'empty';
  if (value.length > MAX_TYPED_VALUE_CHARS) return 'text';
  if (INTEGER.test(value)) return 'integer';
  if (NUMBER.test(value)) return 'number';
  if (BOOLEAN.test(value)) return 'boolean';
  if (DATE.test(value)) return 'date';
  return 'text';
}

export function columnType(counts: ColumnCounts): ColumnType {
  if (counts.text > 0) return 'text';
  const kinds = COLUMN_TYPES.filter((type) => type !== 'empty' && counts[type] > 0);
  if (kinds.length === 0) return 'empty';
  if (kinds.every((type) => type === 'integer' || type === 'number')) {
    return counts.number > 0 ? 'number' : 'integer';
  }
  return kinds.length === 1 ? kinds[0]! : 'text';
}

class RecordDecoder {
  private readonly decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  constructor(private readonly data: Uint8Array) {}

  text(from: number, to: number): string {
    let end = to;
    if (end > from && this.data[end - 1] === CARRIAGE_RETURN) end -= 1;
    return this.decoder.decode(this.data.subarray(from, end));
  }
}

function recordIsBlank(data: Uint8Array, from: number, to: number): boolean {
  return to === from || (to === from + 1 && data[from] === CARRIAGE_RETURN);
}

/**
 * Calls `onBoundary` with each line break outside a quoted field. A quote
 * opens a field only at the field's start, as `splitDelimitedFields` reads
 * it, so a stray quote inside an unquoted field does not hide the rows after
 * it. Boundaries are handed over as they are met rather than collected, since
 * a range of short rows holds tens of millions of them.
 */
function scanRecordBoundaries(
  data: Uint8Array,
  from: number,
  to: number,
  quoting: boolean,
  onBoundary: (index: number) => void,
): void {
  let inQuotes = false;
  let fieldStart = true;
  let justClosed = false;
  for (let index = from; index < to; index += 1) {
    const byte = data[index];
    if (quoting && byte === QUOTE) {
      if (inQuotes) {
        inQuotes = false;
        justClosed = true;
      } else {
        inQuotes = fieldStart || justClosed;
        justClosed = false;
      }
      fieldStart = false;
      continue;
    }
    justClosed = false;
    if (inQuotes) continue;
    if (byte === NEWLINE) {
      onBoundary(index);
      fieldStart = true;
    } else {
      fieldStart = byte === COMMA;
    }
  }
}

/**
 * Counts rows, infers column types from the first rows and keeps the first
 * rows and a seeded reservoir sample, over one range of the file. The step
 * ends at the last record boundary in the range, so the next step re-reads
 * the record that the range cut, and the cursor never carries partial bytes.
 */
export async function readDelimitedBatch(request: {
  storage: PreparationStorage;
  key: string;
  byteCount: number;
  cursor: DelimitedCursor;
  policy: ChatLargeFilePolicy;
}): Promise<DelimitedBatch> {
  const { policy } = request;
  const limits = policy.kinds.delimited;
  const cursor: DelimitedCursor = {
    ...request.cursor,
    columns: request.cursor.columns.map((counts) => ({ ...counts })),
    firstRows: [...request.cursor.firstRows],
    reservoir: [...request.cursor.reservoir],
  };
  const end = Math.min(cursor.byteOffset + limits.bytesPerStep, request.byteCount);
  const data = await readObjectRange(request.storage, request.key, cursor.byteOffset, end);
  const atEnd = end === request.byteCount;
  const quoting = cursor.delimiter === ',';

  let start = 0;
  if (
    cursor.byteOffset === 0 &&
    data[0] === BYTE_ORDER_MARK[0] &&
    data[1] === BYTE_ORDER_MARK[1] &&
    data[2] === BYTE_ORDER_MARK[2]
  ) {
    start = BYTE_ORDER_MARK.length;
  }

  let lastBoundary = -1;
  if (!atEnd) {
    scanRecordBoundaries(data, start, data.length, quoting, (index) => {
      lastBoundary = index;
    });
  }
  const consumed = atEnd ? data.length : lastBoundary + 1;
  if (!atEnd && consumed === 0) throw new PreparationRefusedError('row_too_long');
  if (!isUtf8(data.subarray(start, consumed))) throw new PreparationRefusedError('invalid_utf8');

  const records = new RecordDecoder(data);
  const handle = (from: number, to: number) => {
    if (recordIsBlank(data, from, to)) return;
    if (cursor.header === null) {
      const names = splitDelimitedFields(records.text(from, to), cursor.delimiter);
      cursor.columnCount = names.length;
      cursor.header = names
        .slice(0, MAX_PROFILED_COLUMNS)
        .map((name) => boundedStorableText(name.trim(), MAX_COLUMN_NAME_BYTES));
      cursor.columns = cursor.header.map(() => emptyCounts());
      return;
    }
    cursor.rowCount += 1;
    const keepFirst = cursor.firstRows.length < limits.sampleRows;
    const infer = cursor.rowCount <= limits.typeInferenceRows;
    let reservoirSlot: number | null = null;
    if (cursor.reservoir.length < limits.sampleRows) {
      reservoirSlot = cursor.reservoir.length;
    } else {
      const [draw, state] = nextRandom(cursor.random);
      cursor.random = state;
      const slot = Math.floor(draw * cursor.rowCount);
      if (slot < limits.sampleRows) reservoirSlot = slot;
    }
    if (!keepFirst && !infer && reservoirSlot === null) return;
    const text = records.text(from, to);
    if (infer) {
      const fields = splitDelimitedFields(text, cursor.delimiter);
      cursor.columns.forEach((counts, column) => {
        counts[valueType(fields[column] ?? '')] += 1;
      });
    }
    const sample = boundedStorableText(text, MAX_SAMPLE_ROW_BYTES);
    if (keepFirst) cursor.firstRows.push(sample);
    if (reservoirSlot !== null) cursor.reservoir[reservoirSlot] = sample;
  };

  let recordStart = start;
  scanRecordBoundaries(data, start, consumed, quoting, (boundary) => {
    handle(recordStart, boundary);
    recordStart = boundary + 1;
  });
  if (atEnd && recordStart < data.length) handle(recordStart, data.length);

  cursor.byteOffset += consumed;
  if (Buffer.byteLength(JSON.stringify(cursor), 'utf8') > MAX_DELIMITED_CURSOR_BYTES) {
    throw new PreparationRefusedError('row_too_long');
  }
  if (!atEnd) return { cursor, finished: false, text: null, profile: null };

  const profile = delimitedProfile(cursor);
  return { cursor, finished: true, text: profileText(cursor, profile, limits.sampleRows), profile };
}

function delimitedProfile(cursor: DelimitedCursor): DelimitedProfile {
  return {
    rowCount: cursor.rowCount,
    columnCount: cursor.columnCount,
    columns: (cursor.header ?? []).map((name, index) => ({
      name,
      type: columnType(cursor.columns[index] ?? emptyCounts()),
    })),
    columnsTruncated: cursor.columnCount > (cursor.header?.length ?? 0),
    delimiter: cursor.delimiter === '\t' ? 'tab' : 'comma',
  };
}

function profileText(
  cursor: DelimitedCursor,
  profile: DelimitedProfile,
  sampleRows: number,
): string {
  const separator = profile.delimiter === 'tab' ? 'tab-separated' : 'comma-separated';
  const headerLine = (cursor.header ?? []).join(cursor.delimiter);
  const lines = [
    `Table (${separator}): ${profile.rowCount.toLocaleString('en-US')} rows after the header, ${profile.columnCount.toLocaleString('en-US')} columns.`,
    '',
    'Columns:',
    ...profile.columns.map((column) => `- ${column.name || '(unnamed)'}: ${column.type}`),
  ];
  if (profile.columnsTruncated) {
    lines.push(`- and ${profile.columnCount - profile.columns.length} more columns not profiled`);
  }
  if (cursor.firstRows.length > 0) {
    lines.push('', `First ${cursor.firstRows.length} rows:`, headerLine, ...cursor.firstRows);
  }
  if (cursor.rowCount > sampleRows) {
    lines.push(
      '',
      `${cursor.reservoir.length} rows sampled at random from the whole file:`,
      headerLine,
      ...cursor.reservoir,
    );
  }
  return lines.join('\n');
}
