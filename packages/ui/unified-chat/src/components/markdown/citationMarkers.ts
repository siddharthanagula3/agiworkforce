const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const MARKER = /(?<!\])\[(\d{1,3})\](?![([:])/g;

export const CITATION_HREF_PATTERN = /^#chat-citation-(\d{1,3})$/;

export function citationHref(oneBasedIndex: number): string {
  return `#chat-citation-${oneBasedIndex}`;
}

function splitInlineCode(segment: string): string[] {
  return segment.split(/(`+[^`]*`+)/);
}

function linkifyPart(part: string, citationCount: number): string {
  return part.replace(MARKER, (match, digits: string) => {
    const n = Number(digits);
    if (!Number.isInteger(n) || n < 1 || n > citationCount) return match;
    return `[&#91;${n}&#93;](${citationHref(n)})`;
  });
}

/**
 * Turns a `[n]` marker naming a source the message actually carries into a
 * link the `a` renderer resolves to a `CitationChip`, the same way
 * apps/web/features/chat/lib/citation-links.ts does for research reports —
 * ported here because this component cannot depend on apps/web, and the two
 * link targets differ (a same-page anchor there, an open-in-tab chip here).
 *
 * Fence- and inline-code-safe so `rows[1]` in a snippet is never mistaken for
 * a citation, and only run on markers that are already fully closed, so a
 * still-streaming `[4` is left as plain text until its `]` arrives.
 */
export function linkifyCitationMarkers(markdown: string, citationCount: number): string {
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
