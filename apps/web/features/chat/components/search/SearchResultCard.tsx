'use client';

/**
 * SearchResultCard
 *
 * Individual compact card displaying a search result with favicon, title, URL, and snippet.
 * Used in the horizontal scrollable row within SearchResults.
 */

import React from 'react';
import NextImage from 'next/image';
import { Globe, ExternalLink } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import type { SearchResult } from '@core/integrations/web-search-handler';

export interface SearchResultCardProps {
  result: SearchResult;
  /** Citation number displayed as a badge (e.g. [1], [2]) */
  citationNumber?: number;
  className?: string;
}

export const SearchResultCard: React.FC<SearchResultCardProps> = ({
  result,
  citationNumber,
  className,
}) => {
  const { title, url, snippet, favicon } = result;

  // Extract a display hostname from URL
  let displayUrl = url;
  try {
    const parsed = new URL(url);
    displayUrl = parsed.hostname.replace(/^www\./, '');
  } catch {
    // keep raw url
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex w-[260px] shrink-0 snap-start flex-col gap-1.5 rounded-lg border border-border/40 bg-card/60 p-3',
        'transition-all duration-150 hover:border-border/70 hover:bg-card/90 hover:shadow-sm',
        'no-underline',
        className,
      )}
    >
      {/* Top row: favicon + URL + citation badge */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          {favicon ? (
            <NextImage
              src={favicon}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 rounded-sm"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                const sibling = e.currentTarget.nextElementSibling;
                if (sibling instanceof HTMLElement) sibling.style.display = '';
              }}
            />
          ) : null}
          <Globe
            className={cn('h-3.5 w-3.5 text-muted-foreground', favicon && 'hidden')}
            aria-hidden="true"
          />
        </div>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {displayUrl}
        </span>
        {citationNumber !== undefined && (
          <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">
            {citationNumber}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
        {title}
      </h4>

      {/* Snippet (2 lines max) */}
      {snippet && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">{snippet}</p>
      )}

      {/* External link indicator on hover */}
      <div className="flex justify-end">
        <ExternalLink className="h-3 w-3 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
      </div>
    </a>
  );
};

SearchResultCard.displayName = 'SearchResultCard';
