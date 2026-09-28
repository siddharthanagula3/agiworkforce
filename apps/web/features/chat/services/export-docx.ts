import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Math as DocxMath,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ILevelsOptions,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import {
  RIGHT_TO_LEFT_TEXT,
  documentDirection,
  type DocumentAlign,
  type DocumentBlock,
  type DocumentDirection,
  type DocumentInline,
  type DocumentListItem,
  type DocumentTableRow,
} from '@agiworkforce/unified-chat/markdown-document';
import { texToDocxMath } from './export-math';

export interface DocxHeader {
  readonly title?: string;
  readonly author?: string;
  readonly date: string;
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;
const CODE_FONT = 'Courier New';
const CODE_SIZE = 18;
const CODE_FILL = 'F5F5F7';
const INLINE_CODE_FILL = 'ECECF0';
const TABLE_HEADER_FILL = 'F2F2F5';
const LINK_COLOR = '0563C1';
const MUTED_COLOR = '5C5C64';
const RULE_COLOR = 'C8C8CE';
const QUOTE_BAR_COLOR = 'CECED4';
const INDENT_STEP = 720;
const HANGING_INDENT = 360;
const QUOTE_INDENT = 360;
const PARAGRAPH_AFTER = 120;
const LIST_LEVELS = 9;
const CONTENT_WIDTH_TWIPS = 9026;
const MIN_COLUMN_SHARE = 0.08;
const CHECKED_BOX = '☒ ';
const UNCHECKED_BOX = '☐ ';

const ALIGNMENTS: Readonly<
  Record<Exclude<DocumentAlign, null> | 'start', (typeof AlignmentType)[keyof typeof AlignmentType]>
> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  start: AlignmentType.START,
};

interface DocxContext {
  readonly quoteDepth: number;
  readonly listLevel: number;
  readonly direction: DocumentDirection;
  readonly color?: string;
}

function directionOptions(direction: DocumentDirection): Partial<IParagraphOptions> {
  return direction === 'rtl' ? { bidirectional: true } : {};
}

interface RunMarks {
  readonly bold?: boolean;
  readonly color?: string;
}

class OrderedListNumbering {
  private readonly configs = new Map<string, ILevelsOptions[]>();
  private instances = 0;

  begin(level: number, start: number): { reference: string; instance: number } {
    const reference = `ordered-${level}-${start}`;
    if (!this.configs.has(reference)) {
      this.configs.set(
        reference,
        Array.from({ length: LIST_LEVELS }, (_, index) => ({
          level: index,
          format: LevelFormat.DECIMAL,
          text: `%${index + 1}.`,
          alignment: AlignmentType.START,
          start: index === level ? start : 1,
          style: {
            paragraph: { indent: { left: INDENT_STEP * (index + 1), hanging: HANGING_INDENT } },
          },
        })),
      );
    }
    this.instances += 1;
    return { reference, instance: this.instances };
  }

  config(): { reference: string; levels: ILevelsOptions[] }[] {
    return [...this.configs].map(([reference, levels]) => ({ reference, levels }));
  }
}

function textRuns(text: string, options: IRunOptions): TextRun[] {
  return text.split('\n').map(
    (part, index) =>
      new TextRun({
        ...options,
        ...(RIGHT_TO_LEFT_TEXT.test(part) ? { rightToLeft: true } : {}),
        text: part,
        ...(index > 0 ? { break: 1 } : {}),
      }),
  );
}

