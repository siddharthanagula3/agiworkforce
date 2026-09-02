const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const MARKER = /(?<!\])\[(\d{1,3})\](?![([:])/g;

export const CITATION_HREF_PATTERN = /^#chat-citation-(\d{1,3})$/;

export function citationHref(oneBasedIndex: number): string {
  return `#chat-citation-${oneBasedIndex}`;
}

const TRACKING_PARAM_PATTERN = /^(utm_[a-z_]+|fbclid|gclid|mc_[ce]id)$/i;

function normalizeCitationUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    const params = Array.from(parsed.searchParams.entries())
      .filter(([key]) => !TRACKING_PARAM_PATTERN.test(key))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const query = params.map(([key, value]) => `${key}=${value}`).join('&');
    return `${host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return null;
  }
}

/**
 * Resolves a plain inline link's href to a delivered source's 1-based
 * position, the same numbering `linkifyCitationMarkers` gives a `[n]`
 * marker, so a source cited both ways in one message gets one number.
 * Comparison ignores scheme, `www.`, a trailing slash, and tracking query
 * parameters (utm_*, fbclid, gclid, mc_cid/mc_eid) so a link the model
 * decorated with its own tracking params still matches a clean source URL.
 */
export function findCitationIndexForUrl(
  href: string,
  citations: readonly { url: string }[],
): number | undefined {
  const target = normalizeCitationUrl(href);
  if (!target) return undefined;
  for (let i = 0; i < citations.length; i++) {
    const citation = citations[i];
    if (citation && normalizeCitationUrl(citation.url) === target) return i + 1;
  }
  return undefined;
}

export function stripTrackingParams(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const trackingKeys = Array.from(new Set(parsed.searchParams.keys())).filter((key) =>
    TRACKING_PARAM_PATTERN.test(key),
  );
  if (trackingKeys.length === 0) return url;
  trackingKeys.forEach((key) => parsed.searchParams.delete(key));
  return parsed.toString();
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
