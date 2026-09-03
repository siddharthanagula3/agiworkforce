const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const MARKER_RUN = /(?<!\])(?:\[\d{1,3}\])+(?![(:[])/g;

export const CITATION_HREF_PATTERN = /^#chat-citation-(\d{1,3})$/;
export const CITATION_GROUP_HREF_PATTERN = /^#chat-citations-(\d{1,3}(?:,\d{1,3})+)$/;

export function citationHref(oneBasedIndex: number): string {
  return `#chat-citation-${oneBasedIndex}`;
}

export function citationGroupHref(oneBasedIndices: readonly number[]): string {
  return `#chat-citations-${oneBasedIndices.join(',')}`;
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

function registrableDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * True only for a link with no meaningful path or query of its own
 * (`blog.google`, `https://snaplogic.com/`) - the shape the model writes
 * when it names a source by domain rather than linking the article. A full
 * article URL that merely fails the exact match above (because the page
 * never made it into this turn's retrieved pool) is NOT this shape, and
 * must not fall through to domain matching below: on a domain with several
 * retrieved pages, that swaps in some other page on the same site as if it
 * were the one the model actually cited.
 */
function isBareDomainHref(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/+$/, '') === '' && parsed.search === '';
  } catch {
    return false;
  }
}

/**
 * Resolves a plain inline link's href to a delivered source's 1-based
 * position, the same numbering `linkifyCitationMarkers` gives a `[n]`
 * marker, so a source cited both ways in one message gets one number.
 * Comparison ignores scheme, `www.`, a trailing slash, and tracking query
 * parameters (utm_*, fbclid, gclid, mc_cid/mc_eid) so a link the model
 * decorated with its own tracking params still matches a clean source URL.
 *
 * A model that writes a bare domain link (`blog.google`, `snaplogic.com`)
 * instead of the article URL never clears that exact match, so a bare-domain
 * href falls back to the registrable domain, and then to the href being a
 * URL-boundary prefix of a source's URL — each only when it identifies
 * exactly one source; two sources sharing a domain leave the link unmatched
 * rather than guess. A href that already carries a path skips the domain
 * fallback entirely and goes straight to the prefix check, so a real but
 * unretrieved article never gets silently swapped for an unrelated page on
 * the same host.
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

  const domain = isBareDomainHref(href) ? registrableDomain(href) : null;
  if (domain) {
    const domainMatches: number[] = [];
    citations.forEach((citation, i) => {
      if (citation && registrableDomain(citation.url) === domain) domainMatches.push(i + 1);
    });
    if (domainMatches.length === 1) return domainMatches[0];
    if (domainMatches.length > 1) return undefined;
  }

  const prefixMatches: number[] = [];
  citations.forEach((citation, i) => {
    if (!citation) return;
    const citationTarget = normalizeCitationUrl(citation.url);
    if (!citationTarget || !citationTarget.startsWith(target)) return;
    const boundary = citationTarget[target.length];
    if (boundary === undefined || boundary === '/' || boundary === '?') {
      prefixMatches.push(i + 1);
    }
  });
  return prefixMatches.length === 1 ? prefixMatches[0] : undefined;
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

function markerMarkdown(indices: readonly number[]): string {
  if (indices.length === 1) {
    const n = indices[0] as number;
    return `[&#91;${n}&#93;](${citationHref(n)})`;
  }
  const label = indices.map((n) => `&#91;${n}&#93;`).join('');
  return `[${label}](${citationGroupHref(indices)})`;
}

function linkifyRun(run: string, citationCount: number): string {
  const tokens = (run.match(/\d{1,3}/g) ?? []).map(Number);
  const out: string[] = [];
  let group: number[] = [];
  const flushGroup = () => {
    if (group.length > 0) {
      out.push(markerMarkdown(group));
      group = [];
    }
  };
  for (const n of tokens) {
    if (n >= 1 && n <= citationCount) {
      group.push(n);
    } else {
      flushGroup();
      out.push(`[${n}]`);
    }
  }
  flushGroup();
  return out.join('');
}

function linkifyPart(part: string, citationCount: number): string {
  return part.replace(MARKER_RUN, (run) => linkifyRun(run, citationCount));
}

/**
 * Turns each `[n]` marker (or unbroken run of them, "[1][2]") naming a source
 * the message actually carries into a link the `a` renderer resolves to a
 * `CitationChip`, the same way apps/web/features/chat/lib/citation-links.ts
 * does for research reports — ported here because this component cannot
 * depend on apps/web, and the two link targets differ (a same-page anchor
 * there, an open-in-tab chip here). A run of two or more markers becomes one
 * link carrying every index, so the renderer can group them into a single
 * pill instead of one chip per source.
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