function inlineChildren(inlines: readonly DocumentInline[], marks: RunMarks): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  for (const inline of inlines) {
    if (inline.kind === 'break') {
      children.push(new TextRun({ break: 1 }));
      continue;
    }
    if (inline.kind === 'math') {
      const [line = []] = texToDocxMath(inline.tex, false);
      children.push(new DocxMath({ children: line }));
      continue;
    }
    const { marks: inlineMarks } = inline;
    const runs = textRuns(inline.text, {
      bold: Boolean(marks.bold || inlineMarks.bold),
      italics: Boolean(inlineMarks.italic),
      strike: Boolean(inlineMarks.strike),
      ...(inlineMarks.code
        ? {
            font: CODE_FONT,
            shading: { type: ShadingType.CLEAR, fill: INLINE_CODE_FILL, color: 'auto' },
          }
        : {}),
      ...(inlineMarks.href
        ? { color: LINK_COLOR, underline: {} }
        : marks.color
          ? { color: marks.color }
          : {}),
    });
    children.push(
      ...(inlineMarks.href
        ? [new ExternalHyperlink({ link: inlineMarks.href, children: runs })]
        : runs),
    );
  }
  return children;
}

function quoteOptions(context: DocxContext): Partial<IParagraphOptions> {
  if (context.quoteDepth === 0) return {};
  return {
    indent: { left: QUOTE_INDENT * context.quoteDepth + INDENT_STEP * context.listLevel },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: QUOTE_BAR_COLOR, space: 8 } },
  };
}

function bodyIndent(context: DocxContext): Partial<IParagraphOptions> {
  if (context.quoteDepth > 0) return quoteOptions(context);
  return context.listLevel > 0 ? { indent: { left: INDENT_STEP * context.listLevel } } : {};
}

function columnWidths(rows: readonly DocumentTableRow[], columnCount: number): number[] {
  const lengths = Array.from({ length: columnCount }, (_, column) =>
    Math.max(
      1,
      ...rows.map((row) =>
        (row[column] ?? []).reduce(
          (sum, inline) =>
            sum +
            (inline.kind === 'text'
              ? inline.text.length
              : inline.kind === 'math'
                ? inline.tex.length
                : 0),
          0,
        ),
      ),
    ),
  );
  const shares = lengths.map((length) => Math.max(length, 1));
  const total = shares.reduce((sum, share) => sum + share, 0);
  const floored = shares.map((share) => Math.max(share / total, MIN_COLUMN_SHARE));
  const flooredTotal = floored.reduce((sum, share) => sum + share, 0);
  return floored.map((share) => Math.round((share / flooredTotal) * CONTENT_WIDTH_TWIPS));
}

class DocxBuilder {
  readonly numbering = new OrderedListNumbering();

  blocks(blocks: readonly DocumentBlock[], context: DocxContext): (Paragraph | Table)[] {
    return blocks.flatMap((block) => this.block(block, context));
  }

