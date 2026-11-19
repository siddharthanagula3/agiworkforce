import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import {
  WorkbookPreviewLimitError,
  XLSX_NOT_CALCULATED,
  readWorkbookSheets,
  type WorkbookSheet,
} from '@agiworkforce/unified-chat/tabular';
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

function parseXml(source: string): Document {
  return new DOMParser().parseFromString(source, 'application/xml');
}

function elementsByLocalName(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', name));
}

export const PRESENTATION_PREVIEW_TOO_LARGE =
  'Presentation preview is too large to display. Download the original PPTX file to view all slides.';

export class PresentationPreviewLimitError extends Error {
  constructor() {
    super(PRESENTATION_PREVIEW_TOO_LARGE);
    this.name = 'PresentationPreviewLimitError';
  }
}

class PresentationTextBudget {
  remaining = MAX_FILE_TEXT_CHARS;

  spend(length: number): void {
    if (length > this.remaining) throw new PresentationPreviewLimitError();
    this.remaining -= length;
  }
}

function* paragraphParts(paragraph: Element): Generator<string> {
  for (const node of paragraph.getElementsByTagNameNS('*', 't')) yield node.textContent ?? '';
}

function boundedText(
  parts: Iterable<string>,
  budget: PresentationTextBudget,
  tableCell = false,
): string {
  const chunks: string[] = [];
  let length = 0;
  let whitespace: string[] = [];
  let whitespaceLength = 0;
  for (const part of parts) {
    for (const character of part) {
      if (/\s/.test(character)) {
        if (length === 0) continue;
        if (tableCell) {
          whitespaceLength = 1;
          whitespace = [' '];
        } else {
          whitespaceLength += character.length;
          if (whitespaceLength <= budget.remaining - length) whitespace.push(character);
        }
        continue;
      }
      const escaped =
        tableCell && (character === '\\' || character === '|') ? `\\${character}` : character;
      if (whitespaceLength + escaped.length > budget.remaining - length) {
        throw new PresentationPreviewLimitError();
      }
      for (const space of whitespace) chunks.push(space);
      chunks.push(escaped);
      length += whitespaceLength + escaped.length;
      whitespace = [];
      whitespaceLength = 0;
    }
  }
  budget.spend(length);
  return chunks.join('');
}

function* cellParts(cell: Element): Generator<string> {
  for (const paragraph of cell.getElementsByTagNameNS('*', 'p')) {
    yield* paragraphParts(paragraph);
    yield ' ';
  }
}

function tableMarkdown(table: Element, budget: PresentationTextBudget): string {
  const rows = elementsByLocalName(table, 'tr');
  let width = 0;
  for (const row of rows) width = Math.max(width, row.getElementsByTagNameNS('*', 'tc').length);
  if (rows.length === 0 || width === 0) return '';
  const separatorLength = 6 * width + 1;
  budget.spend(separatorLength + 2);
  const rowFraming = 3 * width + 2;
  if (rowFraming > Math.floor(budget.remaining / rows.length)) {
    throw new PresentationPreviewLimitError();
  }
  budget.spend(rowFraming * rows.length);
  const cells = rows.map((row) =>
    elementsByLocalName(row, 'tc').map((cell) => boundedText(cellParts(cell), budget, true)),
  );
  const line = (row: string[]) =>
    `| ${Array.from({ length: width }, (_, index) => row[index] ?? '').join(' | ')} |`;
  return [
    line(cells[0]!),
    `| ${Array(width).fill('---').join(' | ')} |`,
    ...cells.slice(1).map(line),
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
  budget: PresentationTextBudget,
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
    const name = elementsByLocalName(picture, 'cNvPr')[0]?.getAttribute('descr')?.trim() || 'Image';
    const label = name.replace(/[[\]]/g, '');
    budget.spend(label.length + `![](data:${type};base64,)`.length + 2);
    const prefix = `![${label}](data:${type};base64,`;
    const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    out.push(`${prefix}${base64})`);
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
  const budget = new PresentationTextBudget();
  for (const slide of slides) {
    const xml = await officeMemberText(archive, slide.path);
    if (!xml) continue;
    budget.spend(2 + (rendered.length > 0 ? 7 : 0));
    const titles: string[] = [];
    const body: string[] = [];
    const footers: string[] = [];
    const document = parseXml(xml);
    for (const shape of elementsByLocalName(document, 'sp')) {
      const placeholder = elementsByLocalName(shape, 'ph')[0]?.getAttribute('type') ?? null;
      if (placeholder === 'dt' || placeholder === 'sldNum') continue;
      const target =
        placeholder === 'title' || placeholder === 'ctrTitle'
          ? titles
          : placeholder === 'ftr'
            ? footers
            : body;
      for (const paragraph of shape.getElementsByTagNameNS('*', 'p')) {
        const text = boundedText(paragraphParts(paragraph), budget);
        if (text) target.push(text);
      }
    }
    const [firstBody, ...restBody] = body;
    budget.spend(Math.max(0, titles.length - 1));
    const title = (titles.length > 0 ? titles.join(' ') : firstBody) ?? `Slide ${slide.match[1]}`;
    if (titles.length === 0 && firstBody === undefined) budget.spend(title.length);
    const bullets = titles.length > 0 ? body : restBody;
    budget.spend(3 * (bullets.length + footers.length));
    const tables = elementsByLocalName(document, 'tbl')
      .map((table) => tableMarkdown(table, budget))
      .filter(Boolean);
    const images = await slideImages(archive, slide.path, document, budget);
    rendered.push(
      [
        `# ${title}`,
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

export { WorkbookPreviewLimitError, XLSX_NOT_CALCULATED, type WorkbookSheet };

export function loadWorkbookSheets(uri: string): Promise<WorkbookSheet[]> {
  return fetch(uri, { credentials: 'same-origin', cache: 'no-store' })
    .then((response) =>
      response.ok ? response.arrayBuffer() : Promise.reject(new Error(`HTTP ${response.status}`)),
    )
    .then((data) => readWorkbookSheets(new Uint8Array(data)));
}
