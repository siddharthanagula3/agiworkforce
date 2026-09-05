import type { ResearchSource } from '../stores/research-panel-store';
import type { WebSearchResults } from '../types/message-metadata';

const TRACKING_PARAM_PATTERN = /^(utm_[a-z_]+|fbclid|gclid|mc_[ce]id)$/i;

const WWW_PREFIX_PATTERN = /^www\./;
const FAVICON_SERVICE_ORIGIN = 'https://www.google.com/s2/favicons';
const FAVICON_SERVICE_SIZE = 32;

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const MARKER = /(?<!\])\[(\d{1,3})\](?![([:])/g;

function splitInlineCode(segment: string): string[] {
  return segment.split(/(`+[^`]*`+)/);
}

function normalizeUrlKey(url: string | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const params = Array.from(u.searchParams.entries())
      .filter(([key]) => !TRACKING_PARAM_PATTERN.test(key))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const query = params.map(([key, value]) => `${key}=${value}`).join('&');
    return `${host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

export function sourceDisplayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(WWW_PREFIX_PATTERN, '');
  } catch {
    return url;
  }
}

/**
 * A source arrives with a favicon only when the provider supplied one. The
 * shared favicon service resolves the rest from the hostname, so a row never
 * renders a bare bullet where every sibling has a mark.
 */
export function sourceFaviconUrl(url: string, favicon?: string): string | undefined {
  if (favicon) return favicon;
  try {
    const { hostname } = new URL(url);
    return `${FAVICON_SERVICE_ORIGIN}?domain=${hostname}&sz=${FAVICON_SERVICE_SIZE}`;
  } catch {
    return undefined;
  }
}

export interface MessageResearchSourceMetadata {
  searchResults?: WebSearchResults;
  citations?: Array<{ type?: string; cited_text?: string; title?: string; url?: string }>;
}

export interface CollectedMessageSources {
  searchSources: ResearchSource[];
  searchQuery: string | undefined;
  citationsByMarker: ResearchSource[];
}

/**
 * The single reading of a turn's own source list. Both the transcript's
 * citation chips and the AGI Work dock's Sources section resolve a turn to the
 * same rows, in the same order, with the same citation numbers.
 */
export function collectMessageResearchSources(
  metadata: MessageResearchSourceMetadata | undefined,
): CollectedMessageSources {
  const collected: ResearchSource[] = [];
  let searchQuery: string | undefined;

  const searchResults = metadata?.searchResults;
  if (searchResults) {
    searchQuery = Array.isArray(searchResults) ? undefined : searchResults.query;
    const results = Array.isArray(searchResults) ? searchResults : (searchResults.results ?? []);
    results.forEach((result, index) => {
      if (!result.url) return;
      collected.push({
        url: result.url,
        title: result.title || '',
        snippet: result.snippet,
        favicon: result.favicon,
        citationIndex: index + 1,
      });
    });
    if (!Array.isArray(searchResults)) {
      (searchResults.sources ?? []).forEach((url) => {
        if (!url || collected.some((source) => source.url === url)) return;
        collected.push({ url, title: '', citationIndex: collected.length + 1 });
      });
    }
  }

  const annotationCitations = (metadata?.citations ?? []).filter(
    (citation): citation is { url: string; title: string; cited_text?: string; type?: string } =>
      Boolean(citation.url && citation.title),
  );
  if (annotationCitations.length > 0 && collected.length === 0) {
    annotationCitations.forEach((citation, index) => {
      collected.push({
        url: citation.url,
        title: citation.title,
        snippet: citation.cited_text,
        citationIndex: index + 1,
      });
    });
  }

  const deduped = dedupeResearchSources(collected);
  const dedupedByUrl = new Map(deduped.map((source) => [source.url, source]));

  const citationsByMarker =
    annotationCitations.length > 0
      ? annotationCitations.map((citation, index) => ({
          url: citation.url,
          title: citation.title,
          snippet: citation.cited_text,
          citationIndex: index + 1,
        }))
      : collected.map(
          (source, index) =>
            dedupedByUrl.get(source.url) ?? { ...source, citationIndex: index + 1 },
        );

  return { searchSources: deduped, searchQuery, citationsByMarker };
}

export function dedupeResearchSources(sources: ResearchSource[]): ResearchSource[] {
  const byKey = new Map<string, ResearchSource>();

  for (const source of sources) {
    const key = normalizeUrlKey(source?.url);
    if (!key) continue;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...source });
      continue;
    }
    if (!existing.title && source.title) existing.title = source.title;
    if (!existing.snippet && source.snippet) existing.snippet = source.snippet;
    if (!existing.favicon && source.favicon) existing.favicon = source.favicon;
  }

  return Array.from(byKey.values()).map((source, index) => ({
    ...source,
    citationIndex: index + 1,
  }));
}

export function orderSourcesByCitation(
  content: string,
  citationsByMarker: ResearchSource[],
  dedupedSources: ResearchSource[],
): { cited: ResearchSource[]; more: ResearchSource[] } {
  if (dedupedSources.length === 0 || citationsByMarker.length === 0) {
    return { cited: [], more: dedupedSources };
  }

  const citedKeys = new Set<string>();
  const cited: ResearchSource[] = [];
  let insideFence = false;

  for (const line of content.split('\n')) {
    if (FENCE.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    for (const part of splitInlineCode(line)) {
      if (part.startsWith('`')) continue;
      for (const match of part.matchAll(MARKER)) {
        const n = Number(match[1]);
        if (!Number.isInteger(n) || n < 1 || n > citationsByMarker.length) continue;
        const source = citationsByMarker[n - 1];
        if (!source?.url) continue;
        const key = normalizeUrlKey(source.url);
        if (!key || citedKeys.has(key)) continue;
        citedKeys.add(key);
        cited.push(source);
      }
    }
  }

  const more = dedupedSources.filter((source) => {
    const key = normalizeUrlKey(source.url);
    return !key || !citedKeys.has(key);
  });
  return { cited, more };
}
