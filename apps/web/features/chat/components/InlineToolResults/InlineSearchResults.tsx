'use client';

/**
 * InlineSearchResults
 *
 * Renders web search results as a list of cards, each with:
 * - Favicon (from Google's favicon service)
 * - Title (clickable, links to source URL)
 * - Domain
 * - Snippet preview
 *
 * Supports expand/collapse for results beyond the initial 3.
 */

import { useState, useMemo } from 'react';
import { Globe, ExternalLink, Loader2, Search, Clock, Zap } from 'lucide-react';
import { cn } from '@shared/lib/utils';
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
// Search result card
// ---------------------------------------------------------------------------

function SearchResultCard({ result }: { result: SearchResult }) {
  const [imgError, setImgError] = useState(false);

  return (
    <a
      href={/^https?:\/\//i.test(result.url || '') ? result.url : '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex items-start gap-3 p-3 rounded-lg',
        'bg-muted/30 hover:bg-muted/50',
        'border border-border/30 hover:border-primary/30',
        'transition-all duration-150',
      )}
    >
      {/* Favicon */}
      <div className="shrink-0 mt-0.5">
        {result.favicon && !imgError ? (
          <img
            src={result.favicon}
            alt=""
            className="w-5 h-5 rounded"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-5 h-5 rounded bg-muted flex items-center justify-center">
            <Globe className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
            {result.title || 'Untitled'}
          </h4>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {result.domain && (
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {result.domain}
          </div>
        )}

        {result.snippet && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {result.snippet}
          </p>
        )}
      </div>

      {/* Position badge */}
      {result.position != null && (
        <div className="shrink-0 text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded opacity-60 group-hover:opacity-100 transition-opacity">
          [{result.position}]
        </div>
      )}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const InlineSearchResults: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);

  const data = result?.data as SearchResultData | undefined;
  const query = data?.query || '';
  const provider = data?.provider || 'Web Search';
  const durationMs = data?.duration_ms;

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
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg border border-border/50 bg-muted/20">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        <span className="text-sm text-muted-foreground">
          Searching the web for &quot;{query}&quot;...
        </span>
      </div>
    );
  }

  // Error state
  if (status === 'error' || status === 'failed' || data?.error) {
    return (
      <div className="mt-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
        <div className="flex items-center gap-2 mb-1">
          <Search className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">Search Failed</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {data?.error || result?.error || 'Unable to perform web search'}
        </p>
      </div>
    );
  }

  // Empty results
  if (processedResults.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg border border-border/50 bg-muted/20">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            No results found{query ? ` for "${query}"` : ''}
          </span>
        </div>
      </div>
    );
  }

  const displayResults = expanded ? processedResults : processedResults.slice(0, 3);

  return (
    <div className="mt-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Globe className="h-4 w-4 text-blue-500" />
            <span className="font-medium text-foreground">
              {processedResults.length} result{processedResults.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground/60">
            <Zap className="h-3 w-3" />
            <span>{provider}</span>
          </div>
          {durationMs != null && (
            <div className="flex items-center gap-1 text-muted-foreground/60">
              <Clock className="h-3 w-3" />
              <span>{durationMs}ms</span>
            </div>
          )}
        </div>

        {processedResults.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-primary hover:text-primary/80 transition text-xs font-medium"
          >
            {expanded ? 'Show less' : `Show all (${processedResults.length})`}
          </button>
        )}
      </div>

      {/* Query */}
      {query && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 inline-flex items-center gap-1.5">
          <Search className="h-3 w-3" />
          <span className="font-mono">{query}</span>
        </div>
      )}

      {/* Results list */}
      <div className="space-y-2">
        {displayResults.map((r, i) => (
          <SearchResultCard key={`${r.url}-${i}`} result={r} />
        ))}
      </div>
    </div>
  );
};
