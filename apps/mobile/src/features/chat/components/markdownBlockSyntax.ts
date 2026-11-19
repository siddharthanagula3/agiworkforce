import { preprocessMath } from '@agiworkforce/unified-chat/preprocess-math';
import {
  completeInlineTokens,
  dropOpenLinkDestination,
} from '@agiworkforce/unified-chat/complete-inline-tokens';
import { holdIncompleteGfmTable } from '@agiworkforce/unified-chat/streaming-table-hold';
import { protectEscapes, restoreEscapes } from '@/src/features/chat/utils/markdownInlineSyntax';

const TAB_STOP = 4;
const INDENTED_CODE_COLUMNS = 4;
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const CONTAINED_FENCE_OPEN = /^[ \t>]*(`{3,}|~{3,})(.*)$/;
const CONTAINED_FENCE_CLOSE = /^[ \t>]*(`{3,}|~{3,})[ \t]*$/;
const MATH_OPEN = /^ {0,3}\$\$/;
const MATH_CLOSE = /\$\$[ \t]*$/;
const SINGLE_LINE_MATH_REST = /^[^$]*[^$\s][^$]*\$\$[ \t]*$/;
const MATH_FENCE_LANGUAGES: ReadonlySet<string> = new Set(['math', 'latex-display']);
const LINE_FEED = '\n';
const CRLF = /\r\n?/g;
const DETAILS_OPEN_TAG = /^\s*<details\b([^>]*)>/i;
const DETAILS_OPEN_ANYWHERE = /<details\b[^>]*>/gi;
const DETAILS_CLOSE_TAG = /<\/details\s*>/gi;
const DETAILS_OPEN_ATTRIBUTE = /\bopen\b/i;
const SUMMARY_ELEMENT = /^\s*<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/i;
const INLINE_IMAGE = /!\[([^\]\n]*)\]\(\s*<?([^()<>\s]+)>?(?:\s+"([^"]*)")?\s*\)/g;
const HTML_IMAGE_TAG = /<img\b[^>]*>/gi;
const HTML_ATTRIBUTE_VALUE = String.raw`\s*=\s*(?:"([^"\n]*)"|'([^'\n]*)')`;
const HTML_IMAGE_SOURCE = new RegExp(String.raw`\ssrc${HTML_ATTRIBUTE_VALUE}`, 'i');
const HTML_IMAGE_ALT = new RegExp(String.raw`\salt${HTML_ATTRIBUTE_VALUE}`, 'i');
const ANCHOR_OPEN = /<a\b[^>]*>/gi;
const ANCHOR_CLOSE = /<\/a\s*>/gi;
const CODE_SPAN = /(`+)[\s\S]*?\1/g;
const MASK = '\u0001';
const STYLE_TAGS = 'b|strong|i|em|u|ins|s|del|strike|small|mark|sup|sub|cite|dfn|var';
const STYLE_RUNS: readonly RegExp[] = [
  /\*\*\*(?![\s*])[\s\S]+?(?<![\s*])\*\*\*/g,
  /\*\*(?![\s*])[\s\S]+?(?<!\s)\*\*/g,
  /(?<![A-Za-z0-9_])__(?![\s_])[\s\S]+?(?<!\s)__(?![A-Za-z0-9_])/g,
  /(?<!\*)\*(?![\s*])[^*]+?(?<!\s)\*(?!\*)/g,
  /(?<![A-Za-z0-9_])_(?![\s_])[\s\S]+?(?<!\s)_(?![A-Za-z0-9_])/g,
  /~~(?!\s)[\s\S]+?(?<!\s)~~/g,
  new RegExp(String.raw`<(${STYLE_TAGS})>.+?</\1>`, 'gi'),
];
const OPEN_IMAGE_TAIL_ANYWHERE = /!\[([^[\]\n]*)(?:\](?:\([^)\n]*)?)?$/;
const EMPTY_BLOCK_MARKER = /^\s*(?:(?:[-*+]|\d{1,9}[.)])\s*|>[\s>]*)?$/;

export const HEADING_LINE = /^ {0,3}(#{1,6})\s+(.+)$/;
export const QUOTE_LINE = /^ {0,3}>[ \t]?/;
export const LIST_ITEM_LINE = /^(\s*)(?:([-*+])|(\d{1,9})([.)]))\s+(.+)$/;
export const FOOTNOTE_DEFINITION_LINE = /^\[\^([^\]\s]+)\]:\s?(.*)$/;
export const THEMATIC_BREAK_LINE = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
export const CONTINUATION_INDENT_LINE = /^(?: {2,}|\t)\S/;

export interface FenceOpen {
  readonly indent: number;
  readonly marker: string;
  readonly length: number;
  readonly info: string;
  readonly language: string;
}

function fenceFromMatch(run: string, info: string, indent: number): FenceOpen | null {
  const marker = run.charAt(0);
  if (marker === '`' && info.includes('`')) return null;
  const trimmed = info.trim();
  return {
    indent,
    marker,
    length: run.length,
    info: trimmed,
    language: trimmed.split(/\s+/)[0] ?? '',
  };
}

export function readFenceOpen(line: string): FenceOpen | null {
  const match = FENCE_OPEN.exec(line);
  if (!match) return null;
  return fenceFromMatch(match[2]!, match[3]!, match[1]!.length);
}

export function closesFence(line: string, open: FenceOpen): boolean {
  const run = FENCE_CLOSE.exec(line)?.[1];
  return run !== undefined && run.charAt(0) === open.marker && run.length >= open.length;
}

export function isMathFenceLanguage(language: string): boolean {
  return MATH_FENCE_LANGUAGES.has(language.toLowerCase());
}

export function leadingColumns(line: string): number {
  let columns = 0;
  for (const ch of line) {
    if (ch === ' ') columns += 1;
    else if (ch === '\t') columns += TAB_STOP - (columns % TAB_STOP);
    else break;
  }
  return columns;
}

export function dedentColumns(line: string, columns: number): string {
  let consumed = 0;
  let index = 0;
  while (index < line.length && consumed < columns) {
    const ch = line[index];
    if (ch === ' ') consumed += 1;
    else if (ch === '\t') consumed += TAB_STOP - (consumed % TAB_STOP);
    else break;
    index += 1;
  }
  const overshoot = consumed - columns;
  return (overshoot > 0 ? ' '.repeat(overshoot) : '') + line.slice(index);
}

export interface FencedCode {
  readonly fence: FenceOpen;
  readonly body: string;
  readonly closed: boolean;
  readonly next: number;
}

export function collectFencedCode(
  lines: readonly string[],
  start: number,
  fence: FenceOpen,
): FencedCode {
  const body: string[] = [];
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index]!;
    if (closesFence(line, fence)) {
      return { fence, body: body.join(LINE_FEED), closed: true, next: index + 1 };
    }
    body.push(dedentColumns(line, fence.indent));
    index += 1;
  }
  if (body.length > 0 && body[body.length - 1] === '') body.pop();
  return { fence, body: body.join(LINE_FEED), closed: false, next: index };
}

export function opensDisplayMath(line: string): boolean {
  if (!MATH_OPEN.test(line)) return false;
  const rest = line.replace(MATH_OPEN, '');
  return !rest.includes('$') || SINGLE_LINE_MATH_REST.test(rest);
}

export interface DisplayMath {
  readonly tex: string;
  readonly closed: boolean;
  readonly next: number;
}

export function collectDisplayMath(lines: readonly string[], start: number): DisplayMath {
  const opener = lines[start]!.replace(MATH_OPEN, '');
  if (SINGLE_LINE_MATH_REST.test(opener)) {
    return { tex: opener.replace(MATH_CLOSE, '').trim(), closed: true, next: start + 1 };
  }
  const body: string[] = opener.trim() ? [opener] : [];
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index]!;
    if (MATH_CLOSE.test(line)) {
      const last = line.replace(MATH_CLOSE, '');
      if (last.trim()) body.push(last);
      return { tex: body.join(LINE_FEED).trim(), closed: true, next: index + 1 };
    }
    body.push(line);
    index += 1;
  }
  return { tex: body.join(LINE_FEED).trim(), closed: false, next: index };
}

export function isIndentedCodeLine(line: string): boolean {
  return line.trim() !== '' && leadingColumns(line) >= INDENTED_CODE_COLUMNS;
}

export interface IndentedCode {
  readonly body: string;
  readonly next: number;
}

export function collectIndentedCode(lines: readonly string[], start: number): IndentedCode {
  let index = start;
  let end = start;
  while (index < lines.length) {
    const line = lines[index]!;
    if (isIndentedCodeLine(line)) end = index + 1;
    else if (line.trim() !== '') break;
    index += 1;
  }
  return {
    body: lines
      .slice(start, end)
      .map((line) => dedentColumns(line, INDENTED_CODE_COLUMNS))
      .join(LINE_FEED),
    next: end,
  };
}

const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const OPEN_IMAGE_TAIL = /^\s*!\[[^\]]*(?:\]\([^)]*)?$/;

export function setextHeadingLevel(line: string, next: string | undefined): 0 | 1 | 2 {
  if (next === undefined || !line.trim() || leadingColumns(line) >= INDENTED_CODE_COLUMNS) return 0;
  if (
    HEADING_LINE.test(line) ||
    QUOTE_LINE.test(line) ||
    LIST_ITEM_LINE.test(line) ||
    FOOTNOTE_DEFINITION_LINE.test(line) ||
    THEMATIC_BREAK_LINE.test(line) ||
    readFenceOpen(line) !== null ||
    opensDisplayMath(line)
  ) {
    return 0;
  }
  const underline = SETEXT_UNDERLINE.exec(next)?.[1];
  if (!underline) return 0;
  return underline.startsWith('=') ? 1 : 2;
}

export function isOpenImageTail(line: string): boolean {
  return OPEN_IMAGE_TAIL.test(line);
}

export type FootnoteDefinitions = Readonly<Record<string, string>>;

export function proseLines(source: string): string[] {
  const prose: string[] = [];
  let open: FenceOpen | null = null;
  for (const line of source.split(LINE_FEED)) {
    if (open) {
      if (closesFence(line, open)) open = null;
      prose.push('');
      continue;
    }
    open = readFenceOpen(line);
    prose.push(open ? '' : line);
  }
  return prose;
}

export function collectFootnoteDefinitions(source: string): FootnoteDefinitions {
  const notes: Record<string, string> = {};
  let current: string | null = null;
  for (const line of proseLines(source)) {
    const definition = FOOTNOTE_DEFINITION_LINE.exec(protectEscapes(line));
    if (definition) {
      const label = restoreEscapes(definition[1]!);
      current = label in notes ? null : label;
      if (current !== null) notes[current] = restoreEscapes(definition[2]!, true);
      continue;
    }
    if (current !== null && CONTINUATION_INDENT_LINE.test(line)) {
      notes[current] += `${LINE_FEED}${line.trim()}`;
      continue;
    }
    if (line.trim() !== '') current = null;
  }
  return notes;
}

const FOOTNOTE_REFERENCE = /\[\^([^\]\s]+)\](?!:)/g;

export function referencedFootnotes(
  source: string,
  definitions: FootnoteDefinitions,
): FootnoteDefinitions {
  const ordered: Record<string, string> = {};
  for (const line of proseLines(source)) {
    const text = protectEscapes(line);
    const prose = FOOTNOTE_DEFINITION_LINE.test(text) ? text.replace(/^\[\^[^\]\s]+\]:/, '') : text;
    for (const reference of prose.matchAll(FOOTNOTE_REFERENCE)) {
      const label = restoreEscapes(reference[1]!);
      const note = definitions[label];
      if (note !== undefined && !(label in ordered)) ordered[label] = note;
    }
  }
  return ordered;
}

export interface DetailsBlock {
  readonly summary: string;
  readonly body: string;
  readonly initiallyOpen: boolean;
  readonly closed: boolean;
  readonly next: number;
}

function countMatches(pattern: RegExp, text: string): number {
  return text.match(pattern)?.length ?? 0;
}

export function collectDetails(lines: readonly string[], start: number): DetailsBlock | null {
  const opening = DETAILS_OPEN_TAG.exec(lines[start] ?? '');
  if (!opening) return null;
  let depth = 0;
  let end = lines.length;
  let closed = false;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]!;
    depth += countMatches(DETAILS_OPEN_ANYWHERE, line) - countMatches(DETAILS_CLOSE_TAG, line);
    if (depth <= 0) {
      end = index + 1;
      closed = true;
      break;
    }
  }
  let inner = lines
    .slice(start, end)
    .join(LINE_FEED)
    .slice(opening.index + opening[0].length);
  if (closed) {
    const lastClose = inner.search(/<\/details\s*>(?![\s\S]*<\/details\s*>)/i);
    if (lastClose >= 0) inner = inner.slice(0, lastClose);
  }
  const summary = SUMMARY_ELEMENT.exec(inner);
  const body = summary ? inner.slice(summary.index + summary[0].length) : inner;
  return {
    summary: summary?.[1]?.trim() || 'Details',
    body: body.replace(/^[ \t]*\n/, '').replace(/\s+$/, ''),
    initiallyOpen: DETAILS_OPEN_ATTRIBUTE.test(opening[1] ?? ''),
    closed,
    next: end,
  };
}

export type ParagraphPiece =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'image'; readonly alt: string; readonly src: string; readonly title?: string };

interface ImageSpan {
  readonly at: number;
  readonly end: number;
  readonly piece: Extract<ParagraphPiece, { kind: 'image' }>;
}

function htmlAttribute(pattern: RegExp, tag: string): string | undefined {
  const match = pattern.exec(tag);
  return match ? (match[1] ?? match[2]) : undefined;
}

function insideAnchor(line: string, at: number): boolean {
  const before = line.slice(0, at);
  return countMatches(ANCHOR_OPEN, before) > countMatches(ANCHOR_CLOSE, before);
}

function insideLinkLabel(line: string, at: number): boolean {
  let depth = 0;
  for (let index = 0; index < at; index += 1) {
    if (line[index] === '[') depth += 1;
    else if (line[index] === ']' && depth > 0) depth -= 1;
  }
  return depth > 0;
}

function insideStyleRun(masked: string, span: ImageSpan): boolean {
  return STYLE_RUNS.some((pattern) =>
    [...masked.matchAll(pattern)].some(
      (run) => run.index < span.at && run.index + run[0].length > span.end,
    ),
  );
}

function maskRanges(line: string, ranges: readonly (readonly [number, number])[]): string {
  let masked = line;
  for (const [from, to] of ranges) {
    masked = masked.slice(0, from) + MASK.repeat(to - from) + masked.slice(to);
  }
  return masked;
}

function imageSpans(line: string): ImageSpan[] {
  const code: [number, number][] = [];
  for (const span of line.matchAll(CODE_SPAN)) {
    code.push([span.index, span.index + span[0].length]);
  }
  const usable = (at: number) =>
    !code.some(([from, to]) => at >= from && at < to) &&
    !insideAnchor(line, at) &&
    !insideLinkLabel(line, at);
  const spans: ImageSpan[] = [];
  for (const match of line.matchAll(INLINE_IMAGE)) {
    const at = match.index;
    if (!usable(at)) continue;
    const title = match[3]?.trim();
    spans.push({
      at,
      end: at + match[0].length,
      piece: {
        kind: 'image',
        alt: match[1]!.trim(),
        src: match[2]!,
        ...(title ? { title } : {}),
      },
    });
  }
  for (const match of line.matchAll(HTML_IMAGE_TAG)) {
    const at = match.index;
    const src = htmlAttribute(HTML_IMAGE_SOURCE, match[0])?.trim();
    if (!src || !usable(at)) continue;
    spans.push({
      at,
      end: at + match[0].length,
      piece: {
        kind: 'image',
        alt: (htmlAttribute(HTML_IMAGE_ALT, match[0]) ?? '').trim(),
        src,
      },
    });
  }
  if (spans.length === 0) return spans;
  const masked = maskRanges(line, [...code, ...spans.map((span) => [span.at, span.end] as const)]);
  return spans.filter((span) => !insideStyleRun(masked, span)).sort((a, b) => a.at - b.at);
}

export function splitInlineImages(
  line: string,
  trimText: boolean,
): readonly ParagraphPiece[] | null {
  const spans = imageSpans(line);
  if (spans.length === 0) return null;
  const pieces: ParagraphPiece[] = [];
  const pushText = (text: string) => {
    const value = trimText ? text.trim() : text;
    if (value) pieces.push({ kind: 'text', text: value });
  };
  let last = 0;
  for (const span of spans) {
    if (span.at < last) continue;
    pushText(line.slice(last, span.at));
    pieces.push(span.piece);
    last = span.end;
  }
  pushText(line.slice(last));
  return pieces;
}

export function splitParagraphImages(line: string): readonly ParagraphPiece[] | null {
  return splitInlineImages(line, true);
}

function containedFenceOpen(line: string): FenceOpen | null {
  const match = CONTAINED_FENCE_OPEN.exec(line);
  if (!match) return null;
  return fenceFromMatch(match[1]!, match[2]!, 0);
}

function closesContainedFence(line: string, open: FenceOpen): boolean {
  const run = CONTAINED_FENCE_CLOSE.exec(line)?.[1];
  return run !== undefined && run.charAt(0) === open.marker && run.length >= open.length;
}

function preprocessOutsideFences(source: string): string {
  const lines = source.split(LINE_FEED);
  const out: string[] = [];
  let prose: string[] = [];
  let open: FenceOpen | null = null;
  const flushProse = () => {
    if (prose.length > 0) out.push(preprocessMath(prose.join(LINE_FEED)));
    prose = [];
  };
  for (const line of lines) {
    if (open) {
      out.push(line);
      if (closesContainedFence(line, open)) open = null;
      continue;
    }
    const fence = containedFenceOpen(line);
    if (fence) {
      flushProse();
      out.push(line);
      open = fence;
      continue;
    }
    prose.push(line);
  }
  flushProse();
  return out.join(LINE_FEED);
}

function endsInIndentedCode(lines: readonly string[]): boolean {
  const last = lines.length - 1;
  if (!isIndentedCodeLine(lines[last]!)) return false;
  let first = last;
  for (let index = last - 1; index >= 0; index -= 1) {
    if (isIndentedCodeLine(lines[index]!)) first = index;
    else if (lines[index]!.trim() !== '') break;
  }
  return first === 0 || lines[first - 1]!.trim() === '';
}

function endsInProse(lines: readonly string[]): boolean {
  const last = lines.length - 1;
  let open: FenceOpen | null = null;
  for (let index = 0; index < last; index += 1) {
    const line = lines[index]!;
    if (open) {
      if (closesContainedFence(line, open)) open = null;
      continue;
    }
    open = containedFenceOpen(line);
  }
  if (open || containedFenceOpen(lines[last]!)) return false;
  return !endsInIndentedCode(lines);
}

function insideCodeSpan(line: string, at: number): boolean {
  const closed = [...line.matchAll(CODE_SPAN)].map(
    (span) => [span.index, span.index + span[0].length] as const,
  );
  const within = (index: number) => closed.some(([from, to]) => index >= from && index < to);
  if (within(at)) return true;
  for (let index = 0; index < at; index += 1) {
    if (line[index] === '`' && !within(index)) return true;
  }
  return false;
}

function dropOpenImageTail(source: string, stopped: boolean): string {
  const lines = source.split(LINE_FEED);
  const last = lines.length - 1;
  const line = lines[last]!;
  const tail = OPEN_IMAGE_TAIL_ANYWHERE.exec(line);
  if (!tail || !endsInProse(lines) || insideCodeSpan(line, tail.index)) return source;
  const head = line.slice(0, tail.index) + (stopped ? tail[1]! : '');
  lines[last] = EMPTY_BLOCK_MARKER.test(head) ? '' : head;
  return lines.join(LINE_FEED);
}

export function prepareMarkdownSource(
  content: string,
  streaming: boolean,
  stopped = false,
): string {
  const normalized = content.replace(CRLF, LINE_FEED);
  const settled = streaming
    ? completeInlineTokens(dropOpenImageTail(holdIncompleteGfmTable(normalized), false))
    : stopped
      ? completeInlineTokens(dropOpenImageTail(normalized, true))
      : dropOpenLinkDestination(normalized);
  return preprocessOutsideFences(settled);
}
