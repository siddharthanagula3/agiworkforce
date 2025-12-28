import { Globe2, ExternalLink, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { ToolResultProps } from './index';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
  domain?: string;
}

export interface SearchResultData {
  query?: string;
  results?: SearchResult[];
  count?: number;
}

export const InlineSearchResults: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);

  const data = result?.data as SearchResultData | undefined;
  const results = data?.results || [];
  const query = data?.query || '';

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-muted-foreground">Searching web for "{query}"...</span>
      </div>
    );
  }

  if (status === 'error' || !results || results.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <p className="text-sm text-muted-foreground">No search results found</p>
      </div>
    );
  }

  const displayResults = expanded ? results : results.slice(0, 3);

  return (
    <div className="inline-search-results mt-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4" />
          <span>
            {results.length} source{results.length !== 1 ? 's' : ''} found
          </span>
        </div>
        {results.length > 3 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-blue-400 hover:text-blue-300 transition text-xs font-medium"
          >
            Show more ({results.length - 3})
          </button>
        )}
        {expanded && results.length > 3 && (
          <button
            onClick={() => setExpanded(false)}
            className="text-blue-400 hover:text-blue-300 transition text-xs font-medium"
          >
            Show less
          </button>
        )}
      </div>

      {/* Search Results Grid */}
      <div className="space-y-2">
        {displayResults.map((result, index) => (
          <a
            key={index}
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3 p-3 rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border/30 hover:border-blue-500/30 transition"
          >
            {/* Favicon */}
            {result.favicon && (
              <img src={result.favicon} alt="" className="w-4 h-4 mt-1 flex-shrink-0 rounded" />
            )}
            {!result.favicon && (
              <Globe2 className="h-4 w-4 mt-1 flex-shrink-0 text-muted-foreground" />
            )}

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-sm line-clamp-2 group-hover:text-blue-300 transition">
                  {result.title}
                </div>
                <ExternalLink className="h-3 w-3 flex-shrink-0 mt-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
              </div>

              {/* Domain */}
              {result.domain && (
                <div className="text-xs text-muted-foreground">{result.domain}</div>
              )}

              {/* Snippet */}
              <p className="text-xs text-muted-foreground line-clamp-2">{result.snippet}</p>
            </div>

            {/* Citation number */}
            <div className="flex-shrink-0 text-xs font-mono text-muted-foreground bg-surface-base px-2 py-1 rounded">
              [{index + 1}]
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
