import 'server-only';

import { XLSX_NOT_CALCULATED } from '@agiworkforce/unified-chat/tabular';
import { styleIndex } from '@agiworkforce/unified-chat/workbook-cell-formats';
import {
  displayCellNumber,
  type NumberFormat,
} from '@agiworkforce/unified-chat/workbook-number-formats';
import type { ChatLargeFilePolicy } from '@/lib/chat-attachment-policy';
import {
  declaredMemberSize,
  DecompressionLimitError,
  readArchiveMember,
} from '@/lib/security/archive-bounds';
import {
  cellStyleFormats,
  decodeXmlEntities,
  officeArchiveEntryText,
  openOfficeArchive,
  OfficeDocumentUnreadableError,
  xmlElements,
  xmlStartTags,
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
const FORMULA_ELEMENT = /<f[\s>/]/;
const UNCALCULATED_NOTE = `Formulas are not evaluated here: a formula cell with no stored result shows as "${XLSX_NOT_CALCULATED}".`;
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

interface WorkbookLayout {
  refs: SheetRef[];
  stylesPath: string;
  date1904: boolean;
}

interface CellStyles {
  formats: readonly (NumberFormat | null)[];
  date1904: boolean;
}

/**
 * `typed` is what the column type is inferred from: the stored number unless a
 * date format showed it, and nothing for a formula the file holds no result for.
 */
interface SheetCell {
  text: string;
  typed: string;
  uncalculated?: true;
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

function columnLetters(index: number): string {
  let letters = '';
  for (let rest = index; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

function csvField(value: string): string {
  const bounded = value.length > MAX_CELL_CHARS ? value.slice(0, MAX_CELL_CHARS) : value;
  return /[",\n\r]/.test(bounded) ? `"${bounded.replace(/"/g, '""')}"` : bounded;
}

function profileName(value: string): string {
  return boundedStorableText(value, MAX_COLUMN_NAME_BYTES);
}

async function workbookLayout(bounded: BoundedZip, fileName: string): Promise<WorkbookLayout> {
  const workbook = await officeArchiveEntryText(bounded, 'xl/workbook.xml');
  if (!workbook) throw new OfficeDocumentUnreadableError(fileName);
  const relationships = (await officeArchiveEntryText(bounded, 'xl/_rels/workbook.xml.rels')) ?? '';
  const targets = new Map<string, string>();
  let stylesTarget: string | undefined;
  for (const { attributes } of xmlStartTags(relationships, 'Relationship')) {
    const id = /Id="([^"]+)"/.exec(attributes)?.[1];
    const target = /Target="([^"]+)"/.exec(attributes)?.[1]?.replace(/^\/?xl\//, '');
    if (id && target) targets.set(id, target);
    if (target && /Type="([^"]*)"/.exec(attributes)?.[1]?.endsWith('/styles')) {
      stylesTarget ??= target;
    }
  }
  const properties = xmlStartTags(workbook, 'workbookPr').next();
  const date1904 = properties.done
    ? undefined
    : /date1904="([^"]*)"/.exec(properties.value.attributes)?.[1]?.trim();
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
  return {
    refs,
    stylesPath: `xl/${stylesTarget ?? 'styles.xml'}`,
    date1904: date1904 === '1' || date1904 === 'true',
  };
}

async function partXmlWithinBudget(
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

async function cellStyles(bounded: BoundedZip, layout: WorkbookLayout): Promise<CellStyles> {
  try {
    const xml = await partXmlWithinBudget(bounded, layout.stylesPath);
    return {
      formats: typeof xml === 'string' ? cellStyleFormats(xml) : [],
      date1904: layout.date1904,
    };
  } catch {
    return { formats: [], date1904: layout.date1904 };
  }
}

function storedValue(body: string): string {
  const start = body.indexOf('<v>');
  if (start !== -1) {
    const end = body.indexOf('</v>', start + 3);
    return end === -1 ? '' : body.slice(start + 3, end);
  }
  if (!body.includes('<v')) return '';
  const element = xmlElements(body, 'v').next();
  return element.done ? '' : element.value.body;
}

/**
 * A formula typed `str` with an empty value was calculated and gave an empty
 * string, so it stays an empty cell; only a formula the file holds no result
 * for is marked.
 */
function isUncalculatedFormula(type: string, raw: string, body: string): boolean {
  if (raw !== '' || type === 'str' || !FORMULA_ELEMENT.test(body)) return false;
  return type !== 'inlineStr' || textRuns(body) === '';
}

function cellValue(
  attributes: string,
  body: string,
  sharedStrings: readonly string[],
  styles: CellStyles,
): SheetCell {
  const type = /t="([^"]+)"/.exec(attributes)?.[1] ?? 'n';
  const raw = storedValue(body);
  if (isUncalculatedFormula(type, raw, body)) {
    return { text: XLSX_NOT_CALCULATED, typed: '', uncalculated: true };
  }
  let text: string;
  if (type === 's') text = raw === '' ? '' : (sharedStrings[Number(raw)] ?? '');
  else if (type === 'inlineStr') text = textRuns(body);
  else if (type === 'b') text = raw === '1' ? 'true' : raw === '0' ? 'false' : raw;
  else text = decodeXmlEntities(raw);
  if (type !== 'n' || !text) return { text, typed: text };
  const style = styleIndex(/\ss="([^"]*)"/.exec(attributes)?.[1] ?? '0');
  const format = styles.formats[style] ?? null;
  const shown = displayCellNumber(text, format, styles.date1904);
  return { text: shown, typed: format?.kind === 'date' && shown !== text ? shown : text };
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
  styles: CellStyles,
  sampleRows: number,
): { profile: SheetProfile; text: string } {
  const rows: Map<string, SheetCell>[] = [];
  let rowCount = 0;
  let uncalculated = false;
  for (const row of xmlElements(xml, 'row')) {
    const cells = new Map<string, SheetCell>();
    let position = 0;
    for (const cell of xmlElements(row.body, 'c')) {
      const declared = /\sr="([A-Z]{1,3})\d+"/.exec(cell.attributes)?.[1];
      position = declared === undefined ? position + 1 : columnIndex(declared);
      const value = cellValue(cell.attributes, cell.body, sharedStrings, styles);
      if (value.text) cells.set(columnLetters(position), value);
      if (value.uncalculated) uncalculated = true;
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
    for (const column of columns) {
      counts.get(column)![valueType(row.get(column)?.typed ?? '')] += 1;
    }
  }
  const profileColumns = columns.map((column) => ({
    name: profileName(header?.get(column)?.text ?? column),
    type: columnType(counts.get(column) ?? emptyCounts()),
  }));
  const dimension = sheetDimension(xml);
  const dataRowCount = Math.max(rowCount - 1, 0);
  const csv = (row: Map<string, SheetCell>) =>
    columns.map((column) => csvField(row.get(column)?.text ?? '')).join(',');
  const shown = dataRows.slice(0, sampleRows);
  const lines = [
    `## Sheet: ${ref.name}${dimension ? ` (${dimension})` : ''}`,
    `${dataRowCount.toLocaleString('en-US')} rows after the header, ${columns.length} columns.`,
    ...profileColumns.map((column) => `- ${column.name}: ${column.type}`),
    ...(uncalculated ? [UNCALCULATED_NOTE] : []),
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
 * read), and external links are never opened. The styles part shares that
 * budget, so it is read only once the first sheet is in hand and cannot crowd it out.
 */
export async function prepareWorkbook(input: {
  data: Uint8Array;
  fileName: string;
  policy: ChatLargeFilePolicy;
}): Promise<PreparedWorkbook> {
  const data = Buffer.from(input.data.buffer, input.data.byteOffset, input.data.byteLength);
  try {
    const bounded = await openOfficeArchive(data, input.fileName, 'per-member');
    const layout = await workbookLayout(bounded, input.fileName);
    const allRefs = layout.refs;
    if (allRefs.length === 0) throw new PreparationRefusedError('unreadable');
    const refs = allRefs.slice(0, MAX_LISTED_SHEETS);
    const unlisted = allRefs.length - refs.length;
    const sharedStringsXml = (await officeArchiveEntryText(bounded, 'xl/sharedStrings.xml')) ?? '';
    const sharedStrings = [...xmlElements(sharedStringsXml, 'si')].map((element) =>
      textRuns(element.body),
    );
    let styles: CellStyles | undefined;

    const sheets: SheetProfile[] = [];
    const sections: string[] = [];
    const maxTextChars = input.policy.preparation.maxTextChars;
    let overBudget = false;
    let textChars = 0;
    for (const ref of refs) {
      if (textChars >= maxTextChars) overBudget = true;
      const xml = overBudget ? 'over' : await partXmlWithinBudget(bounded, ref.path);
      if (xml === 'over') {
        overBudget = true;
        sheets.push({ name: ref.name, profiled: false });
        continue;
      }
      if (xml === null) continue;
      styles ??= await cellStyles(bounded, layout);
      const profiled = profileSheet(
        ref,
        xml,
        sharedStrings,
        styles,
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
