import type { AgentActivityState } from '@agiworkforce/client-runtime';
import type { Citation, WebSearchResult } from './types';

function webAddress(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * The web sources a turn drew on, once each, in the order they arrived. The
 * activity trace says what was searched and how many sources came back; this
 * is the one list of links for the whole turn. A reopened turn has no live
 * activity, so its stored search results alone give the same list.
 */
export function collectTurnCitations(
  activity: AgentActivityState | undefined,
  webSearchResults: readonly WebSearchResult[] | undefined,
): Citation[] {
  const citations = new Map<string, Citation>();
  const add = (source: { url: string; title?: string; snippet?: string; faviconUrl?: string }) => {
    const url = webAddress(source.url);
    if (!url || citations.has(url.href)) return;
    const domain = url.hostname.replace(/^www\./, '');
    citations.set(url.href, {
      id: url.href,
      url: url.href,
      title: source.title?.trim() || domain,
      domain,
      ...(source.snippet ? { snippet: source.snippet } : {}),
      ...(source.faviconUrl ? { faviconUrl: source.faviconUrl } : {}),
    });
  };

  for (const entry of activity?.entries ?? []) {
    if (entry.kind === 'tool' || entry.kind === 'sources') entry.sources?.forEach(add);
  }
  for (const search of webSearchResults ?? []) search.results.forEach(add);

  return [...citations.values()];
}
