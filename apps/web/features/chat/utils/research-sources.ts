import type { ResearchSource } from '../stores/research-panel-store';

const TRACKING_PARAM_PATTERN = /^(utm_[a-z_]+|fbclid|gclid|mc_[ce]id)$/i;

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

  const citedUrls = new Set<string>();
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
        if (!source?.url || citedUrls.has(source.url)) continue;
        citedUrls.add(source.url);
        cited.push(source);
      }
    }
  }

  const more = dedupedSources.filter((source) => !citedUrls.has(source.url));
  return { cited, more };
}
