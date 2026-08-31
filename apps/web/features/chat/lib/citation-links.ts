export const CITATION_ANCHOR_PREFIX = 'research-source-';

export function citationAnchorId(oneBasedIndex: number): string {
  return `${CITATION_ANCHOR_PREFIX}${oneBasedIndex}`;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

function splitInlineCode(segment: string): string[] {
  return segment.split(/(`+[^`]*`+)/);
}

/**
 * Turns the `[n]` markers a report writes inline into links to the numbered
 * Sources list underneath it. They were plain text, so a reader could see that
 * a claim was cited but had no way to reach the source without scrolling and
 * counting.
 *
 * Only a marker that names a source that exists is linked, and only outside
 * code, where `[0]` is an index and not a citation.
 */
export function linkifyCitations(markdown: string, citationCount: number): string {
  if (citationCount <= 0 || !markdown) return markdown;

  const lines = markdown.split('\n');
  let insideFence = false;
  const out: string[] = [];

  for (const line of lines) {
    if (FENCE.test(line)) {
      insideFence = !insideFence;
      out.push(line);
      continue;
    }
    if (insideFence) {
      out.push(line);
      continue;
    }
    out.push(
      splitInlineCode(line)
        .map((part) => (part.startsWith('`') ? part : linkifyPart(part, citationCount)))
        .join(''),
    );
  }

  return out.join('\n');
}

function linkifyPart(part: string, citationCount: number): string {
  // A marker already carrying a destination, a reference definition, or a
  // footnote is left exactly as written.
  return part.replace(/(?<!\])\[(\d{1,3})\](?![([:])/g, (match, digits: string) => {
    const n = Number(digits);
    if (!Number.isInteger(n) || n < 1 || n > citationCount) return match;
    // Entities, not backslash escapes: `\[` and `\]` are LaTeX display-math
    // delimiters, and the math pass rewrites them before the link is ever
    // parsed - the marker renders as a stray equation and the link disappears.
    return `[&#91;${n}&#93;](#${citationAnchorId(n)})`;
  });
}

/**
 * The source numbers a report actually cites in its prose, ignoring code. Used
 * to tell "this report cites nothing" apart from "this report cites sources
 * the run failed to capture" - the second must not render as an empty space
 * where the bibliography should be.
 */
export function citedSourceNumbers(markdown: string): number[] {
  if (!markdown) return [];
  const found = new Set<number>();
  let insideFence = false;

  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    for (const part of splitInlineCode(line)) {
      if (part.startsWith('`')) continue;
      for (const match of part.matchAll(/(?<!\])\[(\d{1,3})\](?![([:])/g)) {
        const n = Number(match[1]);
        if (Number.isInteger(n) && n >= 1) found.add(n);
      }
    }
  }

  return [...found].sort((a, b) => a - b);
}
