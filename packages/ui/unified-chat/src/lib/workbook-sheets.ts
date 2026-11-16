import { DecodeUTF8, Inflate, strFromU8 } from 'fflate';
import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';

const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const DEFAULT_SHEET_PATH = 'xl/worksheets/sheet1.xml';
const WORKBOOK_PATH = 'xl/workbook.xml';
const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels';
const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml';
export const MAX_WORKBOOK_SHEETS = 50;
const MAX_ARCHIVE_MEMBERS = 2_000;
const MAX_DECOMPRESSION_RATIO = 120;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const INFLATE_SLICE_BYTES = 4096;
const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_ENTRY = 0x04034b50;

export const XLSX_NOT_CALCULATED = 'not calculated';

export interface WorkbookSheet {
  name: string;
  csv: string;
}

export class WorkbookPreviewLimitError extends Error {
  constructor() {
    super('The workbook is too large to preview');
    this.name = 'WorkbookPreviewLimitError';
  }
}

export class WorkbookFormatError extends Error {
  constructor(reason: string) {
    super(`The workbook could not be read: ${reason}`);
    this.name = 'WorkbookFormatError';
  }
}

interface ZipMember {
  method: number;
  compressedSize: number;
  dataOffset: number;
}

interface WorkbookArchive {
  data: Uint8Array;
  members: Map<string, ZipMember>;
  spend(bytes: number): void;
}

function u16(data: Uint8Array, at: number): number {
  return data[at]! | (data[at + 1]! << 8);
}

function u32(data: Uint8Array, at: number): number {
  return (data[at]! | (data[at + 1]! << 8) | (data[at + 2]! << 16)) + data[at + 3]! * 0x1000000;
}

function openArchive(data: Uint8Array): WorkbookArchive {
  const floor = Math.max(0, data.length - 22 - 0xffff);
  let end = data.length - 22;
  while (end >= floor && u32(data, end) !== END_OF_DIRECTORY) end -= 1;
  if (end < floor) throw new WorkbookFormatError('no zip directory');
  const count = u16(data, end + 10);
  let offset = u32(data, end + 16);
  if (count === 0xffff || offset === 0xffffffff) throw new WorkbookFormatError('zip64');
  if (count > MAX_ARCHIVE_MEMBERS) throw new WorkbookFormatError('too many members');
  const members = new Map<string, ZipMember>();
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > data.length || u32(data, offset) !== DIRECTORY_ENTRY) {
      throw new WorkbookFormatError('broken zip directory');
    }
    const flags = u16(data, offset + 8);
    const method = u16(data, offset + 10);
    const compressedSize = u32(data, offset + 20);
    const nameLength = u16(data, offset + 28);
    const local = u32(data, offset + 42);
    const name = strFromU8(data.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + u16(data, offset + 30) + u16(data, offset + 32);
    if (local + 30 > data.length || u32(data, local) !== LOCAL_ENTRY) {
      throw new WorkbookFormatError('broken zip entry');
    }
    const dataOffset = local + 30 + u16(data, local + 26) + u16(data, local + 28);
    if (dataOffset + compressedSize > data.length) throw new WorkbookFormatError('truncated');
    if ((flags & 1) === 0) members.set(name, { method, compressedSize, dataOffset });
  }
  const ceiling = Math.min(
    MAX_UNCOMPRESSED_BYTES,
    Math.max(data.length, 1) * MAX_DECOMPRESSION_RATIO,
  );
  let spent = 0;
  return {
    data,
    members,
    spend(bytes) {
      spent += bytes;
      if (spent > ceiling) throw new WorkbookFormatError('decompression bound');
    },
  };
}

type XmlAttributes = Readonly<Record<string, string>>;

interface XmlHandler {
  open?(name: string, attributes: XmlAttributes): void;
  close?(name: string): void;
  text?(value: string): void;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};
const ENTITY_RE = /&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g;
const ATTRIBUTE_RE = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function decodeXmlText(raw: string): string {
  if (!raw.includes('&')) return raw;
  return raw.replace(ENTITY_RE, (match, hex?: string, decimal?: string, named?: string) => {
    if (named) return NAMED_ENTITIES[named] ?? match;
    const code = hex ? Number.parseInt(hex, 16) : Number(decimal);
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
      ? String.fromCodePoint(code)
      : match;
  });
}

function localName(name: string): string {
  return name.slice(name.indexOf(':') + 1);
}

