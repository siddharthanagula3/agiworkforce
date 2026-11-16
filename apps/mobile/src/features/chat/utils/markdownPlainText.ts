import { isRichBlockLanguage, richBlocksAsPlainText } from '@agiworkforce/unified-chat/rich-blocks';
import {
  answerSurfacePlainText,
  liftAnswerBadges,
} from '@agiworkforce/unified-chat/answer-surfaces';
import {
  collectDisplayMath,
  collectFencedCode,
  FOOTNOTE_DEFINITION_LINE,
  HEADING_LINE,
  isMathFenceLanguage,
  opensDisplayMath,
  QUOTE_LINE,
  readFenceOpen,
  THEMATIC_BREAK_LINE,
} from '@/src/features/chat/components/markdownBlockSyntax';
import {
  collectLinkDefinitions,
  footnoteNumber,
  inlinePlainText,
  readLinkDefinition,
  type InlineParseOptions,
} from '@/src/features/chat/utils/markdownInlineSyntax';
import { dropHiddenHtmlBlocks } from '@/src/features/chat/utils/markdownHiddenHtml';
import { describeChart, parseMermaidChart } from '@/src/features/chat/utils/mermaidChart';
import { readTable } from '@/src/features/chat/utils/markdownTableRows';

const CHART_FENCE_LANGUAGE = 'chart';
const MERMAID_FENCE_LANGUAGE = 'mermaid';
const DIAGRAM_TITLE = /^\s*title(?:\s*:\s*|\s+)(.+?)\s*$/im;
const DIAGRAM_QUOTED_LABEL = /"([^"\n]+)"/g;
const DIAGRAM_BRACKET_LABEL = /[[({]+([^\][(){}\n"|]+)[\])}]+/g;
const DIAGRAM_PARTICIPANT = /^\s*(?:participant|actor)\s+(?:\S+\s+as\s+)?(.+?)\s*$/gim;
const DIAGRAM_FALLBACK = 'Diagram';
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const HEADING_CLOSING_HASHES = /\s+#+\s*$/;
const LIST_ITEM = /^(\s*)(?:[-*+]|(\d{1,9}[.)]))\s+(?:\[[ xX]\]\s+)?(.*)$/;
const FULL_LINE_IMAGE = /^!\[([^\]]*)\]\([^)]*\)$/;
const HARD_BREAK = /(?:\\| {2,})$/;

interface PlainTextContext extends InlineParseOptions {
  readonly footnoteOrder: readonly string[];
}

function tableRowText(row: string, context: PlainTextContext): string {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => inlinePlainText(cell.trim(), context))
    .join('\t');
}

function proseLineText(line: string, context: PlainTextContext): string | null {
  if (readLinkDefinition(line)) return null;
  if (THEMATIC_BREAK_LINE.test(line) || TABLE_SEPARATOR.test(line)) return null;
  let body = line;
  while (QUOTE_LINE.test(body)) body = body.replace(QUOTE_LINE, '');
  const image = FULL_LINE_IMAGE.exec(body.trim());
  if (image) return image[1]!.trim();
  const heading = HEADING_LINE.exec(body);
  if (heading) return inlinePlainText(heading[2]!.replace(HEADING_CLOSING_HASHES, ''), context);
  const note = FOOTNOTE_DEFINITION_LINE.exec(body);
  if (note) {
    return `${footnoteNumber(note[1]!, context.footnoteOrder)}. ${inlinePlainText(note[2]!, context)}`;
  }
  const item = LIST_ITEM.exec(body);
  if (item) return `${item[1]}${item[2] ?? '•'} ${inlinePlainText(item[3]!, context)}`;
  const row = body.trim();
  if (row.startsWith('|') && row.endsWith('|') && row.length > 1) return tableRowText(row, context);
  return inlinePlainText(body.replace(HARD_BREAK, ''), context);
}

function diagramLabels(body: string): string[] {
  const labels = new Set<string>();
  for (const pattern of [DIAGRAM_PARTICIPANT, DIAGRAM_QUOTED_LABEL, DIAGRAM_BRACKET_LABEL]) {
    for (const match of body.matchAll(pattern)) {
      const label = match[1]!.trim();
      if (label) labels.add(label);
    }
  }
  return [...labels];
}

export function diagramPlainText(body: string): string {
  const chart = parseMermaidChart(body);
  if (chart) return describeChart(chart);
  const title = DIAGRAM_TITLE.exec(body)?.[1]?.trim();
  if (title) return title;
  const labels = diagramLabels(body);
  return labels.length > 0 ? labels.join(', ') : DIAGRAM_FALLBACK;
}

function fenceText(language: string, raw: string, body: string): string {
  if (isMathFenceLanguage(language)) return body.trim();
  if (isRichBlockLanguage(language)) return richBlocksAsPlainText(raw);
  if (language === CHART_FENCE_LANGUAGE) return answerSurfacePlainText(language, body);
  if (language === MERMAID_FENCE_LANGUAGE) return diagramPlainText(body);
  return body;
}

export function answerClipboardText(content: string): string {
  return richBlocksAsPlainText(content);
}

function footnoteLabels(lines: readonly string[]): string[] {
  const labels: string[] = [];
  let idx = 0;
  while (idx < lines.length) {
    const fence = readFenceOpen(lines[idx]!);
    if (fence) {
      idx = collectFencedCode(lines, idx, fence).next;
      continue;
    }
    const label = FOOTNOTE_DEFINITION_LINE.exec(lines[idx]!)?.[1];
    if (label && !labels.includes(label)) labels.push(label);
    idx += 1;
  }
  return labels;
}

export function answerPlainText(content: string): string {
  const lines = liftAnswerBadges(dropHiddenHtmlBlocks(content.replace(/\r\n?/g, '\n'))).split('\n');
  const context: PlainTextContext = {
    footnoteOrder: footnoteLabels(lines),
    linkDefinitions: collectLinkDefinitions(lines),
  };
  const out: string[] = [];
  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx]!;
    const fence = readFenceOpen(line);
    if (fence) {
      const fenced = collectFencedCode(lines, idx, fence);
      const raw = lines.slice(idx, fenced.next).join('\n');
      out.push(fenceText(fence.language.toLowerCase(), raw, fenced.body));
      idx = fenced.next;
      continue;
    }
    if (opensDisplayMath(line)) {
      const math = collectDisplayMath(lines, idx);
      out.push(math.tex);
      idx = math.next;
      continue;
    }
    const table = readTable(lines, idx);
    if (table) {
      for (const row of table.rows) {
        out.push(row.map((cell) => inlinePlainText(cell, context).trim()).join('\t'));
      }
      idx = table.next;
      continue;
    }
    const text = proseLineText(line, context);
    if (text !== null) out.push(text);
    idx += 1;
  }
  return out.join('\n');
}
