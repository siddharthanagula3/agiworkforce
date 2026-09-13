import 'server-only';

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Header,
  LevelFormat,
  LevelSuffix,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { jsPDF } from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import { z } from 'zod';

import { buildWorkbook, type WorkbookSheet } from './managed-workbook-builder';

import { MANAGED_OFFICE_FILE_TOOL_NAME } from '@agiworkforce/cloud-contracts';

export { MANAGED_OFFICE_FILE_TOOL_NAME };

export function isManagedOfficeFileTool(name: string): boolean {
  return name === MANAGED_OFFICE_FILE_TOOL_NAME;
}

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME_TYPE = 'application/pdf';
const CSV_MIME_TYPE = 'text/csv';

const FileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (name) =>
      name !== '.' &&
      name !== '..' &&
      !name.includes('/') &&
      !name.includes('\\') &&
      Array.from(name).every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint > 31 && codePoint !== 127;
      }),
  );

const SlideSchema = z.object({
  title: z.string().trim().min(1).max(200),
  bullets: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  speaker_notes: z.string().trim().max(5_000).optional(),
});

const CellSchema = z.union([z.string().max(2_000), z.number().finite()]);

const ChartSchema = z.object({
  type: z.enum(['bar', 'line', 'pie']),
  title: z.string().trim().min(1).max(200),
  category_column: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{1,3}$/),
  value_column: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{1,3}$/),
  first_row: z.number().int().min(1).max(100_000),
  last_row: z.number().int().min(1).max(100_000),
});

const SheetSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(31)
    .refine((name) => !/[\\/?*[\]:]/.test(name)),
  rows: z.array(z.array(CellSchema).max(200)).min(1).max(20_000),
  chart: ChartSchema.optional(),
});

const ManagedOfficeFileInputSchema = z.discriminatedUnion('format', [
  z.object({
    format: z.literal('docx'),
    filename: FileNameSchema,
    title: z.string().trim().min(1).max(200),
    content: z.string().min(1).max(100_000),
  }),
  z.object({
    format: z.literal('pptx'),
    filename: FileNameSchema,
    title: z.string().trim().min(1).max(200),
    slides: z.array(SlideSchema).min(1).max(40),
  }),
  z.object({
    format: z.literal('xlsx'),
    filename: FileNameSchema,
    title: z.string().trim().min(1).max(200),
    sheets: z.array(SheetSchema).min(1).max(20),
  }),
  z.object({
    format: z.literal('pdf'),
    filename: FileNameSchema,
    title: z.string().trim().min(1).max(200),
    content: z.string().min(1).max(100_000),
  }),
  z.object({
    format: z.literal('csv'),
    filename: FileNameSchema,
    title: z.string().trim().min(1).max(200),
    rows: z.array(z.array(CellSchema).max(200)).min(1).max(20_000),
  }),
]);

type ManagedOfficeFileInput = z.infer<typeof ManagedOfficeFileInputSchema>;

export type GeneratedManagedOfficeFile = {
  ok: true;
  data: Buffer;
  filename: string;
  mimeType:
    | typeof DOCX_MIME_TYPE
    | typeof PPTX_MIME_TYPE
    | typeof XLSX_MIME_TYPE
    | typeof PDF_MIME_TYPE
    | typeof CSV_MIME_TYPE;
};

export type ManagedOfficeFileGenerationFailure = {
  ok: false;
  code: 'invalid_office_file_request' | 'office_file_generation_failed';
  message: string;
};

export type ManagedOfficeFileGenerationResult =
  | GeneratedManagedOfficeFile
  | ManagedOfficeFileGenerationFailure;

