const LINE_FEED = '\n';
const BACKTICK = '`';
const STRONG_MARKER = '**';
const LINK_LABEL_OPEN = '[';
const LINK_DESTINATION_OPEN = '](';
const LINK_DESTINATION_CLOSE = ')';
const IMAGE_MARKER = '!';
const STRONG_PARITY = 2;

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;
const THEMATIC_BREAK_LINE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

interface OpenFence {
  readonly marker: string;
  readonly length: number;
}

interface StrippedProse {
  readonly text: string;
  readonly openCodeRun: number;
}

function readFence(line: string): OpenFence | null {
  const match = FENCE_LINE.exec(line);
  const run = match?.[1];
  if (!run) return null;
  return { marker: run.charAt(0), length: run.length };
}

function closesFence(line: string, open: OpenFence): boolean {
  const fence = readFence(line);
  if (!fence) return false;
  if (fence.marker !== open.marker || fence.length < open.length) return false;
  return line.trim().length === fence.length;
}

function proseOutsideCodeBlocks(source: string): string {
  const kept: string[] = [];
  let open: OpenFence | null = null;

  for (const line of source.split(LINE_FEED)) {
    if (open) {
      if (closesFence(line, open)) open = null;
      continue;
    }
    const fence = readFence(line);
    if (fence) {
      open = fence;
      continue;
    }
    if (THEMATIC_BREAK_LINE.test(line)) continue;
    kept.push(line);
  }

  return kept.join(LINE_FEED);
}

function backtickRunLength(source: string, start: number): number {
  let end = start;
  while (end < source.length && source[end] === BACKTICK) end += 1;
  return end - start;
}

function findClosingRun(source: string, from: number, length: number): number {
  let index = from;
  while (index < source.length) {
    if (source[index] !== BACKTICK) {
      index += 1;
      continue;
    }
    const run = backtickRunLength(source, index);
    if (run === length) return index;
    index += run;
  }
  return -1;
}

function stripCodeSpans(prose: string): StrippedProse {
  let text = '';
  let index = 0;

  while (index < prose.length) {
    if (prose[index] !== BACKTICK) {
      text += prose[index];
      index += 1;
      continue;
    }
    const run = backtickRunLength(prose, index);
    const closing = findClosingRun(prose, index + run, run);
    if (closing === -1) return { text, openCodeRun: run };
    index = closing + run;
  }

  return { text, openCodeRun: 0 };
}

function strongIsOpen(text: string): boolean {
  let markers = 0;
  let index = 0;
  while (index < text.length) {
    if (text.startsWith(STRONG_MARKER, index)) {
      markers += 1;
      index += STRONG_MARKER.length;
      continue;
    }
    index += 1;
  }
  return markers % STRONG_PARITY === 1;
}

function linkDestinationIsOpen(text: string): boolean {
  const destination = text.lastIndexOf(LINK_DESTINATION_OPEN);
  if (destination === -1) return false;
  if (text.includes(LINK_DESTINATION_CLOSE, destination + LINK_DESTINATION_OPEN.length)) {
    return false;
  }
  const label = text.lastIndexOf(LINK_LABEL_OPEN, destination);
  if (label === -1) return false;
  return label === 0 || text[label - 1] !== IMAGE_MARKER;
}

export function completeInlineTokens(tail: string): string {
  const { text, openCodeRun } = stripCodeSpans(proseOutsideCodeBlocks(tail));

  let repaired = tail;
  if (openCodeRun > 0) repaired += BACKTICK.repeat(openCodeRun);
  if (linkDestinationIsOpen(text)) repaired += LINK_DESTINATION_CLOSE;
  if (strongIsOpen(text)) repaired += STRONG_MARKER;
  return repaired;
}
