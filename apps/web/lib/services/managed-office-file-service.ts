import 'server-only';

import {
  AlignmentType,
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
  TextRun,
} from 'docx';
import PptxGenJS from 'pptxgenjs';
import { z } from 'zod';

export const MANAGED_OFFICE_FILE_TOOL_NAME = 'create_office_file';

export function isManagedOfficeFileTool(name: string): boolean {
  return name === MANAGED_OFFICE_FILE_TOOL_NAME;
}

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

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
]);

type ManagedOfficeFileInput = z.infer<typeof ManagedOfficeFileInputSchema>;

export type GeneratedManagedOfficeFile = {
  ok: true;
  data: Buffer;
  filename: string;
  mimeType: typeof DOCX_MIME_TYPE | typeof PPTX_MIME_TYPE;
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
        'Create and attach an editable Microsoft Word (.docx) document or PowerPoint (.pptx) presentation. Use this when the user asks for an Office file. For DOCX provide markdown-like content; for PPTX provide an ordered slide outline.',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['docx', 'pptx'],
            description: 'The Office file format to create.',
          },
          filename: {
            type: 'string',
            maxLength: 120,
            description: 'Download name only, such as report.docx or launch-plan.pptx.',
          },
          title: {
            type: 'string',
            maxLength: 200,
            description: 'Document or presentation title.',
          },
          content: {
            type: 'string',
            maxLength: 100_000,
            description: 'DOCX only: document content with optional # headings and - bullet lines.',
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

function documentParagraphs(title: string, content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
  ];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
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
    if (parsed.data.format === 'docx') {
      return {
        ok: true,
        data: await generateDocx(parsed.data),
        filename,
        mimeType: DOCX_MIME_TYPE,
      };
    }
    return {
      ok: true,
      data: await generatePptx(parsed.data),
      filename,
      mimeType: PPTX_MIME_TYPE,
    };
  } catch {
    return {
      ok: false,
      code: 'office_file_generation_failed',
      message: 'The Office file could not be created.',
    };
  }
}
