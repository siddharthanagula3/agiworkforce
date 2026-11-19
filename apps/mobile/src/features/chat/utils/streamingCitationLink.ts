import {
  findCitationIndexForUrl,
  isCitationOnlyLinkText,
} from '@agiworkforce/unified-chat/citation-markers';
import {
  closesFence,
  readFenceOpen,
  type FenceOpen,
} from '@/src/features/chat/components/markdownBlockSyntax';

interface CitableSource {
  readonly url?: string;
}

interface TailLink {
  readonly start: number;
  readonly label: string;
  readonly destination: string;
  readonly closed: boolean;
}

const LINE_FEED = '\n';
const LABEL_OPEN = '[';
const LABEL_CLOSE = ']';
const DESTINATION_OPEN = '(';
const DESTINATION_CLOSE = ')';
const IMAGE_MARKER = '!';
const ESCAPE = '\\';
const BACKTICK = '`';
const SPACE_OR_TAB = /[ \t]/;
const SPACES_OR_TABS = /^[ \t]*$/;
const WHITESPACE = /\s/;
const SINGLE_TOKEN = /^\S*$/;

function endsInsideFence(content: string): boolean {
  let open: FenceOpen | null = null;
  for (const line of content.split(LINE_FEED)) {
    if (open) {
      if (closesFence(line, open)) open = null;
      continue;
    }
    open = readFenceOpen(line);
  }
  return open !== null;
}

function insideCodeSpan(prefix: string): boolean {
  let ticks = 0;
  for (const character of prefix) {
    if (character === BACKTICK) ticks += 1;
  }
  return ticks % 2 === 1;
}

function closingBracketAt(line: string, start: number): number {
  let depth = 0;
  for (let index = start + 1; index < line.length; index += 1) {
    if (line[index] === LABEL_OPEN) {
      depth += 1;
    } else if (line[index] === LABEL_CLOSE) {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function tailLinkStart(line: string): number {
  const inner = line.lastIndexOf(LABEL_OPEN);
  if (inner < 1 || line[inner - 1] !== LABEL_OPEN || line[inner - 2] === ESCAPE) return inner;
  return inner - 1;
}

function readTailLink(line: string): TailLink | null {
  const start = tailLinkStart(line);
  if (start === -1) return null;
  const before = line[start - 1];
  if (before === IMAGE_MARKER || before === ESCAPE) return null;
  const labelEnd = closingBracketAt(line, start);
  if (labelEnd === -1) {
    return { start, label: line.slice(start + 1), destination: '', closed: false };
  }
  const label = line.slice(start + 1, labelEnd);
  if (labelEnd === line.length - 1) return { start, label, destination: '', closed: false };
  if (line[labelEnd + 1] !== DESTINATION_OPEN) return null;
  const destinationStart = labelEnd + 2;
  let depth = 0;
  for (let index = destinationStart; index < line.length; index += 1) {
    const character = line[index]!;
    if (WHITESPACE.test(character)) return null;
    if (character === DESTINATION_OPEN) {
      depth += 1;
    } else if (character === DESTINATION_CLOSE) {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      if (!SPACES_OR_TABS.test(line.slice(index + 1))) return null;
      return { start, label, destination: line.slice(destinationStart, index), closed: true };
    }
  }
  return { start, label, destination: line.slice(destinationStart), closed: false };
}

function wrappingParenAt(line: string, start: number): number {
  let index = start - 1;
  while (index >= 0 && SPACE_OR_TAB.test(line[index]!)) index -= 1;
  return line[index] === DESTINATION_OPEN ? index : -1;
}

/**
 * A cited link streams in as label, then bare address, then marker. Until its
 * address closes, a link whose label could still be a citation is held back
 * and an opening parenthesis waits for what follows it. A closed citation
 * still inside an open parenthesis waits, with that parenthesis, for the next
 * character, which says whether the parenthesis closes around the marker and
 * is dropped or stays as text. So nothing drawn before a marker changes once
 * the marker appears.
 */
export function holdStreamingCitationLink(
  content: string,
  sources: readonly CitableSource[],
): string {
  if (sources.length === 0) return content;
  const lineStart = content.lastIndexOf(LINE_FEED) + 1;
  const line = content.slice(lineStart);
  const link = readTailLink(line);
  const tail = link ? link.start : line.length;
  const paren = wrappingParenAt(line, tail);
  if ((!link && paren === -1) || insideCodeSpan(line.slice(0, tail)) || endsInsideFence(content)) {
    return content;
  }
  if (!link) return content.slice(0, lineStart + paren);
  if (!link.closed) {
    if (!SINGLE_TOKEN.test(link.label)) return content;
    return content.slice(0, lineStart + (paren === -1 ? link.start : paren));
  }
  if (paren === -1 || !isCitationOnlyLinkText(link.label, link.destination)) return content;
  const cited = findCitationIndexForUrl(
    link.destination,
    sources.map((source) => ({ url: source.url ?? '' })),
  );
  if (cited === undefined) return content;
  return content.slice(0, lineStart + paren);
}
