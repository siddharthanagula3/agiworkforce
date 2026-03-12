/**
 * SearchResultsRenderer - A standalone component for displaying web search results
 *
 * Features:
 * - Clean card-based layout
 * - Clickable links that open in browser
 * - Favicon display with fallback
 * - Provider and timing information
 * - Expandable results list
 * - Loading and error states
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Globe2,
  ExternalLink,
  Loader2,
  Search,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

// Types
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
  domain?: string;
  position?: number;
}

export interface SearchResultsData {
  query: string;
  results: SearchResult[];
  count: number;
  provider: string;
  duration_ms?: number;
  error?: string;
}

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface SearchResultsRendererProps {
  /** Search results data */
  data?: SearchResultsData;
  /** Current search status */
  status?: SearchStatus;
  /** Initial number of results to show */
  initialDisplayCount?: number;
  /** Show the search query in the header */
  showQuery?: boolean;
  /** Show provider and timing info */
  showMetadata?: boolean;
  /** Custom class name */
  className?: string;
  /** Callback when a result is clicked */
  onResultClick?: (result: SearchResult, index: number) => void;
  /** Callback to retry search */
  onRetry?: () => void;
}

export const SearchResultsRenderer: React.FC<SearchResultsRendererProps> = ({
  data,
  status = 'idle',
  initialDisplayCount = 5,
  showQuery = true,
  showMetadata = true,
  className = '',
  onResultClick,
  onRetry,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const query = data?.query || '';
  const provider = data?.provider || 'Search';
  const durationMs = data?.duration_ms;

  // Memoize results to avoid dependency issues
  const results = useMemo(() => data?.results || [], [data?.results]);

  // Process results with fallback values
  const processedResults = useMemo(() => {
    return results.map((r, idx) => ({
      ...r,
      position: r.position || idx + 1,
      domain: r.domain || extractDomain(r.url),
      favicon: r.favicon || getFaviconUrl(r.url),
    }));
  }, [results]);

  const displayResults = expanded
    ? processedResults
    : processedResults.slice(0, initialDisplayCount);

  const hasMoreResults = processedResults.length > initialDisplayCount;

  const handleCopyUrl = useCallback((url: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    toast.success('URL copied to clipboard');
    setTimeout(() => setCopiedUrl(null), 2000);
  }, []);

  const handleResultClick = useCallback(
    (result: SearchResult, index: number, e: React.MouseEvent) => {
      if (onResultClick) {
        e.preventDefault();
        onResultClick(result, index);
      }
      // Otherwise let the default link behavior work
    },
    [onResultClick],
  );

  // Loading state
  if (status === 'loading') {
    return (
      <div className={`search-results-renderer ${className}`}>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-elevated border border-border/50">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Searching the web...</span>
            {query && (
              <span className="text-xs text-muted-foreground">Query: &quot;{query}&quot;</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error' || data?.error) {
    return (
      <div className={`search-results-renderer ${className}`}>
        <div className="p-4 rounded-xl bg-surface-elevated border border-destructive/30">
          <div className="flex items-start gap-3">
            <Search className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-300 mb-1">Search Failed</h4>
              <p className="text-xs text-muted-foreground mb-3">
                {data?.error || 'Unable to perform web search. Please try again.'}
              </p>
              {onRetry && (
                <button type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry search
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No results state
  if (!results || results.length === 0) {
    return (
      <div className={`search-results-renderer ${className}`}>
        <div className="p-4 rounded-xl bg-surface-elevated border border-border/50">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <div>
              <h4 className="text-sm font-medium text-foreground">No results found</h4>
              {query && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  No results for &quot;{query}&quot;. Try a different search term.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state with results
  return (
    <div className={`search-results-renderer ${className}`}>
      {/* Header Section */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          {/* Result count */}
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium text-foreground">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Provider and timing */}
          {showMetadata && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-amber-400" />
                <span>{provider}</span>
              </div>
              {durationMs !== undefined && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{durationMs}ms</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expand/Collapse button */}
        {hasMoreResults && (
          <button type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 transition"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Show all ({processedResults.length})
              </>
            )}
          </button>
        )}
      </div>

      {/* Query display */}
      {showQuery && query && (
        <div className="mb-3 text-xs text-muted-foreground bg-surface-base/50 rounded-lg px-3 py-2 inline-flex items-center gap-2">
          <Search className="h-3.5 w-3.5" />
          <span className="font-mono">&quot;{query}&quot;</span>
        </div>
      )}

      {/* Results List */}
      <div className="space-y-2">
        {displayResults.map((result, index) => (
          <SearchResultCard
            key={`${result.url}-${index}`}
            result={result}
            isCopied={copiedUrl === result.url}
            onCopy={(e) => handleCopyUrl(result.url, e)}
            onClick={(e) => handleResultClick(result, index, e)}
          />
        ))}
      </div>

      {/* Show more indicator */}
      {!expanded && hasMoreResults && (
        <div className="mt-3 text-center">
          <button type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            + {processedResults.length - initialDisplayCount} more results
          </button>
        </div>
      )}
    </div>
  );
};

// Individual result card component
interface SearchResultCardProps {
  result: SearchResult;
  isCopied: boolean;
  onCopy: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}

const SearchResultCard: React.FC<SearchResultCardProps> = ({
  result,
  isCopied,
  onCopy,
  onClick,
}) => {
  const [imageError, setImageError] = useState(false);

  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="group flex items-start gap-3 p-3 rounded-xl bg-surface-elevated hover:bg-surface-hover border border-border/30 hover:border-blue-500/40 transition-all duration-200 block"
    >
      {/* Favicon */}
      <div className="shrink-0 mt-0.5">
        {result.favicon && !imageError ? (
          <img
            src={result.favicon}
            alt=""
            className="w-6 h-6 rounded-md"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-6 h-6 rounded-md bg-surface-base flex items-center justify-center">
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Title */}
        <h4 className="font-medium text-sm text-foreground line-clamp-2 group-hover:text-blue-300 transition leading-snug">
          {result.title || 'Untitled'}
        </h4>

        {/* Domain */}
        {result.domain && (
          <div className="text-xs text-emerald-400/90 font-medium">{result.domain}</div>
        )}

        {/* Snippet */}
        {result.snippet && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {result.snippet}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-2">
        {/* Copy URL button */}
        <button type="button"
          onClick={onCopy}
          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-surface-base transition"
          title="Copy URL"
        >
          {isCopied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        {/* External link indicator */}
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />

        {/* Position badge */}
        {result.position && (
          <div className="text-xs font-mono text-muted-foreground bg-surface-base px-2 py-1 rounded-md opacity-50 group-hover:opacity-100 transition">
            {result.position}
          </div>
        )}
      </div>
    </a>
  );
};

// Helper functions
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

export default SearchResultsRenderer;