export function createManagedOfficeFileToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: MANAGED_OFFICE_FILE_TOOL_NAME,
      description:
        'Create and attach a real document file: Word (.docx), PowerPoint (.pptx), Excel (.xlsx), PDF (.pdf) or CSV (.csv). Use this whenever the user asks for a file of one of those kinds, instead of printing the content in the reply. DOCX and PDF take markdown-like content, including pipe tables; PPTX takes an ordered slide outline; XLSX takes named sheets of rows where a cell beginning with = is a real formula, and a sheet may carry a chart; CSV takes rows.',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['docx', 'pptx', 'xlsx', 'pdf', 'csv'],
            description: 'The file format to create.',
          },
          filename: {
            type: 'string',
            maxLength: 120,
            description: 'Download name only, such as report.docx or quarterly.xlsx.',
          },
          title: {
            type: 'string',
            maxLength: 200,
            description: 'Document or presentation title.',
          },
          content: {
            type: 'string',
            maxLength: 100_000,
            description:
              'DOCX and PDF only: document content with optional # headings, - bullet lines, and | pipe | tables |.',
          },
          slides: {
            type: 'array',
            minItems: 1,
            maxItems: 40,
            description: 'PPTX only: ordered editable slides.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', maxLength: 200 },
                bullets: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 12,
                  items: { type: 'string', maxLength: 500 },
                },
                speaker_notes: { type: 'string', maxLength: 5_000 },
              },
              required: ['title', 'bullets'],
              additionalProperties: false,
            },
          },
          sheets: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            description: 'XLSX only: one entry per worksheet, in tab order.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', maxLength: 31, description: 'Worksheet tab name.' },
                rows: {
                  type: 'array',
                  minItems: 1,
                  description:
                    'Rows of cells from row 1. A string starting with = is written as a real formula, such as =SUM(B2:B5).',
                  items: {
                    type: 'array',
                    items: { type: ['string', 'number'] },
                  },
                },
                chart: {
                  type: 'object',
                  description: 'Optional chart drawn on this worksheet from its own cells.',
                  properties: {
                    type: { type: 'string', enum: ['bar', 'line', 'pie'] },
                    title: { type: 'string', maxLength: 200 },
                    category_column: {
                      type: 'string',
                      description: 'Column letter of the labels.',
                    },
                    value_column: { type: 'string', description: 'Column letter of the values.' },
                    first_row: { type: 'integer', description: 'First data row number.' },
                    last_row: { type: 'integer', description: 'Last data row number.' },
                  },
                  required: [
                    'type',
                    'title',
                    'category_column',
                    'value_column',
                    'first_row',
                    'last_row',
                  ],
                  additionalProperties: false,
                },
              },
              required: ['name', 'rows'],
              additionalProperties: false,
            },
          },
          rows: {
            type: 'array',
            minItems: 1,
            description: 'CSV only: rows of cells, the first row being the header.',
            items: { type: 'array', items: { type: ['string', 'number'] } },
          },
        },
        required: ['format', 'filename', 'title'],
        additionalProperties: false,
      },
    },
  };
}

function normalizeFilename(
  filename: string,
  format: ManagedOfficeFileInput['format'],
): string | null {
  const suffix = `.${format}`;
  const lower = filename.toLowerCase();
  if (lower.endsWith(suffix)) {
    return filename.length > suffix.length ? filename : null;
  }
  if (/\.[a-z0-9]{1,8}$/i.test(filename)) return null;
  return `${filename}${suffix}`;
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)]\([^\s)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]/g, '')
    .trim();
}

function isTableRow(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|') && line.length > 2;
}

function isTableDivider(line: string): boolean {
  return isTableRow(line) && /^\|[\s:|-]+\|$/.test(line);
}

function tableCells(line: string): string[] {
  return line
    .slice(1, -1)
    .split('|')
    .map((cell) => stripInlineMarkdown(cell));
}

const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' } as const;

function documentTable(rows: string[][]): Table {
  const columnCount = Math.max(...rows.map((row) => row.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: TABLE_BORDER,
      bottom: TABLE_BORDER,
      left: TABLE_BORDER,
      right: TABLE_BORDER,
      insideHorizontal: TABLE_BORDER,
      insideVertical: TABLE_BORDER,
    },
    rows: rows.map(
      (cells, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: Array.from({ length: columnCount }, (_, columnIndex) => {
            const text = cells[columnIndex] ?? '';
            return new TableCell({
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              ...(rowIndex === 0 ? { shading: { fill: 'EDF2F9' } } : {}),
              children: [
                new Paragraph({
                  spacing: { after: 0 },
                  children: [new TextRun({ text, bold: rowIndex === 0 })],
                }),
              ],
            });
          }),
        }),
    ),
  });
}

function documentParagraphs(title: string, content: string): (Paragraph | Table)[] {
  const paragraphs: (Paragraph | Table)[] = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
  ];

  const lines = content.split(/\r?\n/).map((line) => line.trim());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (isTableRow(line)) {
      const rows: string[][] = [];
      while (index < lines.length && isTableRow(lines[index] ?? '')) {
        const row = lines[index] ?? '';
        if (!isTableDivider(row)) rows.push(tableCells(row));
        index += 1;
      }
      index -= 1;
      if (rows.length > 0) {
        paragraphs.push(documentTable(rows));
        paragraphs.push(new Paragraph({ text: '', spacing: { after: 120 } }));
      }
      continue;
    }

    if (!line) {
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const levels = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
      ] as const;
      paragraphs.push(
        new Paragraph({
          text: stripInlineMarkdown(heading[2] ?? ''),
          heading: levels[(heading[1]?.length ?? 1) - 1],
        }),
      );
      continue;
    }

    const bullet = /^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/.exec(line);
    if (bullet) {
      paragraphs.push(
        new Paragraph({
          text: stripInlineMarkdown(bullet[1] ?? ''),
          numbering: { reference: 'standard-business-bullets', level: 0 },
        }),
      );
      continue;
    }

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: stripInlineMarkdown(line) })],
      }),
    );
  }

  return paragraphs;
}

