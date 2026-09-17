import type { SearchHit, SearchSourceKind } from '@agiworkforce/data-layer/search';

export const SEARCH_SNIPPET_CHARS = 240;

export interface SearchDocumentResult {
  type: SearchSourceKind;
  sourceId: string;
  title: string;
  href: string;
  snippet: string;
  matchedTerms: string[];
  score: number;
  messageId?: string;
  indexedAt: string | null;
}

function metadataString(hit: SearchHit, key: string): string | null {
  const value = hit.metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function hrefFor(hit: SearchHit): string {
  const id = encodeURIComponent(hit.sourceId);
  switch (hit.sourceKind) {
    case 'conversation': {
      const messageId = metadataString(hit, 'messageId');
      return messageId
        ? `/chat/${id}?highlightMessage=${encodeURIComponent(messageId)}`
        : `/chat/${id}`;
    }
    case 'artifact':
    case 'research_report': {
      const conversationId = metadataString(hit, 'conversationId');
      if (conversationId) return `/chat/${encodeURIComponent(conversationId)}`;
      return hit.sourceKind === 'artifact' ? '/chat/artifacts' : '/chat';
    }
    case 'developer_session':
      return `/code/${id}`;
    case 'project_knowledge': {
      const projectId = metadataString(hit, 'projectId');
      return projectId ? `/chat/projects/${encodeURIComponent(projectId)}` : '/chat/projects';
    }
    case 'library_file':
      return '/chat/library';
  }
}

function snippetFor(hit: SearchHit): string {
  const text = hit.text.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const firstMatch = hit.matchedTerms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  const start = Math.max(0, (firstMatch ?? 0) - SEARCH_SNIPPET_CHARS / 4);
  const snippet = text.slice(start, start + SEARCH_SNIPPET_CHARS);
  return `${start > 0 ? '…' : ''}${snippet}${start + SEARCH_SNIPPET_CHARS < text.length ? '…' : ''}`;
}

/** One result per source, carrying the best passage the index found for it. */
export function toSearchDocumentResults(hits: readonly SearchHit[]): SearchDocumentResult[] {
  const seen = new Set<string>();
  const results: SearchDocumentResult[] = [];
  for (const hit of hits) {
    const key = `${hit.sourceKind}:${hit.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const messageId = metadataString(hit, 'messageId');
    results.push({
      type: hit.sourceKind,
      sourceId: hit.sourceId,
      title: hit.title,
      href: hrefFor(hit),
      snippet: snippetFor(hit),
      matchedTerms: hit.matchedTerms,
      score: hit.score,
      ...(messageId ? { messageId } : {}),
      indexedAt: hit.indexedAt,
    });
  }
  return results;
}
