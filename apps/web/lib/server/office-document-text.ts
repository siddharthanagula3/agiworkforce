import 'server-only';

import JSZip from 'jszip';
import mammoth from 'mammoth';

import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import { replaceMarkupTags } from '@/lib/markup-tags';
import { truncateExtractedText } from '@/lib/server/extraction-truncation';
import {
  asciiLowercase,
  attributeValue,
  characterReference,
  endsTagName,
  firstMarkupElement,
  forwardFinder,
  markupElements,
  openTags,
} from '@/lib/server/ooxml-markup';

import {
  DecompressionLimitError,
  MAX_OFFICE_UNCOMPRESSED_BYTES,
  declaredMemberSize,
  decompressionBudget,
  readArchiveMember,
  type DecompressionBudget,
} from '@/lib/security/archive-bounds';

export const MAX_OFFICE_TEXT_CHARS = MAX_FILE_TEXT_CHARS;

const MAX_SHEET_ROWS = 5_000;
const MAX_SLIDES = 200;

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export type OfficeDocumentKind = 'docx' | 'xlsx' | 'pptx';

const KIND_BY_MIME: Record<string, OfficeDocumentKind> = {
  [DOCX_MIME_TYPE]: 'docx',
  [XLSX_MIME_TYPE]: 'xlsx',
  [PPTX_MIME_TYPE]: 'pptx',
};

const KIND_BY_EXTENSION: Record<string, OfficeDocumentKind> = {
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
};

export const OFFICE_DOCUMENT_FAILURE_REASONS = [
  'corrupt',
  'encrypted',
  'archive_bomb',
  'macro_present',
] as const;
export type OfficeDocumentFailureReason = (typeof OFFICE_DOCUMENT_FAILURE_REASONS)[number];

const FAILURE_MESSAGES: Readonly<Record<OfficeDocumentFailureReason, string>> = {
  corrupt: 'could not be read. It may be damaged or incomplete.',
  encrypted: 'is password protected. Remove the password and upload it again.',
  archive_bomb: 'expands to far more data than it declares, so it was not opened.',
  macro_present: 'contains macros, which are not read. Save it without macros.',
};

/**
 * Why the file was refused, in words a reader can act on. The decoder's own
 * message is never part of it: it names internal paths and offsets.
 */
export class OfficeDocumentUnreadableError extends Error {
  readonly reason: OfficeDocumentFailureReason;
  constructor(
    readonly filename: string,
    reason: OfficeDocumentFailureReason = 'corrupt',
  ) {
    super(`${filename} ${FAILURE_MESSAGES[reason]}`);
    this.name = 'OfficeDocumentUnreadableError';
    this.reason = reason;
  }
}

const OLE_COMPOUND_FILE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

function isEncryptedOfficeContainer(data: Buffer): boolean {
  return data.subarray(0, 4).equals(OLE_COMPOUND_FILE_MAGIC);
}

export function officeDocumentKind(fileName: string, mimeType: string): OfficeDocumentKind | null {
  const byMime = KIND_BY_MIME[mimeType.trim().toLowerCase()];
  if (byMime) return byMime;
  const lower = fileName.trim().toLowerCase();
  for (const [extension, kind] of Object.entries(KIND_BY_EXTENSION)) {
    if (lower.endsWith(extension)) return kind;
  }
  return null;
}

function boundText(value: string): string {
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return truncateExtractedText(normalized, MAX_OFFICE_TEXT_CHARS);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (reference, code: string) => characterReference(reference, Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (reference, code: string) =>
      characterReference(reference, parseInt(code, 16)),
    )
    .replace(/&amp;/g, '&');
}

const ANY_TAG_OPENING = /<[^>]/g;

function stripTags(html: string): string {
  return replaceMarkupTags(html, ANY_TAG_OPENING, ' ');
}

function tableCellTexts(rowHtml: string): string[] {
  const lower = asciiLowercase(rowHtml);
  const find = forwardFinder(lower);
  const cells: string[] = [];
  let cursor = 0;
  while (cursor < rowHtml.length) {
    const start = find('<t', cursor);
    if (start === -1) break;
    const kind = lower[start + 2];
    if ((kind !== 'd' && kind !== 'h') || !endsTagName(lower, start + 3)) {
      cursor = start + 2;
      continue;
    }
    const tagEnd = find('>', start + 3);
    if (tagEnd === -1) break;
    const dataEnd = find('</td>', tagEnd + 1);
    const headerEnd = find('</th>', tagEnd + 1);
    const closeStart =
      dataEnd === -1 ? headerEnd : headerEnd === -1 ? dataEnd : Math.min(dataEnd, headerEnd);
    if (closeStart === -1) break;
    cells.push(decodeXmlEntities(stripTags(rowHtml.slice(tagEnd + 1, closeStart))).trim());
    cursor = closeStart + 5;
  }
  return cells;
}

