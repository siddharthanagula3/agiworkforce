import type { CitationSpan } from '@agiworkforce/unified-chat';

export interface CitationAnchor {
  offset: number;
  marker: number;
}

const SENTENCE_TERMINATORS = '.!?';

function claimEnd(content: string, from: number): number {
  for (let index = Math.max(from, 0); index < content.length; index += 1) {
    const character = content[index];
    if (character === '\n') return index;
    if (SENTENCE_TERMINATORS.includes(character ?? '')) {
      const next = content[index + 1];
      if (next === undefined || /\s/.test(next)) return index;
    }
  }
  return content.length;
}

function lineStartsAt(content: string, index: number): number {
  return content.lastIndexOf('\n', Math.max(index - 1, 0)) + 1;
}

/**
 * A provider that cites inline sends each citation just before the text it
 * supports, so the claim is the sentence that text completes. Rows of a table
 * are left alone: a marker after the last pipe breaks the row.
 */
export function citationSpansFromAnchors(
  content: string,
  anchors: readonly CitationAnchor[],
): CitationSpan[] {
  const byEnd = new Map<number, Set<number>>();
  for (const anchor of anchors) {
    if (anchor.offset < 0 || anchor.offset >= content.length) continue;
    const end = claimEnd(content, anchor.offset);
    if (end <= 0) continue;
    if (content.slice(lineStartsAt(content, end), end).trimStart().startsWith('|')) continue;
    const markers = byEnd.get(end) ?? new Set<number>();
    markers.add(anchor.marker);
    byEnd.set(end, markers);
  }
  return [...byEnd.entries()].map(([endIndex, markers]) => ({
    endIndex,
    positions: [...markers].sort((a, b) => a - b),
  }));
}
