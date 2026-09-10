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

export function normalizeCitationUrl(url: string): string | null {
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

export interface CitationSpan {
  endIndex: number;
  positions: readonly number[];
}

function fencedRegions(markdown: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  let offset = 0;
  let openedAt: number | null = null;
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) {
      if (openedAt === null) openedAt = offset;
      else {
        regions.push([openedAt, offset + line.length]);
        openedAt = null;
      }
    }
    offset += line.length + 1;
  }
  if (openedAt !== null) regions.push([openedAt, markdown.length]);
  return regions;
}

/**
 * A grounded segment often stops just short of the full stop that closes its
 * sentence, and a marker between the last word and that stop reads as a typo.
 * Only a terminator that ends the sentence moves the marker, so the dot in
 * `Node.js` never does.
 */
function afterSentencePunctuation(markdown: string, at: number): number {
  if (!'.!?'.includes(markdown[at] ?? '')) return at;
  const next = markdown[at + 1];
  return next === undefined || /\s/.test(next) ? at + 1 : at;
}

/**
 * Place `[n]` markers a provider reported as text spans rather than wrote into
 * its own prose. Google's grounding supports are the only source of citation
 * positions on a grounded Gemini turn: the model never sees the numbered list
 * its sources end up in, so its own prose cannot carry numbers that match.
 *
 * A turn whose text already carries a marker is left alone, since the model did
 * cite and a second pass would double every number.
 */
export function insertCitationMarkers(
  markdown: string,
  spans: readonly CitationSpan[],
  citationCount: number,
): string {
  if (!markdown || citationCount <= 0 || spans.length === 0) return markdown;
  if (MARKER_RUN.test(markdown)) {
    MARKER_RUN.lastIndex = 0;
    return markdown;
  }
  MARKER_RUN.lastIndex = 0;

  const fences = fencedRegions(markdown);
  const placed = new Map<number, number[]>();
  for (const span of spans) {
    const declared = Math.trunc(span.endIndex);
    if (!Number.isFinite(declared) || declared <= 0 || declared > markdown.length) continue;
    const at = afterSentencePunctuation(markdown, declared);
    if (fences.some(([start, end]) => at > start && at < end)) continue;
    const numbers = span.positions.filter(
      (n) => Number.isInteger(n) && n >= 1 && n <= citationCount,
    );
    if (numbers.length === 0) continue;
    const existing = placed.get(at) ?? [];
    placed.set(
      at,
      [...new Set([...existing, ...numbers])].sort((a, b) => a - b),
    );
  }
  if (placed.size === 0) return markdown;

  let out = markdown;
  for (const at of [...placed.keys()].sort((a, b) => b - a)) {
    const numbers = placed.get(at) as number[];
    out = `${out.slice(0, at)}${numbers.map((n) => `[${n}]`).join('')}${out.slice(at)}`;
  }
  return out;
}

const CITATION_MARKER_TEXT_PATTERN = /^(?:\[\d{1,3}\])+$/;
const URL_SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:\/\//i;
const WWW_PREFIX = /^www\./;
const TRAILING_SLASHES = /\/+$/;

function bareLinkTextShape(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(URL_SCHEME_PREFIX, '')
    .replace(WWW_PREFIX, '')
    .replace(TRAILING_SLASHES, '');
}

/**
 * A link may collapse into a citation chip only when its visible text carries
 * no words of its own: a `[n]` marker, or the URL or domain repeated as the
 * label. A price, a product name or a sentence is the answer's own text and
 * cannot be swallowed by the chip that annotates it.
 */
export function isCitationOnlyLinkText(text: string, href: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return true;
  if (CITATION_MARKER_TEXT_PATTERN.test(trimmed)) return true;
  const shape = bareLinkTextShape(trimmed);
  if (shape === '') return false;
  if (shape === bareLinkTextShape(href)) return true;
  const domain = registrableDomain(href);
  return domain !== null && shape === domain;
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
