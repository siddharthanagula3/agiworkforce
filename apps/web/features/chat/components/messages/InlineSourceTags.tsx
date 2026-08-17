'use client';

import { useId, useState } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { cn } from '@shared/lib/utils';

export interface Citation {
  index: number;
  url: string;
  title: string;
  snippet?: string;
}

function readHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function faviconFor(url: string): string | null {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  } catch {
    return null;
  }
}

function SourceTag({ citation }: { citation: Citation }) {
  const [open, setOpen] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const cardId = useId();

  const host = readHost(citation.url);
  const label = citation.title || host || citation.url;
  const favicon = faviconFailed ? null : faviconFor(citation.url);

  const faviconNode = favicon ? (
    <img
      src={favicon}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      className="h-4 w-4 shrink-0 rounded-sm object-contain"
      onError={() => setFaviconFailed(true)}
    />
  ) : (
    <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
  );

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <a
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-describedby={open ? cardId : undefined}
        className={cn(
          'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
          'border border-border/40 bg-muted/30 text-[11px] text-muted-foreground',
          'transition-colors hover:border-border/70 hover:bg-muted/50 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
        aria-label={`Source ${citation.index}: ${label}`}
      >
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-[9px] font-bold text-teal-500">
          {citation.index}
        </span>
        <span className="max-w-[160px] truncate">{label}</span>
      </a>

      {open && (
        <span
          id={cardId}
          role="tooltip"
          data-testid={`inline-source-card-${citation.index}`}
          className={cn(
            'absolute bottom-full left-0 z-50 mb-1.5 block w-72 max-w-[min(18rem,80vw)]',
            'rounded-lg border border-border bg-popover p-3 text-left shadow-lg',
          )}
        >
          <span className="flex items-center gap-2">
            {faviconNode}
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {host ?? citation.url}
            </span>
            <ExternalLink
              className="h-3 w-3 shrink-0 text-muted-foreground/60"
              aria-hidden="true"
            />
          </span>
          <span className="mt-1.5 block text-[13px] font-medium leading-snug text-popover-foreground">
            {label}
          </span>
          {citation.snippet && (
            <span className="mt-1 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
              {citation.snippet}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function InlineSourceTags({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((c) => (
        <SourceTag key={c.index} citation={c} />
      ))}
    </div>
  );
}
