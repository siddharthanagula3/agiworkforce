import 'server-only';

import JSZip from 'jszip';
import mammoth from 'mammoth';

import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import { XLSX_NOT_CALCULATED } from '@agiworkforce/unified-chat/tabular';
import { CellFormatTable, styleIndex } from '@agiworkforce/unified-chat/workbook-cell-formats';
import {
  displayCellNumber,
  type NumberFormat,
} from '@agiworkforce/unified-chat/workbook-number-formats';
import { replaceMarkupTags } from '@/lib/markup-tags';
import { truncateExtractedText } from '@/lib/server/extraction-truncation';
import {
  asciiLowercase,
  attributeValue,
  endsTagName as endsMarkupTagName,
  firstMarkupElement,
  firstOpenTag,
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

/**
 * How an archive is sized before anything inflates. `all-members` counts every
 * member's declared size, as project knowledge and chat have always done;
 * `text-parts` counts only the XML parts text is read from, so a deck heavy
 * with media is still read and its media are never inflated; `per-member`
 * leaves the total to a caller that checks each member as it reads it.
 */
export type OfficeArchiveSizing = 'all-members' | 'text-parts' | 'per-member';

export interface OfficeDocumentTextOptions {
  maxSlides?: number;
  maxSheetRows?: number;
  maxChars?: number;
  sizing?: OfficeArchiveSizing;
  /** Filled in by a presentation read: the slides past `maxSlides` that were left unread. */
  coverage?: { slidesOmitted: number };
}

const TEXT_PART = /\.(?:xml|rels)$/i;

export function isOfficeTextPart(path: string): boolean {
  return TEXT_PART.test(path);
}

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

function boundText(value: string, maxChars: number): string {
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return truncateExtractedText(normalized, maxChars);
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
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
    if ((kind !== 'd' && kind !== 'h') || !endsMarkupTagName(lower, start + 3)) {
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

export interface BoundedZip {
  zip: JSZip;
  budget: DecompressionBudget;
}

export async function openOfficeArchive(
  data: Buffer,
  filename: string,
  sizing: OfficeArchiveSizing = 'all-members',
): Promise<BoundedZip> {
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
    for (const entry of entries) {
      if (sizing === 'text-parts' && !isOfficeTextPart(entry.name)) continue;
      declared += declaredMemberSize(entry);
    }
    if (sizing !== 'per-member' && declared > budget.ceiling) {
      throw new DecompressionLimitError('total_bytes');
    }
  } catch (error) {
    if (error instanceof DecompressionLimitError) {
      throw new OfficeDocumentUnreadableError(filename, 'archive_bomb');
    }
    throw error;
  }

  return { zip, budget };
}

export async function officeArchiveEntryText(
  bounded: BoundedZip,
  path: string,
): Promise<string | null> {
  const entry = bounded.zip.file(path);
  if (!entry) return null;
  const bytes = await readArchiveMember(entry, bounded.budget);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function isWordCharacter(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x5f
  );
}

/**
 * The bodies `<tag\b[^>]*>([\s\S]*?)</tag>` would match, found by index scans:
 * once an opener has no closing tag after it, no later one has either, so the
 * scan stops where the pattern would rescan the rest of the XML per opener.
 */
function* xmlElementBodies(xml: string, tag: string): Generator<string> {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let position = 0;
  for (;;) {
    const start = xml.indexOf(open, position);
    if (start === -1) return;
    const nameEnd = start + open.length;
    if (nameEnd >= xml.length || isWordCharacter(xml.charCodeAt(nameEnd))) {
      position = start + 1;
      continue;
    }
    const tagEnd = xml.indexOf('>', nameEnd);
    if (tagEnd === -1) return;
    const closeAt = xml.indexOf(close, tagEnd + 1);
    if (closeAt === -1) return;
    yield xml.slice(tagEnd + 1, closeAt);
    position = closeAt + close.length;
  }
}

export function xmlTextRuns(xml: string, tag: string): string {
  let text = '';
  for (const body of xmlElementBodies(xml, tag)) text += decodeXmlEntities(body);
  return text;
}

function slideParagraphs(xml: string): string[] {
  return [...xmlElementBodies(xml, 'a:p')].map((body) =>
    xmlTextRuns(body, 'a:t').replace(/\s+/g, ' ').trim(),
  );
}

async function extractDocx(
  data: Buffer,
  filename: string,
  sizing: OfficeArchiveSizing,
): Promise<string> {
  const bounded = await openOfficeArchive(data, filename, sizing);
  const textPartsOnly = sizing === 'text-parts';
  try {
    const accepted = new JSZip();
    const comment =
      'comment' in bounded.zip && typeof bounded.zip.comment === 'string'
        ? bounded.zip.comment
        : undefined;
    for (const entry of Object.values(bounded.zip.files)) {
      if (textPartsOnly && !entry.dir && !isOfficeTextPart(entry.name)) continue;
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
    const result = await mammoth.convertToHtml(
      { buffer },
      textPartsOnly
        ? { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })) }
        : undefined,
    );
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

export interface XmlElement {
  attributes: string;
  body: string;
}

function endsTagName(code: number): boolean {
  return (
    code === 0x3e ||
    code === 0x2f ||
    code === 0x20 ||
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0d
  );
}

/**
 * Start tags named `tag`, by index scans rather than a backtracking pattern:
 * an opener with no `>` after it ends the scan, since none after it has one.
 */
export function* xmlStartTags(
  xml: string,
  tag: string,
): Generator<{ attributes: string; end: number }> {
  const open = `<${tag}`;
  let position = 0;
  for (;;) {
    const start = xml.indexOf(open, position);
    if (start === -1) return;
    const nameEnd = start + open.length;
    if (!endsTagName(xml.charCodeAt(nameEnd))) {
      position = nameEnd;
      continue;
    }
    const tagEnd = xml.indexOf('>', nameEnd);
    if (tagEnd === -1) return;
    yield { attributes: xml.slice(nameEnd, tagEnd), end: tagEnd + 1 };
    position = tagEnd + 1;
  }
}

/**
 * Elements named `tag` with their bodies; a self-closing one has an empty
 * body. An element with no closing tag ends the scan, since no later one can
 * close either, so the work stays linear in the XML whatever it holds.
 */
export function* xmlElements(xml: string, tag: string): Generator<XmlElement> {
  const close = `</${tag}>`;
  const starts = xmlStartTags(xml, tag);
  let resumeAt = 0;
  for (;;) {
    const next = starts.next();
    if (next.done) return;
    const { attributes, end } = next.value;
    if (end <= resumeAt) continue;
    if (attributes.endsWith('/')) {
      yield { attributes: attributes.slice(0, -1), body: '' };
      continue;
    }
    const closeAt = xml.indexOf(close, end);
    if (closeAt === -1) return;
    yield { attributes, body: xml.slice(end, closeAt) };
    resumeAt = closeAt + close.length;
  }
}

interface CellStyles {
  formats: readonly (NumberFormat | null)[];
  date1904: boolean;
}

function formatCode(attributes: string): string {
  const raw = /formatCode="([^"]*)"/.exec(attributes)?.[1] ?? '';
  try {
    return decodeXmlEntities(raw);
  } catch (error) {
    if (error instanceof RangeError) return '';
    throw error;
  }
}