async function generateDocx(input: Extract<ManagedOfficeFileInput, { format: 'docx' }>) {
  const document = new Document({
    creator: 'AGI',
    title: input.title,
    description: 'Created by AGI managed cloud',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: '000000' },
          paragraph: { spacing: { before: 0, after: 120, line: 264 } },
        },
        title: {
          run: { font: 'Calibri', size: 46, bold: true, color: '000000' },
          paragraph: { spacing: { before: 0, after: 80 }, alignment: AlignmentType.CENTER },
        },
        heading1: {
          run: { font: 'Calibri', size: 32, bold: true, color: '2E74B5' },
          paragraph: { spacing: { before: 320, after: 160 }, keepNext: true },
        },
        heading2: {
          run: { font: 'Calibri', size: 26, bold: true, color: '2E74B5' },
          paragraph: { spacing: { before: 240, after: 120 }, keepNext: true },
        },
        heading3: {
          run: { font: 'Calibri', size: 24, bold: true, color: '1F4D78' },
          paragraph: { spacing: { before: 160, after: 80 }, keepNext: true },
        },
        listParagraph: {
          run: { font: 'Calibri', size: 22, color: '000000' },
          paragraph: { spacing: { after: 160, line: 280 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'standard-business-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              suffix: LevelSuffix.TAB,
              style: {
                run: { font: 'Calibri', size: 22 },
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                  spacing: { after: 160, line: 280 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12_240, height: 15_840, orientation: PageOrientation.PORTRAIT },
            margin: {
              top: 1_440,
              right: 1_440,
              bottom: 1_440,
              left: 1_440,
              header: 708,
              footer: 708,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [new TextRun({ text: 'AGI', color: '777777', size: 18 })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    children: ['Page ', PageNumber.CURRENT],
                    color: '777777',
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
        },
        children: documentParagraphs(input.title, input.content),
      },
    ],
  });
  return Packer.toBuffer(document);
}

async function generatePptx(input: Extract<ManagedOfficeFileInput, { format: 'pptx' }>) {
  const presentation = new PptxGenJS();
  presentation.layout = 'LAYOUT_WIDE';
  presentation.author = 'AGI';
  presentation.company = 'AGI Workforce';
  presentation.subject = input.title;
  presentation.title = input.title;
  presentation.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  };

  for (const [index, source] of input.slides.entries()) {
    const slide = presentation.addSlide();
    slide.background = { color: index % 2 === 0 ? 'F7F8FC' : 'F2F5F9' };
    slide.addShape(presentation.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.18,
      h: 7.5,
      line: { color: '5B5BD6', transparency: 100 },
      fill: { color: '5B5BD6' },
    });
    slide.addText(source.title, {
      x: 0.65,
      y: 1.05,
      w: 11.8,
      h: 1.15,
      fontFace: 'Aptos Display',
      fontSize: 30,
      bold: true,
      color: '16181D',
      margin: 0,
      breakLine: false,
      fit: 'shrink',
      valign: 'middle',
    });
    slide.addText('AGI', {
      x: 0.65,
      y: 0.5,
      w: 1.2,
      h: 0.3,
      fontFace: 'Aptos',
      fontSize: 11,
      bold: true,
      color: '5B5BD6',
      charSpacing: 2,
      margin: 0,
    });
    slide.addShape(presentation.ShapeType.line, {
      x: 0.65,
      y: 2.35,
      w: 1.15,
      h: 0,
      line: { color: '5B5BD6', width: 3 },
    });
    slide.addText(
      source.bullets.map((text, bulletIndex) => ({
        text,
        options: {
          bullet: { indent: 24 },
          breakLine: bulletIndex < source.bullets.length - 1,
          paraSpaceAfterPt: 16,
        },
      })),
      {
        x: 0.9,
        y: 2.75,
        w: 11.15,
        h: 3.75,
        fontFace: 'Aptos',
        fontSize: 21,
        color: '343842',
        margin: 0.08,
        breakLine: false,
        fit: 'shrink',
        valign: 'top',
      },
    );
    slide.addText(`${index + 1} / ${input.slides.length}`, {
      x: 11.45,
      y: 6.95,
      w: 1.15,
      h: 0.25,
      fontFace: 'Aptos',
      fontSize: 9,
      color: '777C87',
      align: 'right',
      margin: 0,
    });
    if (source.speaker_notes) slide.addNotes(source.speaker_notes);
  }

  const output = await presentation.write({ outputType: 'uint8array', compression: true });
  if (!(output instanceof Uint8Array)) throw new Error('Unexpected presentation output type');
  return Buffer.from(output);
}

