import { useState } from 'react';
import { Globe, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { Badge } from './ui/Badge';
import type { WebSearchResult } from '../lib/types';

interface WebSearchCardProps {
  search: WebSearchResult;
  className?: string;
}

const MAX_VISIBLE_RESULTS = 5;

export function WebSearchCard({ search, className }: WebSearchCardProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleResults = search.results.slice(0, MAX_VISIBLE_RESULTS);
  const hiddenCount = Math.max(0, search.results.length - MAX_VISIBLE_RESULTS);

  return (
    <div
      className={cn(
        'rounded-[var(--chat-radius-lg)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] overflow-hidden my-2',
        className,
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2',
          'text-left hover:bg-[var(--chat-surface-hover)] transition-colors',
        )}
        aria-expanded={expanded}
      >
        <Globe size={13} className="shrink-0 text-[var(--chat-text-muted)]" />
        <span className="flex-1 truncate text-[13px] text-[var(--chat-thinking-text)] font-medium">
          {search.query}
        </span>
        <Badge variant="default" className="shrink-0 ml-auto mr-1">
          {search.resultCount} {search.resultCount === 1 ? 'result' : 'results'}
        </Badge>
        {expanded ? (
          <ChevronDown size={13} className="shrink-0 text-[var(--chat-text-muted)]" />
        ) : (
          <ChevronRight size={13} className="shrink-0 text-[var(--chat-text-muted)]" />
        )}
      </button>

      {/* Results list */}
      {expanded && (
        <div className="border-t border-[var(--chat-border)] divide-y divide-[var(--chat-border)]">
          {visibleResults.map((result, i) => (
            <a
              key={i}
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2 px-3 py-2',
                'text-[13px] text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)] transition-colors',
                'no-underline',
              )}
            >
              {result.faviconUrl ? (
                <img
                  src={result.faviconUrl}
                  alt=""
                  aria-hidden
                  width={16}
                  height={16}
                  className="rounded-[2px] shrink-0 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <Globe size={14} className="shrink-0 text-[var(--chat-text-muted)]" />
              )}
              <span className="flex-1 truncate">{result.title}</span>
              <span className="shrink-0 text-[11px] text-[var(--chat-text-muted)] truncate max-w-[100px]">
                {result.domain}
              </span>
            </a>
          ))}

          {hiddenCount > 0 && (
            <div className="px-3 py-2 text-[12px] text-[var(--chat-text-muted)]">
              ... {hiddenCount} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