/**
 * The number format of each cell style, under the same bounds as the workbook
 * viewer: past them, or without a closed `cellXfs`, every number keeps its
 * stored value.
 */
export function cellStyleFormats(xml: string): (NumberFormat | null)[] {
  const table = new CellFormatTable();
  const declared = xmlElements(xml, 'numFmts').next();
  if (!declared.done) {
    for (const { attributes } of xmlStartTags(declared.value.body, 'numFmt')) {
      const id = /numFmtId="([^"]*)"/.exec(attributes)?.[1];
      if (!table.addCustomFormat(id, formatCode(attributes))) return [];
    }
  }
  const cellXfs = xmlElements(xml, 'cellXfs').next();
  if (cellXfs.done) return [];
  for (const { attributes } of xmlStartTags(cellXfs.value.body, 'xf')) {
    if (!table.addCellFormat(/numFmtId="([^"]*)"/.exec(attributes)?.[1])) return [];
  }
  return table.formats();
}

/**
 * The styles part is read only when it fits what is left of the archive
 * budget, and any failure to read it leaves every number at its stored value.
 */
async function cellStyles(
  bounded: BoundedZip,
  path: string,
  date1904: boolean,
): Promise<CellStyles> {
  try {
    const entry = bounded.zip.file(path);
    if (!entry || declaredMemberSize(entry) > bounded.budget.ceiling - bounded.budget.spent) {
      return { formats: [], date1904 };
    }
    const xml = await officeArchiveEntryText(bounded, path);
    return { formats: xml === null ? [] : cellStyleFormats(xml), date1904 };
  } catch {
    return { formats: [], date1904 };
  }
}