const BLOCK_TAG_NAME = /(h[1-6]|p|li|tr)(?![A-Za-z0-9_])/iy;
const TABLE_TAG_NAME = /table(?![A-Za-z0-9_])/iy;
const LINE_BREAK = /br\s*\/?>/iy;

function htmlToText(html: string): string {
  const lines: string[] = [];
  const lower = asciiLowercase(html);
  const find = forwardFinder(lower);
  let matched = false;
  let cursor = 0;

  while (cursor < html.length) {
    const open = find('<', cursor);
    if (open === -1) break;
    cursor = open + 1;

    BLOCK_TAG_NAME.lastIndex = open + 1;
    const block = BLOCK_TAG_NAME.exec(lower);
    if (block) {
      const tag = block[1] ?? '';
      const tagEnd = find('>', open + 1 + tag.length);
      if (tagEnd === -1) break;
      const closeStart = find(`</${tag}>`, tagEnd + 1);
      if (closeStart !== -1) {
        const end = closeStart + tag.length + 3;
        matched = true;
        cursor = end;
        if (tag === 'tr') {
          const row = tableCellTexts(html.slice(open, end)).join(' | ');
          if (row) lines.push(`| ${row} |`);
          continue;
        }
        const text = decodeXmlEntities(stripTags(html.slice(tagEnd + 1, closeStart)))
          .replace(/\s+/g, ' ')
          .trim();
        if (!text) continue;
        if (tag.startsWith('h')) {
          lines.push(`${'#'.repeat(Number(tag.slice(1)))} ${text}`);
          continue;
        }
        lines.push(tag === 'li' ? `- ${text}` : text);
        continue;
      }
    }

    TABLE_TAG_NAME.lastIndex = open + 1;
    if (TABLE_TAG_NAME.test(lower)) {
      const tagEnd = find('>', open + 6);
      if (tagEnd === -1) break;
      matched = true;
      cursor = tagEnd + 1;
      continue;
    }

    if (lower.startsWith('/table>', open + 1)) {
      matched = true;
      cursor = open + 8;
      continue;
    }

    LINE_BREAK.lastIndex = open + 1;
    if (LINE_BREAK.test(lower)) {
      matched = true;
      cursor = LINE_BREAK.lastIndex;
    }
  }

  if (!matched) {
    const text = decodeXmlEntities(stripTags(html)).replace(/\s+/g, ' ').trim();
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

interface BoundedZip {
  zip: JSZip;
  budget: DecompressionBudget;
}

async function readZip(data: Buffer, filename: string): Promise<BoundedZip> {
  if (isEncryptedOfficeContainer(data)) {
    throw new OfficeDocumentUnreadableError(filename, 'encrypted');
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new OfficeDocumentUnreadableError(filename, 'corrupt');
  }

  if (zip.file(/vbaProject\.bin$/i).length > 0) {
    throw new OfficeDocumentUnreadableError(filename, 'macro_present');
  }

  const budget = decompressionBudget(data.byteLength, MAX_OFFICE_UNCOMPRESSED_BYTES);
  const entries: JSZip.JSZipObject[] = [];
  zip.forEach((_, entry) => {
    if (!entry.dir) entries.push(entry);
  });

  try {
    budget.admitMembers(entries.length);
    let declared = 0;
    for (const entry of entries) declared += declaredMemberSize(entry);
    if (declared > budget.ceiling) throw new DecompressionLimitError('total_bytes');
  } catch (error) {
    if (error instanceof DecompressionLimitError) {
      throw new OfficeDocumentUnreadableError(filename, 'archive_bomb');
    }
    throw error;
  }

  return { zip, budget };
}

async function entryText(bounded: BoundedZip, path: string): Promise<string | null> {
  const entry = bounded.zip.file(path);
  if (!entry) return null;
  const bytes = await readArchiveMember(entry, bounded.budget);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function xmlTextRuns(xml: string, tag: string): string {
  let text = '';
  for (const run of markupElements(xml, tag)) text += decodeXmlEntities(run.body);
  return text;
}

function paragraphLines(xml: string): string[] {
  const lines: string[] = [];
  for (const paragraph of markupElements(xml, 'a:p')) {
    lines.push(xmlTextRuns(paragraph.body, 'a:t').replace(/\s+/g, ' ').trim());
  }
  return lines;
}

async function extractDocx(data: Buffer, filename: string): Promise<string> {
  const bounded = await readZip(data, filename);
  try {
    const accepted = new JSZip();
    const comment =
      'comment' in bounded.zip && typeof bounded.zip.comment === 'string'
        ? bounded.zip.comment
        : undefined;
    for (const entry of Object.values(bounded.zip.files)) {
      const bytes = entry.dir ? new Uint8Array() : await readArchiveMember(entry, bounded.budget);
      accepted.file(entry.name, bytes, {
        dir: entry.dir,
        date: entry.date,
        comment: entry.comment,
        unixPermissions: entry.unixPermissions,
        dosPermissions: entry.dosPermissions,
        createFolders: false,
        compression: 'STORE',
      });
    }
    const buffer = await accepted.generateAsync({
      type: 'nodebuffer',
      compression: 'STORE',
      comment,
    });
    const result = await mammoth.convertToHtml({ buffer });
    return htmlToText(result.value);
  } catch (error) {
    if (
      error instanceof OfficeDocumentUnreadableError ||
      error instanceof DecompressionLimitError
    ) {
      throw error;
    }
    throw new OfficeDocumentUnreadableError(filename, 'corrupt');
  }
}

function columnLabel(reference: string): string {
  return reference.replace(/\d+/g, '');
}

function rowNumber(reference: string): number {
  const digits = /\d+/.exec(reference);
  return digits ? Number(digits[0]) : 0;
}

interface SheetCell {
  column: string;
  value: string;
  formula: string | null;
}

interface SheetRow {
  number: string;
  cells: SheetCell[];
}

interface Sheet {
  name: string;
  rows: SheetRow[];
  omitted: boolean;
}

async function readXlsxSheets(data: Buffer, filename: string): Promise<Sheet[]> {
  const bounded = await readZip(data, filename);
  const workbook = await entryText(bounded, 'xl/workbook.xml');
  if (!workbook) throw new OfficeDocumentUnreadableError(filename);

  const relationships = (await entryText(bounded, 'xl/_rels/workbook.xml.rels')) ?? '';
  const targetByRelationshipId = new Map<string, string>();
  for (const tag of openTags(relationships, 'Relationship')) {
    const id = attributeValue(tag, 'Id', '<Relationship'.length);
    const target = attributeValue(tag, 'Target', '<Relationship'.length);
    if (id && target) targetByRelationshipId.set(id, target.replace(/^\/?xl\//, ''));
  }

  const sharedStringsXml = (await entryText(bounded, 'xl/sharedStrings.xml')) ?? '';
  const sharedStrings = [...markupElements(sharedStringsXml, 'si')].map((item) =>
    xmlTextRuns(item.body, 't'),
  );

  const sheets: Sheet[] = [];
  let sheetIndex = 0;
  for (const sheetTag of openTags(workbook, 'sheet')) {
    sheetIndex += 1;
    const name = attributeValue(sheetTag, 'name', '<sheet'.length) ?? `Sheet${sheetIndex}`;
    const relationshipId = attributeValue(sheetTag, 'r:id', '<sheet'.length);
    const target = relationshipId ? targetByRelationshipId.get(relationshipId) : undefined;
    const sheetXml =
      (target ? await entryText(bounded, `xl/${target}`) : null) ??
      (await entryText(bounded, `xl/worksheets/sheet${sheetIndex}.xml`));
    if (!sheetXml) continue;

    const rows: SheetRow[] = [];
    let omitted = false;
    for (const row of markupElements(sheetXml, 'row')) {
      if (rows.length >= MAX_SHEET_ROWS) {
        omitted = true;
        break;
      }
      const cells: SheetCell[] = [];
      for (const cellElement of markupElements(row.body, 'c')) {
        const attributes = cellElement.attributes;
        const body = cellElement.body;
        const reference = /^[A-Z]+\d+$/.exec(attributeValue(attributes, 'r') ?? '')?.[0] ?? '';
        const type = attributeValue(attributes, 't') || 'n';
        const formulaElement = firstMarkupElement(body, 'f');
        const formula =
          formulaElement && !formulaElement.selfClosing ? formulaElement.body : undefined;
        const rawValue = firstMarkupElement(body, 'v')?.body ?? '';
        let value: string;
        if (type === 's') {
          value = sharedStrings[Number(rawValue)] ?? '';
        } else if (type === 'inlineStr') {
          value = xmlTextRuns(body, 't');
        } else {
          value = decodeXmlEntities(rawValue);
        }
        if (formula || value) {
          cells.push({
            column: columnLabel(reference),
            value,
            formula: formula ? decodeXmlEntities(formula) : null,
          });
        }
      }
      if (cells.length > 0) {
        const number =
          /^\d+$/.exec(attributeValue(row.attributes, 'r') ?? '')?.[0] ?? String(rows.length + 1);
        rows.push({ number, cells });
      }
    }
    sheets.push({ name, rows, omitted });
  }

  if (sheets.length === 0) throw new OfficeDocumentUnreadableError(filename);
  return sheets;
}

function sheetCellText(cell: SheetCell): string {
  if (!cell.formula) return `${cell.column}: ${cell.value}`;
  return `${cell.column}: =${cell.formula}${cell.value ? ` (${cell.value})` : ''}`;
}

async function extractXlsx(data: Buffer, filename: string): Promise<string> {
  const sheets = await readXlsxSheets(data, filename);
  return sheets
    .map((sheet) => {
      const rows = sheet.rows.map(
        (row) => `Row ${row.number}: ${row.cells.map(sheetCellText).join(' | ')}`,
      );
      if (sheet.omitted) rows.push('[Remaining rows omitted.]');
      return [`## Sheet: ${sheet.name}`, ...(rows.length ? rows : ['[empty sheet]'])].join('\n');
    })
    .join('\n\n');
}

function columnIndex(column: string): number {
  let index = 0;
  for (const letter of column) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index;
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export interface SpreadsheetTable {
  csv: string;
  complete: boolean;
}

export async function extractSpreadsheetTable(
  data: Buffer,
  fileName: string,
  maxChars: number,
): Promise<SpreadsheetTable> {
  try {
    const filled = (await readXlsxSheets(data, fileName)).filter((sheet) => sheet.rows.length > 0);
    const [shown] = filled;
    const columns = [
      ...new Set(shown?.rows.flatMap((row) => row.cells.map((cell) => cell.column)) ?? []),
    ].sort((a, b) => columnIndex(a) - columnIndex(b));
    const lines: string[] = [];
    let length = 0;
    let complete = filled.length <= 1 && shown?.omitted !== true;
    for (const row of shown?.rows ?? []) {
      const byColumn = new Map(
        row.cells.map((cell) => [
          cell.column,
          cell.value || (cell.formula ? `=${cell.formula}` : ''),
        ]),
      );
      const line = columns.map((column) => csvField(byColumn.get(column) ?? '')).join(',');
      if (length + line.length + 1 > maxChars) {
        complete = false;
        break;
      }
      lines.push(line);
      length += line.length + 1;
    }
    return { csv: lines.join('\n'), complete };
  } catch (error) {
    if (error instanceof DecompressionLimitError) {
      throw new OfficeDocumentUnreadableError(fileName, 'archive_bomb');
    }
    throw error;
  }
}

async function extractPptx(data: Buffer, filename: string): Promise<string> {
  const bounded = await readZip(data, filename);
  const slidePaths = Object.keys(bounded.zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => rowNumber(a) - rowNumber(b))
    .slice(0, MAX_SLIDES);
  if (slidePaths.length === 0) throw new OfficeDocumentUnreadableError(filename);

  const sections: string[] = [];
  for (const [index, path] of slidePaths.entries()) {
    const slideXml = (await entryText(bounded, path)) ?? '';
    const lines = paragraphLines(slideXml).filter(Boolean);
    const slideNumber = rowNumber(path);
    const notesXml =
      (await entryText(bounded, `ppt/notesSlides/notesSlide${slideNumber}.xml`)) ?? '';
    const notes = paragraphLines(notesXml).filter((line) => line && line !== String(slideNumber));
    sections.push(
      [
        `## Slide ${index + 1}`,
        ...(lines.length ? lines : ['[no text on this slide]']),
        ...(notes.length ? [`Speaker notes: ${notes.join(' ')}`] : []),
      ].join('\n'),
    );
  }
  return sections.join('\n\n');
}

export async function extractOfficeDocumentText(
  data: Buffer,
  fileName: string,
  kind: OfficeDocumentKind,
): Promise<string> {
  try {
    const text =
      kind === 'docx'
        ? await extractDocx(data, fileName)
        : kind === 'xlsx'
          ? await extractXlsx(data, fileName)
          : await extractPptx(data, fileName);
    return boundText(text);
  } catch (error) {
    if (error instanceof DecompressionLimitError) {
      throw new OfficeDocumentUnreadableError(fileName, 'archive_bomb');
    }
    throw error;
  }
}
