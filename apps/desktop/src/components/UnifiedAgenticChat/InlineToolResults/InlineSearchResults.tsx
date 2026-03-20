import {
  Globe2,
  ExternalLink,
  Loader2,
  Search,
  Clock,
  Zap,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ToolResultProps } from './index';
import { useUnifiedChatStore } from '../../../stores/unifiedChatStore';
import { cn } from '@/lib/utils';

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

interface CollapsibleSearchHeaderProps {
  siteCount: number;
  query: string;
  durationMs: number | undefined;
  isCollapsed: boolean;
  onToggle: () => void;
}

const CollapsibleSearchHeader: React.FC<CollapsibleSearchHeaderProps> = ({
  siteCount,
  query,
  durationMs,
  isCollapsed,
  onToggle,
}) => {
  const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 rounded-lg',
        'bg-surface-elevated border border-border/50',
        'hover:bg-surface-hover hover:border-border/80 transition-all duration-150',
        'text-left',
      )}
    >
      <Globe2 className="h-4 w-4 shrink-0 text-blue-400" />
      <span className="text-sm font-medium text-foreground">
        Searched {siteCount} site{siteCount !== 1 ? 's' : ''}
      </span>
      {query && (
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          &mdash; {query}
        </span>
      )}
      {durationMs !== undefined && (
        <span className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
          <Clock className="h-3 w-3" />
          {durationMs}ms
        </span>
      )}
      <ChevronIcon className="h-4 w-4 shrink-0 text-muted-foreground ml-auto" />
    </button>
  );
};

export const InlineSearchResults: React.FC<ToolResultProps> = ({ result, status }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);

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
  //
  // addCitation and getCitationByIndex are Zustand store actions. Zustand
  // guarantees that action references are stable across renders (they are
  // defined once on the store object and never replaced), so including them
  // in the deps array would cause the effect to re-run on every store change
  // whenever the store returns a new selector function reference. Omitting
  // them is safe and intentional.
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
    // addCitation + getCitationByIndex intentionally omitted — stable Zustand actions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, processedResults]);

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-elevated border border-border/50">
        <Globe2 className="h-4 w-4 shrink-0 text-blue-400" />
        <span className="text-sm text-muted-foreground flex-1">Searching the web...</span>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
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

  return (
    <div className="inline-search-results mt-3 space-y-2">
      {/* Collapsible header — always visible when completed */}
      <CollapsibleSearchHeader
        siteCount={processedResults.length}
        query={query}
        durationMs={durationMs}
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed((prev) => !prev)}
      />

      {/* Animated results panel */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="search-results-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-2 pt-1">
              {/* Provider + query meta row */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <Zap className="h-3 w-3" />
                  <span>{provider}</span>
                </div>
                {query && (
                  <div className="flex items-center gap-1.5 bg-surface-base/50 rounded px-2 py-0.5">
                    <Search className="h-3 w-3" />
                    <span className="font-mono">{query}</span>
                  </div>
                )}
              </div>

              {/* Search result cards */}
              {processedResults.map((searchResult, index) => (
                <SearchResultCard key={index} result={searchResult} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
