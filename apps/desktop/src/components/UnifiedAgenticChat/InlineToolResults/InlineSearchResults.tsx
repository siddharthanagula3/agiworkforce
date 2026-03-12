import { Globe2, ExternalLink, Loader2, Search, Clock, Zap } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import type { ToolResultProps } from './index';
import { useUnifiedChatStore } from '../../../stores/unifiedChatStore';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
  domain?: string;
  position?: number;
}

export interface SearchResultData {
  query?: string;
  results?: SearchResult[];
  count?: number;
  provider?: string;
  duration_ms?: number;
  error?: string;
}

export const InlineSearchResults: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);

  const data = result?.data as SearchResultData | undefined;
  const query = data?.query || '';
  const provider = data?.provider || 'Web Search';
  const durationMs = data?.duration_ms;

  // Memoize results to avoid dependency issues
  const results = useMemo(() => data?.results || [], [data?.results]);

  // Memoize processed results with fallback favicons
  const processedResults = useMemo(() => {
    return results.map((r, idx) => ({
      ...r,
      position: r.position || idx + 1,
      domain: r.domain || extractDomain(r.url),
      favicon: r.favicon || getFaviconUrl(r.url),
    }));
  }, [results]);

  // Get citation management functions from store
  const addCitation = useUnifiedChatStore((state) => state.addCitation);
  const getCitationByIndex = useUnifiedChatStore((state) => state.getCitationByIndex);

  // Register search results as citations when results are available
  // This allows the AI's response to use [1], [2], etc. references
  useEffect(() => {
    if (status === 'completed' && processedResults.length > 0) {
      processedResults.forEach((searchResult) => {
        const index = searchResult.position;
        // Only add if citation doesn't already exist for this index
        const existing = getCitationByIndex(index);
        if (!existing) {
          addCitation({
            index,
            url: searchResult.url,
            title: searchResult.title,
            snippet: searchResult.snippet,
            favicon: searchResult.favicon,
          });
        }
      });
    }
  }, [status, processedResults, addCitation, getCitationByIndex]);

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-muted-foreground">
          Searching the web for &quot;{query}&quot;...
        </span>
      </div>
    );
  }

  if (status === 'error' || data?.error) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-center gap-2 mb-1">
          <Search className="h-4 w-4 text-red-400" />
          <span className="text-sm font-medium text-red-300">Search Failed</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {data?.error || 'Unable to perform web search'}
        </p>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <div className="flex items-center gap-2 mb-1">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            No results found for &quot;{query}&quot;
          </span>
        </div>
      </div>
    );
  }

  const displayResults = expanded ? processedResults : processedResults.slice(0, 3);

  return (
    <div className="inline-search-results mt-3 space-y-2">
      {/* Header with provider info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-blue-400" />
            <span className="font-medium">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Zap className="h-3 w-3" />
            <span>{provider}</span>
          </div>
          {durationMs !== undefined && (
            <div className="flex items-center gap-1 text-zinc-500">
              <Clock className="h-3 w-3" />
              <span>{durationMs}ms</span>
            </div>
          )}
        </div>

        {results.length > 3 && (
          <button type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-blue-400 hover:text-blue-300 transition text-xs font-medium"
          >
            {expanded ? 'Show less' : `Show more (${results.length - 3})`}
          </button>
        )}
      </div>

      {/* Query display */}
      {query && (
        <div className="text-xs text-muted-foreground bg-surface-base/50 rounded px-2 py-1 inline-flex items-center gap-1.5">
          <Search className="h-3 w-3" />
          <span className="font-mono">{query}</span>
        </div>
      )}

      {/* Search Results List */}
      <div className="space-y-2">
        {displayResults.map((searchResult, index) => (
          <SearchResultCard key={index} result={searchResult} />
        ))}
      </div>
    </div>
  );
};

interface SearchResultCardProps {
  result: SearchResult;
}

const SearchResultCard: React.FC<SearchResultCardProps> = ({ result }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <a
      href={/^https?:\/\//i.test(result.url || '') ? result.url : '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 p-3 rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border/30 hover:border-blue-500/30 transition-all duration-200"
    >
      {/* Favicon */}
      <div className="shrink-0 mt-0.5">
        {result.favicon && !imageError ? (
          <img
            src={result.favicon}
            alt=""
            className="w-5 h-5 rounded"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-5 h-5 rounded bg-surface-base flex items-center justify-center">
            <Globe2 className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Title Row */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm text-foreground line-clamp-2 group-hover:text-blue-300 transition">
            {result.title || 'Untitled'}
          </h4>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
        </div>

        {/* Domain */}
        {result.domain && (
          <div className="text-xs text-emerald-400/80 font-medium">{result.domain}</div>
        )}

        {/* Snippet */}
        {result.snippet && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {result.snippet}
          </p>
        )}
      </div>

      {/* Position badge */}
      {result.position && (
        <div className="shrink-0 text-xs font-mono text-muted-foreground bg-surface-base px-2 py-1 rounded opacity-60 group-hover:opacity-100 transition">
          [{result.position}]
        </div>
      )}
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
