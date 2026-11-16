import 'server-only';

import type { ChatLargeFilePolicy } from '@/lib/chat-attachment-policy';
import {
  declaredMemberSize,
  DecompressionLimitError,
  readArchiveMember,
} from '@/lib/security/archive-bounds';
import {
  decodeXmlEntities,
  officeArchiveEntryText,
  openOfficeArchive,
  OfficeDocumentUnreadableError,
  type BoundedZip,
} from '@/lib/server/office-document-text';
import {
  boundedStorableText,
  columnType,
  emptyCounts,
  MAX_COLUMN_NAME_BYTES,
  valueType,
  type ColumnCounts,
  type ColumnType,
} from './delimited';
import { PreparationRefusedError } from './progress-store';

const TYPE_INFERENCE_ROWS = 1_000;
const MAX_PROFILED_COLUMNS = 256;
const MAX_CELL_CHARS = 200;
const MAX_LISTED_SHEETS = 100;
export const MAX_SHEET_PROFILES_BYTES = 256 * 1024;

export interface SheetProfile {
  name: string;
  profiled: boolean;
  dimension?: string;
  rowCount?: number;
  columns?: { name: string; type: ColumnType }[];
  columnsOmitted?: boolean;
}

export interface PreparedWorkbook {
  text: string;
  sheets: SheetProfile[];
  sheetCount: number;
  partial: boolean;
}

interface SheetRef {
  name: string;
  path: string;
}

