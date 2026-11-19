import type { AgentEventSource } from '@agiworkforce/types';
import { normalizeSourceUrlKey } from '@agiworkforce/utils/source-url';

export interface MessageResearchSource extends AgentEventSource {
  favicon?: string;
  publishedDate?: string;
  retrievedAt?: string;
  citationIndex?: number;
}

export interface MessageSearchResult {
  title: string;
  url: string;
  snippet?: unknown;
  publishedDate?: string;
  retrievedAt?: string;
  provenance?: { retrievedAt?: string };
  favicon?: string;
}

export interface MessageSearchResponse {
  query?: string;
  results?: MessageSearchResult[];
  sources?: string[];
}

export type MessageSearchResults = MessageSearchResponse | MessageSearchResult[];

export interface MessageResearchSourceMetadata {
  searchResults?: MessageSearchResults;
  citations?: Array<{ type?: string; cited_text?: string; title?: string; url?: string }>;
}

export interface CollectedMessageSources {
  searchSources: MessageResearchSource[];
  searchQuery: string | undefined;
  citationsByMarker: MessageResearchSource[];
}

const MIN_ENCODED_RUN_CHARS = 64;
const ENCODED_RUN = /[A-Za-z0-9+/=_-]+/g;
const CONTROL_CHARACTERS = /[^\P{Cc}\t\n\r]/gu;
const SEPARATOR_CHARACTERS = /[-_]/g;
const MAX_SEPARATOR_SHARE = 0.05;
const MIN_OPAQUE_SHARE = 0.5;

function isEncodedRun(run: string): boolean {
  if (run.length < MIN_ENCODED_RUN_CHARS) return false;
  if (!/[A-Z]/.test(run) || !/[a-z]/.test(run) || !/[0-9]/.test(run)) return false;
  const separators = run.match(SEPARATOR_CHARACTERS)?.length ?? 0;
  return separators / run.length < MAX_SEPARATOR_SHARE;
}

function isOpaque(text: string): boolean {
  const visible = text.replace(/\s+/g, '').length;
  if (visible === 0) return false;
  let encoded = 0;
  for (const [run] of text.matchAll(ENCODED_RUN)) {
    if (isEncodedRun(run)) encoded += run.length;
  }
  return encoded / visible >= MIN_OPAQUE_SHARE;
}

// A native search result reuses the snippet field for the provider's opaque
// encrypted_content token; it is never shown, receipted or persisted for display.
export function displaySourceSnippet(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(CONTROL_CHARACTERS, '').trim();
  return text && !isOpaque(text) ? text : '';
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const MARKER = /(?<!\[)\[(\d{1,3})\](?![(:]|\[(?!\d{1,3}\]))/g;

function splitInlineCode(segment: string): string[] {
  return segment.split(/(`+[^`]*`+)/);
}

function normalizeUrlKey(url: string | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return normalizeSourceUrlKey(trimmed);
}

export function collectMessageResearchSources(
  metadata: MessageResearchSourceMetadata | undefined,
): CollectedMessageSources {
  const collected: MessageResearchSource[] = [];
  let searchQuery: string | undefined;

  const searchResults = metadata?.searchResults;
  if (searchResults) {
    searchQuery = Array.isArray(searchResults) ? undefined : searchResults.query;
    const results = Array.isArray(searchResults) ? searchResults : (searchResults.results ?? []);
    results.forEach((result, index) => {
      if (!result.url) return;
      const snippet = displaySourceSnippet(result.snippet);
      const retrievedAt = result.retrievedAt ?? result.provenance?.retrievedAt;
      collected.push({
        url: result.url,
        title: result.title || '',
        ...(snippet ? { snippet } : {}),
        favicon: result.favicon,
        ...(result.publishedDate ? { publishedDate: result.publishedDate } : {}),
        ...(retrievedAt ? { retrievedAt } : {}),
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
  // Native search delivers the pages searched and the pages cited as two lists
  // that only partly overlap; a cited page missing from the search list must
  // still count as a source and resolve its [n] marker.
  const collectedKeys = new Set(
    collected.flatMap((source) => {
      const key = normalizeUrlKey(source.url);
      return key ? [key] : [];
    }),
  );
  for (const citation of annotationCitations) {
    const key = normalizeUrlKey(citation.url);
    if (key && collectedKeys.has(key)) continue;
    if (key) collectedKeys.add(key);
    collected.push({
      url: citation.url,
      title: citation.title,
      snippet: citation.cited_text,
      citationIndex: collected.length + 1,
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

export function dedupeResearchSources<T extends MessageResearchSource>(
  sources: readonly T[],
): Array<T & { citationIndex: number }> {
  const byKey = new Map<string, T>();

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

export function orderSourcesByCitation<T extends MessageResearchSource>(
  content: string,
  citationsByMarker: readonly T[],
  dedupedSources: readonly T[],
): { cited: T[]; more: T[] } {
  if (dedupedSources.length === 0 || citationsByMarker.length === 0) {
    return { cited: [], more: [...dedupedSources] };
  }

  const citedKeys = new Set<string>();
  const cited: T[] = [];
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
