import type { ResearchSource } from '../stores/research-panel-store';

const TRACKING_PARAM_PATTERN = /^(utm_[a-z_]+|fbclid|gclid|mc_[ce]id)$/i;

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
