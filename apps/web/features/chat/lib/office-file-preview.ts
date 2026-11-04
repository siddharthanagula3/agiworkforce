import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import {
  officeMemberText,
  openOfficeArchive,
  readOfficeMember,
  type OfficeArchive,
} from './office-archive';

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;
const MAX_SLIDE_IMAGE_BYTES = 450_000;
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};
const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const DEFAULT_SHEET_PATH = 'xl/worksheets/sheet1.xml';
const WORKBOOK_PATH = 'xl/workbook.xml';
const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels';
const MAX_SHEETS = 50;
const MAX_CACHED_WORKBOOKS = 16;

function parseXml(source: string): Document {
  return new DOMParser().parseFromString(source, 'application/xml');
}

function elementsByLocalName(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', name));
}

function paragraphText(paragraph: Element): string {
  return elementsByLocalName(paragraph, 't')
    .map((node) => node.textContent ?? '')
    .join('')
    .trim();
}

function markdownCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function tableMarkdown(table: Element): string {
  const rows = elementsByLocalName(table, 'tr').map((row) =>
    elementsByLocalName(row, 'tc').map((cell) =>
      markdownCell(elementsByLocalName(cell, 'p').map(paragraphText).filter(Boolean).join(' ')),
    ),
  );
  const width = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || width === 0) return '';
  const line = (row: string[]) =>
    `| ${Array.from({ length: width }, (_, index) => row[index] ?? '').join(' | ')} |`;
  return [
    line(rows[0]!),
    `| ${Array(width).fill('---').join(' | ')} |`,
    ...rows.slice(1).map(line),
  ].join('\n');
}

function resolveTarget(slidePath: string, target: string): string {
  const parts = slidePath.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

async function slideImages(
  archive: OfficeArchive,
  slidePath: string,
  slide: Document,
): Promise<string[]> {
  const relsPath = slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels');
  const relsXml = await officeMemberText(archive, relsPath);
  if (!relsXml) return [];
  const targets = new Map(
    elementsByLocalName(parseXml(relsXml), 'Relationship').map((relation) => [
      relation.getAttribute('Id') ?? '',
      relation.getAttribute('Target') ?? '',
    ]),
  );
  const out: string[] = [];
  for (const picture of elementsByLocalName(slide, 'pic')) {
    const blip = elementsByLocalName(picture, 'blip')[0];
    const id =
      blip?.getAttributeNS(RELATIONSHIP_NS, 'embed') ?? blip?.getAttribute('r:embed') ?? '';
    const target = targets.get(id);
    if (!target) continue;
    const path = resolveTarget(slidePath, target);
    const type = IMAGE_TYPES[path.split('.').pop()?.toLowerCase() ?? ''];
    const file = archive.zip.file(path);
    if (!type || !file) continue;
    const bytes = await readOfficeMember(file, archive.budget, MAX_SLIDE_IMAGE_BYTES);
    if (bytes === null) continue;
    const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    const name = elementsByLocalName(picture, 'cNvPr')[0]?.getAttribute('descr')?.trim() || 'Image';
    out.push(`![${name.replace(/[[\]]/g, '')}](data:${type};base64,${base64})`);
  }
  return out;
}

export async function pptxToSlidesMarkdown(data: ArrayBuffer): Promise<string> {
  const archive = await openOfficeArchive(data);
  const { zip } = archive;
  const slides = Object.keys(zip.files)
    .map((path) => ({ path, match: SLIDE_PATH.exec(path) }))
    .filter((entry): entry is { path: string; match: RegExpExecArray } => entry.match !== null)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));

  const rendered: string[] = [];
  for (const slide of slides) {
    const xml = await officeMemberText(archive, slide.path);
    if (!xml) continue;
    const titles: string[] = [];
    const body: string[] = [];
    const footers: string[] = [];
    for (const shape of elementsByLocalName(parseXml(xml), 'sp')) {
      const placeholder = elementsByLocalName(shape, 'ph')[0]?.getAttribute('type') ?? null;
      const lines = elementsByLocalName(shape, 'p').map(paragraphText).filter(Boolean);
      if (placeholder === 'title' || placeholder === 'ctrTitle') titles.push(...lines);
      else if (placeholder === 'ftr') footers.push(...lines);
      else if (placeholder !== 'dt' && placeholder !== 'sldNum') body.push(...lines);
    }
    const document = parseXml(xml);
    const [firstBody, ...restBody] = body;
    const title = titles.length > 0 ? titles.join(' ') : firstBody;
    const bullets = titles.length > 0 ? body : restBody;
    const tables = elementsByLocalName(document, 'tbl').map(tableMarkdown).filter(Boolean);
    const images = await slideImages(archive, slide.path, document);
    rendered.push(
      [
        `# ${title ?? `Slide ${slide.match[1]}`}`,
        ...bullets.map((line) => `- ${line}`),
        ...footers.map((line) => `_${line}_`),
        ...tables.map((table) => `\n${table}`),
        ...images.map((image) => `\n${image}`),
      ].join('\n'),
    );
  }
  return rendered.join('\n\n---\n\n');
}

