/**
 * The one shape every search result becomes, whatever found it.
 *
 * A retrieval chunk, a web result from one vendor and the same page from
 * another vendor all normalize into `SearchSource`, and all three carry the
 * same `id` when they name the same page, so a citation can be deduplicated,
 * re-verified and rendered the same way on every surface.
 *
 * @module search-provider
 * @packageDocumentation
 */

/** How the bytes behind a source reached the reader. */
export const SOURCE_DELIVERIES = ['live', 'cached', 'indexed', 'external'] as const;

export type SourceDelivery = (typeof SOURCE_DELIVERIES)[number];

export function isSourceDelivery(value: unknown): value is SourceDelivery {
  return typeof value === 'string' && (SOURCE_DELIVERIES as readonly string[]).includes(value);
}

export const SOURCE_FRESHNESS_CLASSES = ['fresh', 'recent', 'stale', 'unknown'] as const;

export type SourceFreshnessClass = (typeof SOURCE_FRESHNESS_CLASSES)[number];

export const SOURCE_FRESH_MAX_AGE_DAYS = 7;
export const SOURCE_RECENT_MAX_AGE_DAYS = 90;

export interface SourceFreshness {
  /** When the publisher says the content was published, ISO 8601 or null. */
  publishedAt: string | null;
  ageDays: number | null;
  class: SourceFreshnessClass;
}

export interface SearchSourceProvenance {
  /** Which registered provider returned this result. */
  providerId: string;
  /** When this system obtained the result. */
  retrievedAt: string;
  /** When the provider indexed the content, null when it does not say. */
  indexedAt: string | null;
  delivery: SourceDelivery;
  freshness: SourceFreshness;
}

export interface SearchSource {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  snippet: string;
  /** Changes when the cited text changes, so a re-verified source is comparable. */
  contentVersion: string;
  provenance: SearchSourceProvenance;
}

const TRACKING_PARAM_PATTERN = /^(utm_[a-z_]+|fbclid|gclid|msclkid|mc_[ce]id|ref)$/i;

/**
 * Scheme- and `www.`-insensitive, tracking parameters and fragment dropped: a
 * publisher serving one article on both schemes is one source, not two.
 */
export function canonicalSourceUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;
    const params = [...parsed.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAM_PATTERN.test(key))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    return `${host}${path}${params ? `?${params}` : ''}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

export function sameSourceUrl(left: string, right: string): boolean {
  return canonicalSourceUrl(left) === canonicalSourceUrl(right);
}

function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash ^ input.charCodeAt(index)) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 64 bits of FNV-1a as hex. Not a security primitive, an identity one. */
export function sourceFingerprint(value: string): string {
  const low = fnv1a(value, 0x811c9dc5);
  const high = fnv1a(`${value}\u0001`, 0x9dc5811c);
  return `${high.toString(16).padStart(8, '0')}${low.toString(16).padStart(8, '0')}`;
}

export interface SearchSourceIdentityInput {
  url: string;
  title?: string;
  snippet?: string;
}

function contentFingerprintInput(input: SearchSourceIdentityInput): string {
  return `${(input.title ?? '').trim().toLowerCase()}\u0000${(input.snippet ?? '').trim().toLowerCase()}`;
}

/**
 * The canonical URL is the identity, because two providers describe the same
 * page with different titles and snippets. A source with no usable URL falls
 * back to its content fingerprint so it still gets a stable id.
 */
export function searchCitationId(input: SearchSourceIdentityInput): string {
  const canonical = canonicalSourceUrl(input.url);
  return canonical
    ? `src_${sourceFingerprint(canonical)}`
    : `src_${sourceFingerprint(contentFingerprintInput(input))}`;
}

/** Identifies the version of the text that was cited, not the page. */
export function sourceContentVersion(input: SearchSourceIdentityInput): string {
  return `v1_${sourceFingerprint(contentFingerprintInput(input))}`;
}

const MS_PER_DAY = 86_400_000;

export function classifySourceFreshness(
  publishedAt: string | null | undefined,
  now: Date = new Date(),
): SourceFreshness {
  const parsed = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  if (!publishedAt || Number.isNaN(parsed)) {
    return { publishedAt: null, ageDays: null, class: 'unknown' };
  }
  const ageDays = Math.max(0, Math.floor((now.getTime() - parsed) / MS_PER_DAY));
  const freshnessClass: SourceFreshnessClass =
    ageDays <= SOURCE_FRESH_MAX_AGE_DAYS
      ? 'fresh'
      : ageDays <= SOURCE_RECENT_MAX_AGE_DAYS
        ? 'recent'
        : 'stale';
  return { publishedAt: new Date(parsed).toISOString(), ageDays, class: freshnessClass };
}

export interface CreateSearchSourceInput extends SearchSourceIdentityInput {
  providerId: string;
  delivery: SourceDelivery;
  retrievedAt: string;
  indexedAt?: string | null;
  publishedAt?: string | null;
  now?: Date;
}

export function createSearchSource(input: CreateSearchSourceInput): SearchSource {
  const now = input.now ?? new Date(input.retrievedAt);
  return {
    id: searchCitationId(input),
    url: input.url,
    canonicalUrl: canonicalSourceUrl(input.url),
    title: input.title ?? '',
    snippet: input.snippet ?? '',
    contentVersion: sourceContentVersion(input),
    provenance: {
      providerId: input.providerId,
      retrievedAt: input.retrievedAt,
      indexedAt: input.indexedAt ?? null,
      delivery: input.delivery,
      freshness: classifySourceFreshness(input.publishedAt, now),
    },
  };
}

const DELIVERY_CONFIDENCE: Readonly<Record<SourceDelivery, number>> = {
  live: 3,
  indexed: 2,
  cached: 1,
  external: 0,
};

/**
 * Two providers returning the same page collapse to one source. The kept entry
 * keeps the weaker delivery claim, so a page one provider served from cache is
 * never upgraded to live by the other's claim.
 */
export function dedupeSearchSources(sources: readonly SearchSource[]): SearchSource[] {
  const byId = new Map<string, SearchSource>();
  for (const source of sources) {
    const existing = byId.get(source.id);
    if (!existing) {
      byId.set(source.id, source);
      continue;
    }
    const weaker =
      DELIVERY_CONFIDENCE[source.provenance.delivery] <
      DELIVERY_CONFIDENCE[existing.provenance.delivery]
        ? source.provenance.delivery
        : existing.provenance.delivery;
    byId.set(source.id, {
      ...existing,
      snippet: existing.snippet || source.snippet,
      title: existing.title || source.title,
      provenance: {
        ...existing.provenance,
        delivery: weaker,
        indexedAt: existing.provenance.indexedAt ?? source.provenance.indexedAt,
        freshness:
          existing.provenance.freshness.class === 'unknown'
            ? source.provenance.freshness
            : existing.provenance.freshness,
      },
    });
  }
  return [...byId.values()];
}

/** The sentence an answer uses so a cached result is never described as live. */
export function sourceDeliveryLabel(delivery: SourceDelivery): string {
  switch (delivery) {
    case 'live':
      return 'fetched live';
    case 'cached':
      return 'from a cached copy';
    case 'indexed':
      return "from the search provider's index";
    case 'external':
      return 'supplied by an external system';
  }
}