function csvField(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function generateCsv(rows: (string | number)[][]): Buffer {
  return Buffer.from(`${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`, 'utf8');
}

function generateXlsx(input: Extract<ManagedOfficeFileInput, { format: 'xlsx' }>): Promise<Buffer> {
  const sheets: WorkbookSheet[] = input.sheets.map((sheet) => ({
    name: sheet.name,
    rows: sheet.rows,
    ...(sheet.chart
      ? {
          chart: {
            type: sheet.chart.type,
            title: sheet.chart.title,
            categoryColumn: sheet.chart.category_column.toUpperCase(),
            valueColumn: sheet.chart.value_column.toUpperCase(),
            firstRow: Math.min(sheet.chart.first_row, sheet.chart.last_row),
            lastRow: Math.max(sheet.chart.first_row, sheet.chart.last_row),
          },
        }
      : {}),
  }));
  return buildWorkbook(sheets);
}

const PDF_MARGIN_MM = 20;
const PDF_LINE_MM = 6;
const PDF_PAGE_HEIGHT_MM = 297;

function generatePdf(input: Extract<ManagedOfficeFileInput, { format: 'pdf' }>): Buffer {
  const document = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = document.internal.pageSize.getWidth() - PDF_MARGIN_MM * 2;
  let cursor = PDF_MARGIN_MM + 4;

  const write = (text: string, size: number, bold: boolean): void => {
    document.setFont('helvetica', bold ? 'bold' : 'normal');
    document.setFontSize(size);
    for (const line of document.splitTextToSize(text, width) as string[]) {
      if (cursor > PDF_PAGE_HEIGHT_MM - PDF_MARGIN_MM) {
        document.addPage();
        cursor = PDF_MARGIN_MM;
      }
      document.text(line, PDF_MARGIN_MM, cursor);
      cursor += size >= 18 ? PDF_LINE_MM + 4 : PDF_LINE_MM;
    }
  };

  write(input.title, 20, true);
  cursor += 2;

  for (const rawLine of input.content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      cursor += PDF_LINE_MM / 2;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      cursor += 2;
      write(stripInlineMarkdown(heading[2] ?? ''), 15 - (heading[1]?.length ?? 1), true);
      continue;
    }
    const bullet = /^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/.exec(line);
    if (bullet) {
      write(`\u2022 ${stripInlineMarkdown(bullet[1] ?? '')}`, 11, false);
      continue;
    }
    if (isTableRow(line)) {
      if (isTableDivider(line)) continue;
      write(tableCells(line).join('   |   '), 11, false);
      continue;
    }
    write(stripInlineMarkdown(line), 11, false);
  }

  return Buffer.from(document.output('arraybuffer'));
}

export async function generateManagedOfficeFile(
  value: unknown,
): Promise<ManagedOfficeFileGenerationResult> {
  const parsed = ManagedOfficeFileInputSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_office_file_request',
      message: 'The Office file request is invalid.',
    };
  }

  const filename = normalizeFilename(parsed.data.filename, parsed.data.format);
  if (!filename) {
    return {
      ok: false,
      code: 'invalid_office_file_request',
      message: 'The Office file request is invalid.',
    };
  }

  try {
    switch (parsed.data.format) {
      case 'docx':
        return {
          ok: true,
          data: await generateDocx(parsed.data),
          filename,
          mimeType: DOCX_MIME_TYPE,
        };
      case 'pptx':
        return {
          ok: true,
          data: await generatePptx(parsed.data),
          filename,
          mimeType: PPTX_MIME_TYPE,
        };
      case 'xlsx':
        return {
          ok: true,
          data: await generateXlsx(parsed.data),
          filename,
          mimeType: XLSX_MIME_TYPE,
        };
      case 'pdf':
        return {
          ok: true,
          data: generatePdf(parsed.data),
          filename,
          mimeType: PDF_MIME_TYPE,
        };
      case 'csv':
        return {
          ok: true,
          data: generateCsv(parsed.data.rows),
          filename,
          mimeType: CSV_MIME_TYPE,
        };
    }
  } catch {
    return {
      ok: false,
      code: 'office_file_generation_failed',
      message: 'The file could not be created.',
    };
  }
}