export const WORKBOOK_PREVIEW_TOO_LARGE =
  'Workbook preview is too large to display. Download the original XLSX file to view all sheets.';

export class WorkbookPreviewLimitError extends Error {
  constructor() {
    super(WORKBOOK_PREVIEW_TOO_LARGE);
    this.name = 'WorkbookPreviewLimitError';
  }
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

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export const XLSX_NOT_CALCULATED = 'not calculated';

export interface WorkbookSheet {
  name: string;
  csv: string;
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

function sheetCsv(sheetXml: string, shared: readonly string[], remaining: number): string {
  const rows: Map<number, readonly string[]>[] = [];
  let width = 0;
  for (const row of elementsByLocalName(parseXml(sheetXml), 'row')) {
    if (rows.length > remaining) throw new WorkbookPreviewLimitError();
    const cells = new Map<number, readonly string[]>();
    for (const cell of elementsByLocalName(row, 'c')) {
      const index = columnIndex(cell.getAttribute('r') ?? '', remaining);
      width = Math.max(width, index + 1);
      const type = cell.getAttribute('t');
      const cachedNode = elementsByLocalName(cell, 'v')[0];
      const raw = cachedNode?.textContent ?? '';
      const hasFormula = elementsByLocalName(cell, 'f').length > 0;
      const parts =
        hasFormula && (!cachedNode || raw === '')
          ? [XLSX_NOT_CALCULATED]
          : type === 's'
            ? [shared[Number(raw)] ?? '']
            : type === 'inlineStr'
              ? elementsByLocalName(cell, 't').map((node) => node.textContent ?? '')
              : [raw];
      cells.set(index, parts);
    }
    rows.push(cells);
  }
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

async function sheetEntries(archive: OfficeArchive): Promise<{ name: string; path: string }[]> {
  const workbookXml = await officeMemberText(archive, WORKBOOK_PATH);
  const relsXml = await officeMemberText(archive, WORKBOOK_RELS_PATH);
  if (!workbookXml || !relsXml) return [{ name: 'Sheet1', path: DEFAULT_SHEET_PATH }];
  const targets = new Map(
    elementsByLocalName(parseXml(relsXml), 'Relationship').map((relation) => [
      relation.getAttribute('Id') ?? '',
      relation.getAttribute('Target') ?? '',
    ]),
  );
  const entries: { name: string; path: string }[] = [];
  for (const sheet of elementsByLocalName(parseXml(workbookXml), 'sheet').slice(0, MAX_SHEETS)) {
    const id = sheet.getAttributeNS(RELATIONSHIP_NS, 'id') ?? sheet.getAttribute('r:id') ?? '';
    const target = targets.get(id);
    const name = sheet.getAttribute('name')?.trim();
    if (!target || !name) continue;
    entries.push({
      name,
      path: target.startsWith('/') ? target.slice(1) : resolveTarget(WORKBOOK_PATH, target),
    });
  }
  return entries;
}

export async function xlsxSheets(data: ArrayBuffer): Promise<WorkbookSheet[]> {
  const archive = await openOfficeArchive(data);
  const sharedXml = await officeMemberText(archive, 'xl/sharedStrings.xml');
  const shared = sharedXml
    ? elementsByLocalName(parseXml(sharedXml), 'si').map((item) =>
        elementsByLocalName(item, 't')
          .map((node) => node.textContent ?? '')
          .join(''),
      )
    : [];
  const sheets: WorkbookSheet[] = [];
  let remaining = MAX_FILE_TEXT_CHARS;
  for (const entry of await sheetEntries(archive)) {
    const sheetXml = await officeMemberText(archive, entry.path);
    if (sheetXml !== undefined) {
      const csv = sheetCsv(sheetXml, shared, remaining);
      remaining -= csv.length;
      sheets.push({ name: entry.name, csv });
    }
  }
  return sheets;
}

const workbookSheetsByUri = new Map<string, Promise<WorkbookSheet[]>>();

export function clearWorkbookSheetCache(): void {
  workbookSheetsByUri.clear();
}

export function loadWorkbookSheets(uri: string): Promise<WorkbookSheet[]> {
  const cached = workbookSheetsByUri.get(uri);
  if (cached) return cached;
  const pending = fetch(uri, { credentials: 'same-origin' })
    .then((response) =>
      response.ok ? response.arrayBuffer() : Promise.reject(new Error(`HTTP ${response.status}`)),
    )
    .then(xlsxSheets);
  workbookSheetsByUri.set(uri, pending);
  pending.catch(() => workbookSheetsByUri.delete(uri));
  if (workbookSheetsByUri.size > MAX_CACHED_WORKBOOKS) {
    const oldest = workbookSheetsByUri.keys().next().value;
    if (oldest !== undefined) workbookSheetsByUri.delete(oldest);
  }
  return pending;
}