function tagEnd(buffer: string, from: number): number {
  let quote = '';
  for (let index = from; index < buffer.length; index += 1) {
    const character = buffer[index]!;
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  return -1;
}

class XmlReader {
  private buffer = '';

  constructor(private readonly handler: XmlHandler) {}

  push(chunk: string): void {
    this.buffer += chunk;
    this.drain(false);
  }

  end(): void {
    this.drain(true);
    if (this.buffer.length > 0) throw new WorkbookFormatError('unfinished XML');
  }

  private drain(final: boolean): void {
    const buffer = this.buffer;
    let at = 0;
    while (at < buffer.length) {
      const open = buffer.indexOf('<', at);
      if (open === -1) {
        if (final) {
          this.handler.text?.(decodeXmlText(buffer.slice(at)));
          at = buffer.length;
        }
        break;
      }
      if (open > at) this.handler.text?.(decodeXmlText(buffer.slice(at, open)));
      at = open;
      const next = this.markup(buffer, open);
      if (next === -1) break;
      at = next;
    }
    this.buffer = buffer.slice(at);
    if (this.buffer.length > MAX_FILE_TEXT_CHARS) throw new WorkbookPreviewLimitError();
  }

  private markup(buffer: string, open: number): number {
    if (buffer.indexOf('>', open) === -1) return -1;
    if (buffer.startsWith('<!--', open)) {
      const close = buffer.indexOf('-->', open + 4);
      return close === -1 ? -1 : close + 3;
    }
    if (buffer.startsWith('<![CDATA[', open)) {
      const close = buffer.indexOf(']]>', open + 9);
      if (close === -1) return -1;
      this.handler.text?.(buffer.slice(open + 9, close));
      return close + 3;
    }
    if (buffer.startsWith('<?', open)) {
      const close = buffer.indexOf('?>', open + 2);
      return close === -1 ? -1 : close + 2;
    }
    if (buffer.startsWith('<!', open)) throw new WorkbookFormatError('document type');
    const close = tagEnd(buffer, open + 1);
    if (close === -1) return -1;
    const body = buffer.slice(open + 1, close);
    if (body.startsWith('/')) {
      this.handler.close?.(localName(body.slice(1).trim()));
      return close + 1;
    }
    const selfClosing = body.endsWith('/');
    const inner = selfClosing ? body.slice(0, -1) : body;
    const nameMatch = /^[^\s]+/.exec(inner);
    if (!nameMatch) throw new WorkbookFormatError('unnamed element');
    const name = localName(nameMatch[0]);
    const attributes: Record<string, string> = {};
    for (const match of inner.slice(nameMatch[0].length).matchAll(ATTRIBUTE_RE)) {
      attributes[match[1]!] = decodeXmlText(match[2] ?? match[3] ?? '');
    }
    this.handler.open?.(name, attributes);
    if (selfClosing) this.handler.close?.(name);
    return close + 1;
  }
}

function readMember(archive: WorkbookArchive, path: string, handler: XmlHandler): boolean {
  const member = archive.members.get(path);
  if (!member) return false;
  const reader = new XmlReader(handler);
  const decoder = new DecodeUTF8((text) => reader.push(text));
  const take = (chunk: Uint8Array, final: boolean) => {
    archive.spend(chunk.length);
    decoder.push(chunk, final);
  };
  const body = archive.data.subarray(member.dataOffset, member.dataOffset + member.compressedSize);
  if (member.method !== 0 && member.method !== 8) {
    throw new WorkbookFormatError('unknown compression');
  }
  const sink = member.method === 8 ? new Inflate(take) : null;
  if (body.length === 0) {
    if (sink) sink.push(body, true);
    else take(body, true);
  }
  for (let at = 0; at < body.length; at += INFLATE_SLICE_BYTES) {
    const slice = body.subarray(at, at + INFLATE_SLICE_BYTES);
    const final = at + INFLATE_SLICE_BYTES >= body.length;
    if (sink) sink.push(slice, final);
    else take(slice, final);
  }
  reader.end();
  return true;
}

function resolveTarget(fromPath: string, target: string): string {
  const parts = fromPath.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

function sheetEntries(archive: WorkbookArchive): { name: string; path: string }[] {
  if (!archive.members.has(WORKBOOK_PATH) || !archive.members.has(WORKBOOK_RELS_PATH)) {
    return [{ name: 'Sheet1', path: DEFAULT_SHEET_PATH }];
  }
  const relationshipPrefixes = new Set<string>();
  const declared: { name: string; id: string }[] = [];
  let seen = 0;
  readMember(archive, WORKBOOK_PATH, {
    open(name, attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        if (key.startsWith('xmlns:') && value === RELATIONSHIP_NS) {
          relationshipPrefixes.add(key.slice('xmlns:'.length));
        }
      }
      if (name !== 'sheet') return;
      seen += 1;
      if (seen > MAX_WORKBOOK_SHEETS) return;
      let id = '';
      for (const prefix of relationshipPrefixes) id ||= attributes[`${prefix}:id`] ?? '';
      declared.push({ name: attributes['name']?.trim() ?? '', id: id || attributes['r:id'] || '' });
    },
  });
  const wanted = new Set(declared.map((sheet) => sheet.id));
  const targets = new Map<string, string>();
  readMember(archive, WORKBOOK_RELS_PATH, {
    open(name, attributes) {
      const id = attributes['Id'] ?? '';
      if (name === 'Relationship' && wanted.has(id)) targets.set(id, attributes['Target'] ?? '');
    },
  });
  const entries: { name: string; path: string }[] = [];
  for (const sheet of declared) {
    const target = targets.get(sheet.id);
    if (!target || !sheet.name) continue;
    entries.push({
      name: sheet.name,
      path: target.startsWith('/') ? target.slice(1) : resolveTarget(WORKBOOK_PATH, target),
    });
  }
  return entries;
}

type CellValue = readonly string[] | number;

interface ParsedSheet {
  name: string;
  rows: Map<number, CellValue>[];
  width: number;
}

function columnIndex(reference: string, remaining: number): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? 'A';
  let column = 0;
  for (const letter of letters) {
    const digit = letter.charCodeAt(0) - 64;
    if (column > Math.floor((remaining + 1 - digit) / 26)) {
      throw new WorkbookPreviewLimitError();
    }
    column = column * 26 + digit;
  }
  return column - 1;
}