interface XmlElement {
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
function* xmlStartTags(xml: string, tag: string): Generator<{ attributes: string; end: number }> {
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
function* xmlElements(xml: string, tag: string): Generator<XmlElement> {
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

function textRuns(xml: string): string {
  let text = '';
  for (const element of xmlElements(xml, 't')) text += decodeXmlEntities(element.body);
  return text;
}

function columnIndex(column: string): number {
  let index = 0;
  for (const letter of column) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index;
}

function csvField(value: string): string {
  const bounded = value.length > MAX_CELL_CHARS ? value.slice(0, MAX_CELL_CHARS) : value;
  return /[",\n\r]/.test(bounded) ? `"${bounded.replace(/"/g, '""')}"` : bounded;
}

function profileName(value: string): string {
  return boundedStorableText(value, MAX_COLUMN_NAME_BYTES);
}

async function sheetRefs(bounded: BoundedZip, fileName: string): Promise<SheetRef[]> {
  const workbook = await officeArchiveEntryText(bounded, 'xl/workbook.xml');
  if (!workbook) throw new OfficeDocumentUnreadableError(fileName);
  const relationships = (await officeArchiveEntryText(bounded, 'xl/_rels/workbook.xml.rels')) ?? '';
  const targets = new Map<string, string>();
  for (const { attributes } of xmlStartTags(relationships, 'Relationship')) {
    const id = /Id="([^"]+)"/.exec(attributes)?.[1];
    const target = /Target="([^"]+)"/.exec(attributes)?.[1];
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, ''));
  }
  const refs: SheetRef[] = [];
  let index = 0;
  for (const { attributes } of xmlStartTags(workbook, 'sheet')) {
    index += 1;
    const name = profileName(
      decodeXmlEntities(/name="([^"]*)"/.exec(attributes)?.[1] ?? `Sheet${index}`),
    );
    const relationshipId = /r:id="([^"]+)"/.exec(attributes)?.[1];
    const target = relationshipId ? targets.get(relationshipId) : undefined;
    refs.push({ name, path: `xl/${target ?? `worksheets/sheet${index}.xml`}` });
  }
  return refs;
}

async function sheetXmlWithinBudget(
  bounded: BoundedZip,
  path: string,
): Promise<string | null | 'over'> {
  const entry = bounded.zip.file(path);
  if (!entry) return null;
  if (declaredMemberSize(entry) > bounded.budget.ceiling - bounded.budget.spent) return 'over';
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(
      await readArchiveMember(entry, bounded.budget),
    );
  } catch (error) {
    if (error instanceof DecompressionLimitError) return 'over';
    throw error;
  }
}

function cellValue(attributes: string, body: string, sharedStrings: readonly string[]): string {
  const type = /t="([^"]+)"/.exec(attributes)?.[1] ?? 'n';
  const valueStart = body.indexOf('<v>');
  const valueEnd = valueStart === -1 ? -1 : body.indexOf('</v>', valueStart + 3);
  const raw = valueEnd === -1 ? '' : body.slice(valueStart + 3, valueEnd);
  if (type === 's') return sharedStrings[Number(raw)] ?? '';
  if (type === 'inlineStr') return textRuns(body);
  if (type === 'b') return raw === '1' ? 'true' : raw === '0' ? 'false' : raw;
  return decodeXmlEntities(raw);
}

function sheetDimension(xml: string): string | undefined {
  const first = xmlStartTags(xml, 'dimension').next();
  if (first.done) return undefined;
  const ref = /ref="([^"]+)"/.exec(first.value.attributes)?.[1];
  return ref === undefined ? undefined : profileName(ref);
}

function profileSheet(
  ref: SheetRef,
  xml: string,
  sharedStrings: readonly string[],
  sampleRows: number,
): { profile: SheetProfile; text: string } {
  const rows: Map<string, string>[] = [];
  let rowCount = 0;
  for (const row of xmlElements(xml, 'row')) {
    const cells = new Map<string, string>();
    for (const cell of xmlElements(row.body, 'c')) {
      const reference = /r="([A-Z]+)\d+"/.exec(cell.attributes)?.[1];
      if (!reference) continue;
      const value = cellValue(cell.attributes, cell.body, sharedStrings);
      if (value) cells.set(reference, value);
    }
    if (cells.size === 0) continue;
    rowCount += 1;
    if (rows.length <= Math.max(sampleRows, TYPE_INFERENCE_ROWS)) rows.push(cells);
  }

  const [header, ...dataRows] = rows;
  const columns = [...new Set(rows.slice(0, sampleRows + 1).flatMap((row) => [...row.keys()]))]
    .sort((a, b) => columnIndex(a) - columnIndex(b))
    .slice(0, MAX_PROFILED_COLUMNS);
  const counts = new Map<string, ColumnCounts>(columns.map((column) => [column, emptyCounts()]));
  for (const row of dataRows.slice(0, TYPE_INFERENCE_ROWS)) {
    for (const column of columns) counts.get(column)![valueType(row.get(column) ?? '')] += 1;
  }
  const profileColumns = columns.map((column) => ({
    name: profileName(header?.get(column) ?? column),
    type: columnType(counts.get(column) ?? emptyCounts()),
  }));
  const dimension = sheetDimension(xml);
  const dataRowCount = Math.max(rowCount - 1, 0);
  const csv = (row: Map<string, string>) =>
    columns.map((column) => csvField(row.get(column) ?? '')).join(',');
  const shown = dataRows.slice(0, sampleRows);
  const lines = [
    `## Sheet: ${ref.name}${dimension ? ` (${dimension})` : ''}`,
    `${dataRowCount.toLocaleString('en-US')} rows after the header, ${columns.length} columns.`,
    ...profileColumns.map((column) => `- ${column.name}: ${column.type}`),
  ];
  if (header) lines.push('', `First ${shown.length} rows:`, csv(header), ...shown.map(csv));
  return {
    profile: {
      name: ref.name,
      profiled: true,
      ...(dimension ? { dimension } : {}),
      rowCount: dataRowCount,
      columns: profileColumns,
    },
    text: lines.join('\n'),
  };
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/**
 * The profiles go into the row's coverage, which every card read loads, so
 * column lists are kept in workbook order while they fit a byte budget and
 * the later sheets say their columns were left out.
 */
function boundedProfiles(sheets: readonly SheetProfile[]): SheetProfile[] {
  const bare = sheets.map((sheet): SheetProfile => {
    const { columns, ...rest } = sheet;
    return columns ? { ...rest, columnsOmitted: true } : rest;
  });
  let spent = jsonBytes(bare);
  let exhausted = false;
  return sheets.map((sheet, index) => {
    if (!sheet.columns) return sheet;
    if (!exhausted) {
      const extra = jsonBytes(sheet) - jsonBytes(bare[index]);
      if (spent + extra <= MAX_SHEET_PROFILES_BYTES) {
        spent += extra;
        return sheet;
      }
      exhausted = true;
    }
    return bare[index]!;
  });
}

/**
 * Sheets in workbook order while their inflated XML fits the archive budget;
 * the rest are listed by name. Formulas are not evaluated (cached values are
 * read), and external links are never opened.
 */
export async function prepareWorkbook(input: {
  data: Uint8Array;
  fileName: string;
  policy: ChatLargeFilePolicy;
}): Promise<PreparedWorkbook> {
  const data = Buffer.from(input.data.buffer, input.data.byteOffset, input.data.byteLength);
  try {
    const bounded = await openOfficeArchive(data, input.fileName, 'per-member');
    const allRefs = await sheetRefs(bounded, input.fileName);
    if (allRefs.length === 0) throw new PreparationRefusedError('unreadable');
    const refs = allRefs.slice(0, MAX_LISTED_SHEETS);
    const unlisted = allRefs.length - refs.length;
    const sharedStringsXml = (await officeArchiveEntryText(bounded, 'xl/sharedStrings.xml')) ?? '';
    const sharedStrings = [...xmlElements(sharedStringsXml, 'si')].map((element) =>
      textRuns(element.body),
    );

    const sheets: SheetProfile[] = [];
    const sections: string[] = [];
    const maxTextChars = input.policy.preparation.maxTextChars;
    let overBudget = false;
    let textChars = 0;
    for (const ref of refs) {
      if (textChars >= maxTextChars) overBudget = true;
      const xml = overBudget ? 'over' : await sheetXmlWithinBudget(bounded, ref.path);
      if (xml === 'over') {
        overBudget = true;
        sheets.push({ name: ref.name, profiled: false });
        continue;
      }
      if (xml === null) continue;
      const profiled = profileSheet(
        ref,
        xml,
        sharedStrings,
        input.policy.kinds.spreadsheet.sampleRows,
      );
      sheets.push(profiled.profile);
      sections.push(profiled.text);
      textChars += profiled.text.length;
    }
    const notProfiled = sheets.filter((sheet) => !sheet.profiled).map((sheet) => sheet.name);
    if (notProfiled.length > 0) {
      sections.push(
        `Sheets not profiled, because the workbook is larger than can be read here (the whole workbook is in the code sandbox): ${notProfiled.join(', ')}`,
      );
    }
    if (unlisted > 0) {
      sections.push(
        `${unlisted.toLocaleString('en-US')} more sheets are not listed here (the whole workbook is in the code sandbox).`,
      );
    }
    return {
      text: sections.join('\n\n'),
      sheets: boundedProfiles(sheets),
      sheetCount: sheets.length + unlisted,
      partial: overBudget || unlisted > 0,
    };
  } catch (error) {
    if (error instanceof PreparationRefusedError) throw error;
    if (error instanceof OfficeDocumentUnreadableError) {
      throw new PreparationRefusedError(error.reason === 'corrupt' ? 'unreadable' : error.reason);
    }
    if (error instanceof DecompressionLimitError) throw new PreparationRefusedError('archive_bomb');
    if (error instanceof RangeError) throw new PreparationRefusedError('unreadable');
    throw error;
  }
}
