import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import { isSafeExportLink } from '@/services/exportMarkdownHtml';

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

const NUMBERED = 'numbered';
const CODE_FONT = 'Courier New';
const INLINE =
  /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|!?\[[^\]]*\]\([^)]*\))/g;

const INLINE_LINK = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^)]*")?\)$/;
const LINK_COLOR = '0563C1';

export function runs(text: string): ParagraphChild[] {
  return text
    .split(INLINE)
    .filter((part) => part.length > 0)
    .map((part) => {
      if (/^(\*\*|__).+(\*\*|__)$/.test(part))
        return new TextRun({ text: part.slice(2, -2), bold: true });
      if (/^`.+`$/.test(part)) return new TextRun({ text: part.slice(1, -1), font: CODE_FONT });
      const link = INLINE_LINK.exec(part);
      if (link && isSafeExportLink(link[2]!)) {
        return new ExternalHyperlink({
          link: link[2]!,
          children: [new TextRun({ text: link[1] || link[2]!, color: LINK_COLOR, underline: {} })],
        });
      }
      if (/^!?\[/.test(part))
        return new TextRun({ text: part.replace(/^!?\[([^\]]*)\].*$/, '$1') });
      if (/^[*_].+[*_]$/.test(part)) return new TextRun({ text: part.slice(1, -1), italics: true });
      return new TextRun({ text: part });
    });
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

const DELIMITER_CELL = /^:?-{3,}:?$/;

export function tableRows(lines: string[]): string[][] {
  const rows = lines.map(tableCells);
  const delimiter = rows[1];
  if (delimiter && delimiter.every((cell) => DELIMITER_CELL.test(cell))) rows.splice(1, 1);
  return rows;
}

function table(lines: string[]): Table {
  const rows = tableRows(lines);
  const width = Math.max(1, ...rows.map((row) => row.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (cells, index) =>
        new TableRow({
          tableHeader: index === 0,
          children: Array.from(
            { length: width },
            (_, column) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children:
                      index === 0
                        ? [new TextRun({ text: cells[column] ?? '', bold: true })]
                        : runs(cells[column] ?? ''),
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

function blocks(markdown: string): Array<Paragraph | Table> {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: Array<Paragraph | Table> = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (/^\s*```/.test(line)) {
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index]!)) {
        out.push(
          new Paragraph({ children: [new TextRun({ text: lines[index]!, font: CODE_FONT })] }),
        );
        index += 1;
      }
      index += 1;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[] = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index]!)) {
        rows.push(lines[index]!);
        index += 1;
      }
      out.push(table(rows));
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const ordered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (heading) {
      out.push(
        new Paragraph({ heading: HEADINGS[heading[1]!.length - 1], children: runs(heading[2]!) }),
      );
    } else if (bullet) {
      out.push(
        new Paragraph({
          bullet: { level: Math.min(8, Math.floor(bullet[1]!.length / 2)) },
          children: runs(bullet[2]!),
        }),
      );
    } else if (ordered) {
      out.push(
        new Paragraph({
          numbering: {
            reference: NUMBERED,
            level: Math.min(8, Math.floor(ordered[1]!.length / 2)),
          },
          children: runs(ordered[2]!),
        }),
      );
    } else if (quote) {
      out.push(new Paragraph({ indent: { left: 720 }, children: runs(quote[1]!) }));
    } else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push(new Paragraph({ thematicBreak: true, children: [] }));
    } else if (line.trim()) {
      out.push(new Paragraph({ children: runs(line.trim()) }));
    }
    index += 1;
  }
  return out;
}

export async function markdownToDocxBase64(markdown: string, title: string): Promise<string> {
  const document = new Document({
    title,
    numbering: {
      config: [
        {
          reference: NUMBERED,
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: blocks(markdown) }],
  });
  return Packer.toBase64String(document);
}