function escapedCellLength(parts: readonly string[], remaining: number): number {
  let length = 0;
  let quoted = false;
  for (const part of parts) {
    if (part.length > remaining - length) throw new WorkbookPreviewLimitError();
    length += part.length;
    for (const character of part) {
      if (character === '"') {
        if (length === remaining) throw new WorkbookPreviewLimitError();
        length += 1;
      }
      if (character === '"' || character === ',' || character === '\n' || character === '\r') {
        quoted = true;
      }
    }
  }
  if (quoted) {
    if (remaining - length < 2) throw new WorkbookPreviewLimitError();
    length += 2;
  }
  return length;
}

function parseSheet(
  archive: WorkbookArchive,
  entry: { name: string; path: string },
  budget: number,
  referenced: Set<number>,
): { sheet: ParsedSheet; lowerBound: number } | null {
  const rows: Map<number, CellValue>[] = [];
  let width = 0;
  let known = 0;
  let row: Map<number, CellValue> | null = null;
  let cell: {
    index: number;
    type: string | undefined;
    formula: boolean;
    value: string | undefined;
    inline: string[];
  } | null = null;
  let inValue = false;
  let inInlineText = false;
  let phoneticDepth = 0;
  let previous = -1;

  const lowerBound = () =>
    Math.max(0, rows.length - 1) + rows.length * Math.max(0, width - 1) + known;
  const check = () => {
    if (lowerBound() > budget) throw new WorkbookPreviewLimitError();
  };

  const found = readMember(archive, entry.path, {
    open(name, attributes) {
      if (name === 'row') {
        if (rows.length > budget) throw new WorkbookPreviewLimitError();
        row = new Map();
        rows.push(row);
        previous = -1;
        check();
      } else if (name === 'c' && row) {
        const reference = attributes['r'];
        const index = reference ? columnIndex(reference, budget) : previous + 1;
        previous = index;
        width = Math.max(width, index + 1);
        cell = { index, type: attributes['t'], formula: false, value: undefined, inline: [] };
        check();
      } else if (cell) {
        if (name === 'v') {
          inValue = true;
          cell.value ??= '';
        } else if (name === 'f') {
          cell.formula = true;
        } else if (name === 'rPh') {
          phoneticDepth += 1;
        } else if (name === 't' && phoneticDepth === 0) {
          inInlineText = true;
        }
      }
    },
    text(value) {
      if (!cell) return;
      if (inValue) cell.value = (cell.value ?? '') + value;
      else if (inInlineText) cell.inline.push(value);
    },
    close(name) {
      if (name === 'v') inValue = false;
      else if (name === 't') inInlineText = false;
      else if (name === 'rPh') phoneticDepth = Math.max(0, phoneticDepth - 1);
      else if (name === 'row') row = null;
      else if (name === 'c' && cell && row) {
        const done = cell;
        cell = null;
        let value: CellValue;
        if (done.formula && (done.value === undefined || done.value === '')) {
          value = [XLSX_NOT_CALCULATED];
        } else if (done.type === 's') {
          const shared = done.value?.trim() ? Number(done.value) : Number.NaN;
          value = Number.isInteger(shared) && shared >= 0 ? shared : [''];
        } else if (done.type === 'inlineStr') {
          value = done.inline;
        } else {
          value = [done.value ?? ''];
        }
        const replaced = row.get(done.index);
        if (replaced !== undefined && typeof replaced !== 'number') {
          known -= escapedCellLength(replaced, Number.MAX_SAFE_INTEGER);
        }
        row.set(done.index, value);
        if (typeof value === 'number') referenced.add(value);
        else known += escapedCellLength(value, budget - lowerBound());
        check();
      }
    },
  });
  if (!found) return null;
  return { sheet: { name: entry.name, rows, width }, lowerBound: lowerBound() };
}