function columnName(index: number): string {
  if (!Number.isSafeInteger(index) || index < 1) return '';
  let name = '';
  for (let rest = index; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  }
  return name;
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

function markupTextRuns(xml: string, tag: string): string {
  let text = '';
  for (const run of markupElements(xml, tag)) text += decodeXmlEntities(run.body);
  return text;
}

async function readXlsxSheets(
  data: Buffer,
  filename: string,
  maxSheetRows: number = MAX_SHEET_ROWS,
  sizing: OfficeArchiveSizing = 'all-members',
): Promise<Sheet[]> {
  const bounded = await openOfficeArchive(data, filename, sizing);
  const workbook = await officeArchiveEntryText(bounded, 'xl/workbook.xml');
  if (!workbook) throw new OfficeDocumentUnreadableError(filename);

  const relationships = (await officeArchiveEntryText(bounded, 'xl/_rels/workbook.xml.rels')) ?? '';
  const targetByRelationshipId = new Map<string, string>();
  let stylesTarget: string | undefined;
  for (const tag of openTags(relationships, 'Relationship')) {
    const id = attributeValue(tag, 'Id', '<Relationship'.length);
    const target = attributeValue(tag, 'Target', '<Relationship'.length)?.replace(/^\/?xl\//, '');
    if (id && target) targetByRelationshipId.set(id, target);
    if (target && attributeValue(tag, 'Type', '<Relationship'.length)?.endsWith('/styles')) {
      stylesTarget ??= target;
    }
  }
  const workbookProperties = firstOpenTag(workbook, 'workbookPr');
  const date1904Attribute =
    workbookProperties === undefined
      ? undefined
      : attributeValue(workbookProperties, 'date1904', '<workbookPr'.length)?.trim();
  const date1904 = date1904Attribute === '1' || date1904Attribute === 'true';

  const sharedStringsXml = (await officeArchiveEntryText(bounded, 'xl/sharedStrings.xml')) ?? '';
  const sharedStrings = [...markupElements(sharedStringsXml, 'si')].map((element) =>
    markupTextRuns(element.body, 't'),
  );

  const sheets: Sheet[] = [];
  let styles: CellStyles | undefined;
  let sheetIndex = 0;
  for (const sheetTag of openTags(workbook, 'sheet')) {
    sheetIndex += 1;
    const name = attributeValue(sheetTag, 'name', '<sheet'.length) ?? `Sheet${sheetIndex}`;
    const relationshipId = attributeValue(sheetTag, 'r:id', '<sheet'.length);
    const target = relationshipId ? targetByRelationshipId.get(relationshipId) : undefined;
    const sheetXml =
      (target ? await officeArchiveEntryText(bounded, `xl/${target}`) : null) ??
      (await officeArchiveEntryText(bounded, `xl/worksheets/sheet${sheetIndex}.xml`));
    if (!sheetXml) continue;
    const sheetStyles = (styles ??= await cellStyles(
      bounded,
      `xl/${stylesTarget ?? 'styles.xml'}`,
      date1904,
    ));

    const rows: SheetRow[] = [];
    let omitted = false;
    let lastRow = 0;
    for (const row of markupElements(sheetXml, 'row')) {
      if (rows.length >= maxSheetRows) {
        omitted = true;
        break;
      }
      const declaredRow = /^\d+$/.exec(attributeValue(row.attributes, 'r') ?? '')?.[0];
      lastRow = declaredRow === undefined ? lastRow + 1 : Number(declaredRow);
      const cells: SheetCell[] = [];
      let lastColumn = 0;
      for (const { attributes, body } of markupElements(row.body, 'c')) {
        const declaredColumn = /^([A-Z]+)\d+$/.exec(attributeValue(attributes, 'r') ?? '')?.[1];
        lastColumn = declaredColumn === undefined ? lastColumn + 1 : columnIndex(declaredColumn);
        const type = attributeValue(attributes, 't') || 'n';
        const formulaElement = firstMarkupElement(body, 'f');
        const formula = formulaElement?.body;
        const rawValue = firstMarkupElement(body, 'v')?.body ?? '';
        let value: string;
        if (type === 's') {
          value = rawValue === '' ? '' : (sharedStrings[Number(rawValue)] ?? '');
        } else if (type === 'inlineStr') {
          value = markupTextRuns(body, 't');
        } else {
          value = decodeXmlEntities(rawValue);
          if (type === 'n' && value) {
            const style = styleIndex(attributeValue(attributes, 's') ?? '0');
            value = displayCellNumber(
              value,
              sheetStyles.formats[style] ?? null,
              sheetStyles.date1904,
            );
          }
        }
        if (formulaElement !== undefined && !formula && !value && type !== 'str') {
          value = XLSX_NOT_CALCULATED;
        }
        if (formula || value) {
          cells.push({
            column: declaredColumn ?? columnName(lastColumn),
            value,
            formula: formula ? decodeXmlEntities(formula) : null,
          });
        }
      }
      if (cells.length > 0) rows.push({ number: declaredRow ?? String(lastRow), cells });
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

async function extractXlsx(
  data: Buffer,
  filename: string,
  maxSheetRows: number,
  sizing: OfficeArchiveSizing,
): Promise<string> {
  const sheets = await readXlsxSheets(data, filename, maxSheetRows, sizing);
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

async function extractPptx(
  data: Buffer,
  filename: string,
  maxSlides: number,
  sizing: OfficeArchiveSizing,
  coverage?: { slidesOmitted: number },
): Promise<string> {
  const bounded = await openOfficeArchive(data, filename, sizing);
  const allSlidePaths = Object.keys(bounded.zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => rowNumber(a) - rowNumber(b));
  const slidePaths = allSlidePaths.slice(0, maxSlides);
  if (slidePaths.length === 0) throw new OfficeDocumentUnreadableError(filename);
  if (coverage) coverage.slidesOmitted = allSlidePaths.length - slidePaths.length;

  const sections: string[] = [];
  for (const [index, path] of slidePaths.entries()) {
    const slideXml = (await officeArchiveEntryText(bounded, path)) ?? '';
    const lines = slideParagraphs(slideXml).filter(Boolean);
    const slideNumber = rowNumber(path);
    const notesXml =
      (await officeArchiveEntryText(bounded, `ppt/notesSlides/notesSlide${slideNumber}.xml`)) ?? '';
    const notes = slideParagraphs(notesXml).filter((line) => line && line !== String(slideNumber));
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
  options: OfficeDocumentTextOptions = {},
): Promise<string> {
  const sizing = options.sizing ?? 'all-members';
  try {
    const text =
      kind === 'docx'
        ? await extractDocx(data, fileName, sizing)
        : kind === 'xlsx'
          ? await extractXlsx(data, fileName, options.maxSheetRows ?? MAX_SHEET_ROWS, sizing)
          : await extractPptx(
              data,
              fileName,
              options.maxSlides ?? MAX_SLIDES,
              sizing,
              options.coverage,
            );
    return boundText(text, options.maxChars ?? MAX_OFFICE_TEXT_CHARS);
  } catch (error) {
    if (error instanceof DecompressionLimitError) {
      throw new OfficeDocumentUnreadableError(fileName, 'archive_bomb');
    }
    throw error;
  }
}
