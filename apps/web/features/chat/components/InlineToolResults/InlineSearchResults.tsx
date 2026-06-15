'use client';

/**
 * InlineSearchResults
 *
 * Renders web search results matching the Claude reference design (image 381):
 * - Status line: Search icon + query text + "N results" count right-aligned
 * - One rounded container listing result rows: favicon + title + domain right-aligned muted
 * - No snippet text in the result rows (matches reference visual)
 *
 * Supports expand/collapse for results beyond the initial visible set.
 */

import { useState, useMemo } from 'react';
import { Globe, Loader2, Search } from 'lucide-react';
import type { ToolResultProps } from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
  domain?: string;
  position?: number;
}

interface SearchResultData {
  query?: string;
  results?: SearchResult[];
  count?: number;
  provider?: string;
  duration_ms?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function getFaviconUrl(url: string): string | undefined {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Search result row · Claude-reference layout (image 381):
// favicon + title (flex-1, truncated) + domain (right-aligned, muted)
// No snippet visible in the row.
// ---------------------------------------------------------------------------

function SearchResultRow({ result }: { result: SearchResult }) {
  const [imgError, setImgError] = useState(false);

  return (
    <a
      href={/^https?:\/\//i.test(result.url || '') ? result.url : '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 py-1.5 min-w-0 hover:opacity-80 transition-opacity"
    >
      {/* Favicon */}
      {result.favicon && !imgError ? (
        <img
          src={result.favicon}
          alt=""
          className="h-3.5 w-3.5 shrink-0 rounded-sm"
          onError={() => setImgError(true)}
        />
      ) : (
        <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      {/* Title: truncated, takes remaining space */}
      <span className="flex-1 truncate text-xs text-foreground">{result.title || 'Untitled'}</span>
      {/* Domain: right-aligned, muted */}
      {result.domain && (
        <span className="shrink-0 text-[10px] text-muted-foreground/60 ml-2">{result.domain}</span>
      )}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const InlineSearchResults: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);
  const INITIAL_VISIBLE = 4;

  const data = result?.data as SearchResultData | undefined;
  const query = data?.query || '';

  const processedResults = useMemo(() => {
    const raw = data?.results || [];
    return raw.map((r, idx) => ({
      ...r,
      position: r.position ?? idx + 1,
      domain: r.domain || extractDomain(r.url),
      favicon: r.favicon || getFaviconUrl(r.url),
    }));
  }, [data?.results]);

  // Running state
  if (status === 'running') {
    return (
      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        <span>
          {query ? (
            <>
              <Search className="inline h-3 w-3 mr-1" aria-hidden="true" />
              {query}
            </>
          ) : (
            'Searching the web...'
          )}
        </span>
      </div>
    );
  }

  // Error state
  if (status === 'error' || status === 'failed' || data?.error) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span>{data?.error || result?.error || 'Search failed'}</span>
      </div>
    );
  }

  // Empty results
  if (processedResults.length === 0) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span>No results{query ? ` for "${query}"` : ''}</span>
      </div>
    );
  }

  const displayResults = expanded ? processedResults : processedResults.slice(0, INITIAL_VISIBLE);
  const hasMore = processedResults.length > INITIAL_VISIBLE;

  return (
    <div className="mt-2 space-y-1.5">
      {/* Status line: Search icon + query text + result count at right (image 381) */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">{query || 'Web search'}</span>
        <span className="shrink-0 text-xs text-muted-foreground/70">
          {processedResults.length} result{processedResults.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Results container: one rounded box, rows inside (image 381) */}
      <div className="rounded-lg border border-border/40 bg-muted/10 overflow-hidden">
        <div className="divide-y divide-border/20 px-3">
          {displayResults.map((r, i) => (
            <SearchResultRow key={`${r.url}-${i}`} result={r} />
          ))}
        </div>

        {/* Show more / less toggle */}
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground border-t border-border/20 transition-colors"
          >
            {expanded ? 'Show less' : `Show ${processedResults.length - INITIAL_VISIBLE} more`}
          </button>
        )}
      </div>
    </div>
  );
};