function readSharedStrings(archive: WorkbookArchive, referenced: Set<number>): Map<number, string> {
  const kept = new Map<number, string>();
  if (referenced.size === 0) return kept;
  let index = -1;
  let keeping = false;
  let parts: string[] = [];
  let inText = false;
  let phoneticDepth = 0;
  let keptLength = 0;
  readMember(archive, SHARED_STRINGS_PATH, {
    open(name) {
      if (name === 'si') {
        index += 1;
        keeping = referenced.has(index);
        parts = [];
        phoneticDepth = 0;
      } else if (name === 'rPh') {
        phoneticDepth += 1;
      } else if (name === 't' && phoneticDepth === 0) {
        inText = true;
      }
    },
    text(value) {
      if (keeping && inText) parts.push(value);
    },
    close(name) {
      if (name === 't') inText = false;
      else if (name === 'rPh') phoneticDepth = Math.max(0, phoneticDepth - 1);
      else if (name === 'si' && keeping) {
        const text = parts.join('');
        keptLength += text.length;
        if (keptLength > MAX_FILE_TEXT_CHARS) throw new WorkbookPreviewLimitError();
        kept.set(index, text);
        keeping = false;
      }
    },
  });
  return kept;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function sheetCsv(sheet: ParsedSheet, shared: Map<number, string>, remaining: number): string {
  const rows = sheet.rows.map(
    (row) =>
      new Map(
        [...row.entries()].map(([index, value]): [number, readonly string[]] => [
          index,
          typeof value === 'number' ? [shared.get(value) ?? ''] : value,
        ]),
      ),
  );
  const width = sheet.width;
  if (rows.length - 1 > remaining) throw new WorkbookPreviewLimitError();
  const newlines = Math.max(0, rows.length - 1);
  const commasPerRow = Math.max(0, width - 1);
  if (
    newlines > remaining ||
    (rows.length > 0 && commasPerRow > Math.floor((remaining - newlines) / rows.length))
  ) {
    throw new WorkbookPreviewLimitError();
  }
  let length = newlines + rows.length * commasPerRow;
  for (const row of rows) {
    for (const parts of row.values()) {
      length += escapedCellLength(parts, remaining - length);
    }
  }
  return rows
    .map((row) => {
      const chunks: string[] = [];
      let previous = 0;
      for (const [index, parts] of [...row.entries()].sort(([a], [b]) => a - b)) {
        chunks.push(','.repeat(index - previous), csvCell(parts.join('')));
        previous = index;
      }
      chunks.push(','.repeat(Math.max(0, width - 1 - previous)));
      return chunks.join('');
    })
    .join('\n');
}

/**
 * Reads the worksheets of an XLSX file on the device, in tab order, as CSV. It never
 * evaluates formulas: a formula cell shows its cached value or {@link XLSX_NOT_CALCULATED}.
 * Throws {@link WorkbookPreviewLimitError} past the preview text limit and
 * {@link WorkbookFormatError} for a file it cannot read.
 */
export function readWorkbookSheets(data: Uint8Array): WorkbookSheet[] {
  const archive = openArchive(data);
  const referenced = new Set<number>();
  const parsed: ParsedSheet[] = [];
  let consumed = 0;
  for (const entry of sheetEntries(archive)) {
    const result = parseSheet(archive, entry, MAX_FILE_TEXT_CHARS - consumed, referenced);
    if (!result) continue;
    consumed += result.lowerBound;
    parsed.push(result.sheet);
  }
  const shared = readSharedStrings(archive, referenced);
  const sheets: WorkbookSheet[] = [];
  let remaining = MAX_FILE_TEXT_CHARS;
  for (const sheet of parsed) {
    const csv = sheetCsv(sheet, shared, remaining);
    remaining -= csv.length;
    sheets.push({ name: sheet.name, csv });
  }
  return sheets;
}
