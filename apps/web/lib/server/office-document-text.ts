import 'server-only';

import JSZip from 'jszip';
import mammoth from 'mammoth';

export const MAX_OFFICE_TEXT_CHARS = 200_000;

const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_SHEET_ROWS = 5_000;
const MAX_SLIDES = 200;

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export const OFFICE_DOCUMENT_MIME_TYPES = [DOCX_MIME_TYPE, XLSX_MIME_TYPE, PPTX_MIME_TYPE] as const;

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

export class OfficeDocumentUnreadableError extends Error {
  constructor(readonly filename: string) {
    super(`${filename} could not be read as an Office document.`);
    this.name = 'OfficeDocumentUnreadableError';
  }
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
  if (normalized.length <= MAX_OFFICE_TEXT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_OFFICE_TEXT_CHARS)}\n\n[Content truncated during extraction.]`;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function htmlToText(html: string): string {
  const lines: string[] = [];
  let cursor = 0;
  const blockPattern =
    /<(h[1-6]|p|li|tr)\b[^>]*>([\s\S]*?)<\/\1>|<table\b[^>]*>|<\/table>|<br\s*\/?>/gi;

  const cellText = (row: string): string =>
    [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => decodeXmlEntities((cell[1] ?? '').replace(/<[^>]+>/g, ' ')).trim())
      .join(' | ');

  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(html)) !== null) {
    cursor = blockPattern.lastIndex;
    const tag = match[1]?.toLowerCase();
    const inner = match[2] ?? '';
    if (!tag) continue;
    if (tag === 'tr') {
      const row = cellText(match[0]);
      if (row) lines.push(`| ${row} |`);
      continue;
    }
    const text = decodeXmlEntities(inner.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    if (tag.startsWith('h')) {
      lines.push(`${'#'.repeat(Number(tag.slice(1)))} ${text}`);
      continue;
    }
    lines.push(tag === 'li' ? `- ${text}` : text);
  }
  if (cursor === 0) {
    const text = decodeXmlEntities(html.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

async function readZip(data: Buffer, filename: string): Promise<JSZip> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new OfficeDocumentUnreadableError(filename);
  }
  let uncompressed = 0;
  zip.forEach((_, entry) => {
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize;
    if (typeof size === 'number') uncompressed += size;
  });
  if (uncompressed > MAX_UNCOMPRESSED_BYTES) throw new OfficeDocumentUnreadableError(filename);
  return zip;
}

async function entryText(zip: JSZip, path: string): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  return entry.async('string');
}

function xmlTextRuns(xml: string, tag: string): string {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))]
    .map((match) => decodeXmlEntities(match[1] ?? ''))
    .join('');
}

async function extractDocx(data: Buffer, filename: string): Promise<string> {
  await readZip(data, filename);
  try {
    const result = await mammoth.convertToHtml({ buffer: data });
    return htmlToText(result.value);
  } catch {
    throw new OfficeDocumentUnreadableError(filename);
  }
}

function columnLabel(reference: string): string {
  return reference.replace(/\d+/g, '');
}

function rowNumber(reference: string): number {
  const digits = /\d+/.exec(reference);
  return digits ? Number(digits[0]) : 0;
}

async function extractXlsx(data: Buffer, filename: string): Promise<string> {
  const zip = await readZip(data, filename);
  const workbook = await entryText(zip, 'xl/workbook.xml');
  if (!workbook) throw new OfficeDocumentUnreadableError(filename);

  const relationships = (await entryText(zip, 'xl/_rels/workbook.xml.rels')) ?? '';
  const targetByRelationshipId = new Map<string, string>();
  for (const match of relationships.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(match[0])?.[1];
    const target = /Target="([^"]+)"/.exec(match[0])?.[1];
    if (id && target) targetByRelationshipId.set(id, target.replace(/^\/?xl\//, ''));
  }

  const sharedStringsXml = (await entryText(zip, 'xl/sharedStrings.xml')) ?? '';
  const sharedStrings = [...sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    xmlTextRuns(match[1] ?? '', 't'),
  );

  const sections: string[] = [];
  let sheetIndex = 0;
  for (const sheetMatch of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    sheetIndex += 1;
    const name = decodeXmlEntities(
      /name="([^"]*)"/.exec(sheetMatch[0])?.[1] ?? `Sheet${sheetIndex}`,
    );
    const relationshipId = /r:id="([^"]+)"/.exec(sheetMatch[0])?.[1];
    const target = relationshipId ? targetByRelationshipId.get(relationshipId) : undefined;
    const sheetXml =
      (target ? await entryText(zip, `xl/${target}`) : null) ??
      (await entryText(zip, `xl/worksheets/sheet${sheetIndex}.xml`));
    if (!sheetXml) continue;

    const rows: string[] = [];
    for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= MAX_SHEET_ROWS) {
        rows.push('[Remaining rows omitted.]');
        break;
      }
      const cells: string[] = [];
      for (const cellMatch of (rowMatch[1] ?? '').matchAll(
        /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const attributes = cellMatch[1] ?? '';
        const body = cellMatch[2] ?? '';
        const reference = /r="([A-Z]+\d+)"/.exec(attributes)?.[1] ?? '';
        const type = /t="([^"]+)"/.exec(attributes)?.[1] ?? 'n';
        const formula = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1];
        const rawValue = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
        let value: string;
        if (type === 's') {
          value = sharedStrings[Number(rawValue)] ?? '';
        } else if (type === 'inlineStr') {
          value = xmlTextRuns(body, 't');
        } else {
          value = decodeXmlEntities(rawValue);
        }
        if (formula) {
          const rendered = decodeXmlEntities(formula);
          cells.push(`${columnLabel(reference)}: =${rendered}${value ? ` (${value})` : ''}`);
          continue;
        }
        if (value) cells.push(`${columnLabel(reference)}: ${value}`);
      }
      if (cells.length > 0) {
        const first = /<row\b[^>]*r="(\d+)"/.exec(rowMatch[0])?.[1] ?? String(rows.length + 1);
        rows.push(`Row ${first}: ${cells.join(' | ')}`);
      }
    }

    sections.push([`## Sheet: ${name}`, ...(rows.length ? rows : ['[empty sheet]'])].join('\n'));
  }

  if (sections.length === 0) throw new OfficeDocumentUnreadableError(filename);
  return sections.join('\n\n');
}

async function extractPptx(data: Buffer, filename: string): Promise<string> {
  const zip = await readZip(data, filename);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => rowNumber(a) - rowNumber(b))
    .slice(0, MAX_SLIDES);
  if (slidePaths.length === 0) throw new OfficeDocumentUnreadableError(filename);

  const sections: string[] = [];
  for (const [index, path] of slidePaths.entries()) {
    const slideXml = (await entryText(zip, path)) ?? '';
    const lines = [...slideXml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
      .map((match) =>
        xmlTextRuns(match[1] ?? '', 'a:t')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean);
    const slideNumber = rowNumber(path);
    const notesXml = (await entryText(zip, `ppt/notesSlides/notesSlide${slideNumber}.xml`)) ?? '';
    const notes = [...notesXml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
      .map((match) =>
        xmlTextRuns(match[1] ?? '', 'a:t')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((line) => line && line !== String(slideNumber));
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
  const text =
    kind === 'docx'
      ? await extractDocx(data, fileName)
      : kind === 'xlsx'
        ? await extractXlsx(data, fileName)
        : await extractPptx(data, fileName);
  return boundText(text);
}
