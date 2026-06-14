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
 * InlineSourceTags · renders citations as compact inline superscript-style tags
 * positioned immediately after the response prose, matching Claude's visual pattern
 * where source names appear as `[Source Name]` chips rather than a separate footer list.
 */
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

/**
 * CitationFooter · kept for backward compat; new callers should prefer InlineSourceTags.
 * @deprecated Use InlineSourceTags for inline placement after prose.
 */
export function CitationFooter({ citations }: { citations: Citation[] }) {
  return <InlineSourceTags citations={citations} />;
}
