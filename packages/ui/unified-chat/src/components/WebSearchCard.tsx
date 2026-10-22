import { useId, useState } from 'react';
import { ChevronDown, ExternalLink, Globe } from 'lucide-react';
import { translateUi, translateUiPlural } from '@agiworkforce/ui';
import { cn } from '../lib/utils';
import type { WebSearchResultItem } from '../lib/types';

export type { WebSearchResultItem } from '../lib/types';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

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
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const previewIdBase = useId();

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
          'h-7 px-1 rounded-md text-start w-full',
          'cursor-pointer hover:bg-[color:var(--bg-hover,rgba(0,0,0,0.04))]',
          'transition-colors duration-instant',
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
        <span className="web-search-card__count shrink-0 text-caption text-[color:var(--chat-text-muted,#8b8680)] tabular-nums">
          {translateUiPlural('common', 'counts.results', resultCount, {
            one: '{{count}} result',
            other: '{{count}} results',
          })}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2}
          className={cn(
            'shrink-0 text-[color:var(--chat-text-muted,#8b8680)]',
            'transition-transform duration-quick',
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
          {visibleResults.map((result, i) => {
            const rowKey = `${result.url}-${i}`;
            const previewOpen = previewKey === rowKey;
            const previewId = `${previewIdBase}-${i}`;
            const host = result.domain || hostOf(result.url);
            return (
              <div
                key={rowKey}
                className="web-search-card__result border-b border-[color:var(--border-subtle,rgba(0,0,0,0.06))] last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => setPreviewKey(previewOpen ? null : rowKey)}
                  aria-expanded={previewOpen}
                  aria-controls={previewId}
                  className={cn(
                    'web-search-card__result-row',
                    'w-full flex items-start gap-3 px-3 py-2 text-start',
                    'hover:bg-[color:var(--bg-hover,rgba(0,0,0,0.04))] transition-colors duration-instant',
                  )}
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:var(--border-subtle,rgba(0,0,0,0.08))]">
                    {result.faviconUrl ? (
                      <img
                        src={result.faviconUrl}
                        alt=""
                        aria-hidden="true"
                        width={16}
                        height={16}
                        className="w-4 h-4 rounded-detail object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Globe
                        size={14}
                        strokeWidth={1.5}
                        className="text-[color:var(--chat-text-muted,#8b8680)]"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-[color:var(--chat-text-primary,inherit)]">
                      {result.title || host}
                    </span>
                    {host ? (
                      <span className="web-search-card__host truncate text-sm text-[color:var(--chat-text-muted,#8b8680)]">
                        {host}
                      </span>
                    ) : null}
                    {result.snippet ? (
                      <span className="web-search-card__snippet line-clamp-2 text-sm text-[color:var(--chat-text-muted,#8b8680)]">
                        {result.snippet}
                      </span>
                    ) : null}
                  </span>
                </button>
                {previewOpen ? (
                  <div
                    id={previewId}
                    role="region"
                    aria-label={result.title || host}
                    className="web-search-card__source-view flex flex-col gap-2 px-3 pb-3 ps-12"
                  >
                    <span className="break-all text-sm text-[color:var(--chat-text-muted,#8b8680)]">
                      {result.url}
                    </span>
                    {result.snippet ? (
                      <p className="m-0 text-sm text-[color:var(--chat-text-secondary,inherit)]">
                        {result.snippet}
                      </p>
                    ) : null}
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm',
                        'border border-[color:var(--border-subtle,rgba(0,0,0,0.08))]',
                        'text-[color:var(--chat-text-secondary,inherit)]',
                        'hover:bg-[color:var(--bg-hover,rgba(0,0,0,0.04))] transition-colors duration-instant',
                      )}
                    >
                      <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                      {translateUi('chat', 'webSearch.openInNewTab', 'Open in new tab')}
                    </a>
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* "Show more" link */}
          {hasHidden ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="web-search-card__show-more w-full px-3 py-2 text-start text-caption text-[color:var(--chat-text-muted,#8b8680)] hover:text-[color:var(--chat-text-secondary,inherit)] transition-colors duration-instant"
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
