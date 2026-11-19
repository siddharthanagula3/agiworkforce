import {
  citationSpansFromAnchors,
  deliveredCitationSpans,
  insertCitationMarkers,
  normalizeCitationUrl,
  readCitationSpans,
  type CitationAnchor,
  type CitationSpan,
} from '@agiworkforce/unified-chat/citation-markers';

interface SourceUrl {
  readonly url: string;
}

export interface InlineCitationMarkers {
  recordCitation(url: string, sources: readonly SourceUrl[], contentLength: number): void;
  recordSearchResults(block: unknown): void;
  hasPlacements(): boolean;
  apply(content: string, sources: readonly SourceUrl[], settled: boolean): string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function urlKey(url: string): string {
  return normalizeCitationUrl(url) ?? url;
}

function searchResultUrls(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((entry) => {
    if (!isRecord(entry) || entry['type'] !== 'web_search_result') return [];
    const url = entry['url'];
    return typeof url === 'string' && url ? [url] : [];
  });
}

/**
 * A resumed turn passes the text it already had: that text already carries its
 * markers, and a second pass over it would see them and place nothing new.
 * While the answer streams, a claim waits until the character after its full
 * stop has arrived: `$3.` may still become `$3.5`, so a marker never hops along
 * with the text.
 */
export function createInlineCitationMarkers(resumedContent = ''): InlineCitationMarkers {
  const anchors: CitationAnchor[] = [];
  let providerSpans: { spans: CitationSpan[]; urls: string[] } | null = null;

  return {
    recordCitation(url, sources, contentLength) {
      const offset = contentLength - resumedContent.length;
      if (offset < 0) return;
      const key = urlKey(url);
      const marker = sources.findIndex((source) => urlKey(source.url) === key) + 1;
      if (marker > 0) anchors.push({ offset, marker });
    },
    recordSearchResults(block) {
      if (!isRecord(block)) return;
      const spans = readCitationSpans(block['citation_spans']);
      const urls = searchResultUrls(block['content']);
      if (spans.length > 0 && urls.length > 0) providerSpans = { spans, urls };
    },
    hasPlacements() {
      return providerSpans !== null || anchors.length > 0;
    },
    apply(content, sources, settled) {
      if (!content.startsWith(resumedContent) || sources.length === 0) return content;
      const added = content.slice(resumedContent.length);
      const spans = providerSpans
        ? deliveredCitationSpans(
            providerSpans.spans,
            providerSpans.urls,
            sources.map((source) => source.url),
          )
        : citationSpansFromAnchors(added, anchors);
      const placed = settled ? spans : spans.filter((span) => span.endIndex < added.length - 1);
      if (placed.length === 0) return content;
      return resumedContent + insertCitationMarkers(added, placed, sources.length);
    },
  };
}
