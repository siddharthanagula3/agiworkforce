import type { ResearchSource } from '../stores/research-panel-store';

/**
 * Normalize a URL into a stable dedupe key: lowercase host, no hash, no trailing
 * slash. Returns null for empty/blank input so callers can drop it gracefully.
 * Non-parseable strings are trimmed and used verbatim as their own key.
 */
function normalizeUrlKey(url: string | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    return `${host}${path}${u.search}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

/**
 * De-duplicate web-search / research sources by URL and assign stable, sequential
 * 1-based citation indices (claude.ai parity: a source cited twice keeps ONE
 * number). Rules:
 *  - Entries without a usable URL are dropped (graceful when metadata is missing).
 *  - The FIRST occurrence of a URL wins ordering; later duplicates only fill in
 *    any missing title / snippet / favicon, they never get a new number.
 *  - `citationIndex` is (re)assigned by post-dedupe position so numbering is
 *    stable regardless of how the raw list was collected.
 */
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
