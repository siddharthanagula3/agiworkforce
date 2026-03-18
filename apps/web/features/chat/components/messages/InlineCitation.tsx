'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@shared/lib/utils';

export interface Citation {
  index: number;
  url: string;
  title: string;
  snippet?: string;
}

interface InlineCitationProps {
  citation: Citation;
}

export function InlineCitation({ citation }: InlineCitationProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        onMouseEnter={() => setShowPreview(true)}
        onMouseLeave={() => setShowPreview(false)}
        onClick={() => window.open(citation.url, '_blank', 'noopener,noreferrer')}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/15 text-[10px] font-bold text-teal-500 transition-colors hover:bg-teal-500/25"
        aria-label={`Source ${citation.index}: ${citation.title}`}
      >
        {citation.index}
      </button>

      {showPreview && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-border/60 bg-popover/95 p-3 shadow-xl backdrop-blur-xl">
          <div className="flex items-start gap-2">
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" />
            <div className="min-w-0 flex-1">
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="line-clamp-1 text-sm font-medium text-teal-400 hover:underline"
              >
                {citation.title}
              </a>
              {citation.snippet && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {citation.snippet}
                </p>
              )}
              <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground/60">
                {new URL(citation.url).hostname}
              </p>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * CitationFooter — shows all citations at the bottom of a message as a compact list.
 */
export function CitationFooter({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border/30 pt-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Sources
      </p>
      <div className="space-y-1">
        {citations.map((c) => (
          <a
            key={c.index}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted/40',
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-teal-500/15 text-[9px] font-bold text-teal-500">
              {c.index}
            </span>
            <span className="flex-1 truncate text-muted-foreground">{c.title}</span>
            <span className="text-[10px] text-muted-foreground/50">{new URL(c.url).hostname}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