  private block(block: DocumentBlock, context: DocxContext): (Paragraph | Table)[] {
    switch (block.kind) {
      case 'heading':
        return [
          new Paragraph({
            heading: HEADING_LEVELS[Math.min(Math.max(block.level, 1), HEADING_LEVELS.length) - 1],
            children: inlineChildren(block.inlines, {}),
            ...directionOptions(context.direction),
            ...bodyIndent(context),
          }),
        ];
      case 'paragraph':
        return [
          new Paragraph({
            children: inlineChildren(block.inlines, { color: context.color }),
            spacing: { after: PARAGRAPH_AFTER },
            ...directionOptions(context.direction),
            ...bodyIndent(context),
          }),
        ];
      case 'list':
        return this.list(block.ordered, block.start, block.items, context);
      case 'code':
        return this.code(block.text, context);
      case 'quote':
        return this.blocks(block.blocks, {
          ...context,
          quoteDepth: context.quoteDepth + 1,
          color: MUTED_COLOR,
        });
      case 'table':
        return [this.table(block.align, block.rows, context.direction)];
      case 'math':
        return texToDocxMath(block.tex, true).map(
          (line) =>
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: PARAGRAPH_AFTER },
              children: [new DocxMath({ children: line })],
            }),
        );
      case 'rule':
        return [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_COLOR, space: 1 } },
            spacing: { after: PARAGRAPH_AFTER },
          }),
        ];
    }
  }

  private list(
    ordered: boolean,
    start: number,
    items: readonly DocumentListItem[],
    context: DocxContext,
  ): (Paragraph | Table)[] {
    const level = Math.min(context.listLevel, LIST_LEVELS - 1);
    const numbering = ordered ? this.numbering.begin(level, start) : null;
    const itemContext: DocxContext = { ...context, listLevel: context.listLevel + 1 };
    return items.flatMap((item) => {
      const [first, ...rest] = item.blocks;
      const lead: ParagraphChild[] = [
        ...(item.checked === null
          ? []
          : [new TextRun({ text: item.checked ? CHECKED_BOX : UNCHECKED_BOX })]),
        ...(first?.kind === 'paragraph'
          ? inlineChildren(first.inlines, { color: context.color })
          : []),
      ];
      const marker: Partial<IParagraphOptions> =
        item.checked !== null
          ? { indent: { left: INDENT_STEP * (level + 1), hanging: HANGING_INDENT } }
          : numbering
            ? { numbering: { reference: numbering.reference, level, instance: numbering.instance } }
            : { bullet: { level } };
      const markerParagraph = new Paragraph({
        children: lead,
        spacing: { after: PARAGRAPH_AFTER / 2 },
        ...directionOptions(context.direction),
        ...marker,
      });
      const remaining = first?.kind === 'paragraph' ? rest : item.blocks;
      return [markerParagraph, ...this.blocks(remaining, itemContext)];
    });
  }

  private code(text: string, context: DocxContext): Paragraph[] {
    const lines = text.replace(/\t/g, '    ').split('\n');
    return lines.map(
      (line, index) =>
        new Paragraph({
          children: [new TextRun({ text: line || ' ', font: CODE_FONT, size: CODE_SIZE })],
          shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' },
          spacing: { before: 0, after: index === lines.length - 1 ? PARAGRAPH_AFTER : 0 },
          ...bodyIndent(context),
        }),
    );
  }

  private table(
    align: readonly DocumentAlign[],
    rows: readonly DocumentTableRow[],
    direction: DocumentDirection,
  ): Table {
    const columnCount = Math.max(1, ...rows.map((row) => row.length));
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      ...(direction === 'rtl' ? { visuallyRightToLeft: true } : {}),
      columnWidths: columnWidths(rows, columnCount),
      rows: rows.map(
        (row, rowIndex) =>
          new TableRow({
            tableHeader: rowIndex === 0,
            children: Array.from(
              { length: columnCount },
              (_, column) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      alignment: ALIGNMENTS[align[column] ?? 'start'],
                      children: inlineChildren(row[column] ?? [], { bold: rowIndex === 0 }),
                      ...directionOptions(direction),
                    }),
                  ],
                  ...(rowIndex === 0
                    ? {
                        shading: {
                          type: ShadingType.CLEAR,
                          fill: TABLE_HEADER_FILL,
                          color: 'auto',
                        },
                      }
                    : {}),
                }),
            ),
          }),
      ),
    });
  }
}

export function buildDocxDocument(blocks: readonly DocumentBlock[], header: DocxHeader): Document {
  const builder = new DocxBuilder();
  const direction = documentDirection(blocks, header.title);
  const headerParagraphs = [
    ...(header.title
      ? [
          new Paragraph({
            text: header.title,
            heading: HeadingLevel.TITLE,
            spacing: { after: 200 },
            ...directionOptions(direction),
          }),
        ]
      : []),
    new Paragraph({
      ...directionOptions(direction),
      children: [
        new TextRun({
          text: [header.author ? `By ${header.author}` : '', header.date]
            .filter(Boolean)
            .join('  ·  '),
          size: 20,
          color: MUTED_COLOR,
        }),
      ],
      spacing: { after: 400 },
    }),
  ];
  const body = builder.blocks(blocks, { quoteDepth: 0, listLevel: 0, direction });
  return new Document({
    creator: header.author || 'AGI',
    title: header.title || 'Document',
    description: 'Generated document from chat',
    numbering: { config: builder.numbering.config() },
    sections: [{ properties: {}, children: [...headerParagraphs, ...body] }],
  });
}
