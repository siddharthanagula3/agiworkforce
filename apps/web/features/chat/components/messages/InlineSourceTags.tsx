'use client';

import { cn } from '@shared/lib/utils';

export interface Citation {
  index: number;
  url: string;
  title: string;
  snippet?: string;
}

export function InlineSourceTags({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((c) => {
        let hostname = '';
        try {
          hostname = new URL(c.url).hostname.replace(/^www\./, '');
        } catch {
          hostname = c.title;
        }
        const label = c.title || hostname;

        return (
          <a
            key={c.index}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            title={c.snippet ?? c.title}
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
              'border border-border/40 bg-muted/30 text-[11px] text-muted-foreground',
              'transition-colors hover:border-border/70 hover:bg-muted/50 hover:text-foreground',
            )}
            aria-label={`Source ${c.index}: ${label}`}
          >
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-[9px] font-bold text-teal-500">
              {c.index}
            </span>
            <span className="max-w-[160px] truncate">{label}</span>
          </a>
        );
      })}
    </div>
  );
}
