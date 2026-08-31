import { useState } from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import type { WebSearchResultItem } from '../lib/types';

export type { WebSearchResultItem } from '../lib/types';

export interface WebSearchCardProps {
  query: string;
  resultCount: number;
  results: WebSearchResultItem[];
  showMoreThreshold?: number;
  defaultOpen?: boolean;
  className?: string;
}

export function WebSearchCard({
  query,
  resultCount,
  results,
  showMoreThreshold = 4,
  defaultOpen = true,
  className,
}: WebSearchCardProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [showAll, setShowAll] = useState<boolean>(false);

  const visibleResults = showAll ? results : results.slice(0, showMoreThreshold);
  const hiddenCount = Math.max(0, results.length - showMoreThreshold);
  const hasHidden = !showAll && hiddenCount > 0;

  return (
    <div className={cn('web-search-card flex flex-col my-1', className)} data-query={query}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Web search: ${query}, ${resultCount} results`}
        className={cn(
          'web-search-card__header',
          'flex items-center gap-2 select-none',
          'h-7 px-1 rounded-md text-left w-full',
          'cursor-pointer hover:bg-[color:var(--bg-hover,rgba(0,0,0,0.04))]',
          'transition-colors duration-100',
        )}
      >
        <Globe
          size={13}
          strokeWidth={2}
          className="shrink-0 text-[color:var(--chat-text-muted,#8b8680)]"
          aria-hidden="true"
        />
        <span className="flex-1 min-w-0 truncate text-sm text-[color:var(--chat-text-secondary,inherit)]">
          {query}
        </span>
        {/* Result count badge */}
        <span className="web-search-card__count shrink-0 text-[12px] text-[color:var(--chat-text-muted,#8b8680)] tabular-nums">
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2}
          className={cn(
            'shrink-0 text-[color:var(--chat-text-muted,#8b8680)]',
            'transition-transform duration-150',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {/* Results panel */}
      {open && results.length > 0 ? (
        <div
          className={cn(
            'web-search-card__results',
            'mt-1 rounded-lg overflow-hidden',
            'border border-[color:var(--border-subtle,rgba(0,0,0,0.08))]',
            'bg-[color:var(--bg-code,rgba(0,0,0,0.03))]',
          )}
        >
          {visibleResults.map((result, i) => (
            <button
              key={`${result.url}-${i}`}
              type="button"
              onClick={() => window.open(result.url, '_blank', 'noopener')}
              className={cn(
                'web-search-card__result-row',
                'w-full flex items-center gap-2 px-3 py-2 text-left',
                'border-b border-[color:var(--border-subtle,rgba(0,0,0,0.06))] last:border-b-0',
                'hover:bg-[color:var(--bg-hover,rgba(0,0,0,0.04))] transition-colors duration-100',
              )}
            >
              {/* Favicon */}
              {result.faviconUrl ? (
                <img
                  src={result.faviconUrl}
                  alt=""
                  aria-hidden="true"
                  width={16}
                  height={16}
                  className="w-4 h-4 rounded-[2px] shrink-0 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <Globe
                  size={14}
                  strokeWidth={1.5}
                  className="shrink-0 text-[color:var(--chat-text-muted,#8b8680)]"
                  aria-hidden="true"
                />
              )}
              {/* Title */}
              <span className="flex-1 min-w-0 truncate text-[13px] text-[color:var(--chat-text-secondary,inherit)]">
                {result.title}
              </span>
              {/* Domain */}
              <span className="shrink-0 text-[12px] text-[color:var(--chat-text-muted,#8b8680)] truncate max-w-[120px]">
                {result.domain}
              </span>
            </button>
          ))}

          {/* "Show more" link */}
          {hasHidden ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="web-search-card__show-more w-full px-3 py-2 text-left text-[12px] text-[color:var(--chat-text-muted,#8b8680)] hover:text-[color:var(--chat-text-secondary,inherit)] transition-colors duration-100"
            >
              Show more ({hiddenCount} more)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import type { WebSearchResult } from '../lib/types';

export type LegacyWebSearchResult = WebSearchResult;

export interface LegacyWebSearchCardProps {
  search: WebSearchResult;
  className?: string;
}

/**
 * @deprecated Use `WebSearchCard` with the named props instead.
 * Accepts the `WebSearchResult` shape from `lib/types` for backward compat.
 */
export function LegacyWebSearchCard({ search, className }: LegacyWebSearchCardProps) {
  return (
    <WebSearchCard
      query={search.query}
      resultCount={search.resultCount}
      results={search.results}
      className={className}
    />
  );
}
