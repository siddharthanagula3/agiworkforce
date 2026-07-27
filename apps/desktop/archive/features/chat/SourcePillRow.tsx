/**
 * SourcePillRow Component
 *
 * A horizontal scrollable row of source citation pills, similar to ChatGPT's
 * source pill row. Each pill shows a favicon, domain name, and opens the URL
 * in the sidecar browser on click.
 */

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';

/**
 * Extract the hostname from a URL string. Falls back to the raw URL on parse
 * failure so the pill is always renderable.
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Build a Google S2 favicon URL for a given page URL.
 * Always uses the 16×16 size which is the smallest crisp option.
 */
function faviconUrl(url: string): string {
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`;
}

export interface SourceCitation {
  url: string;
  title?: string;
  index: number;
}

export interface SourcePillRowProps {
  citations: SourceCitation[];
  /** Maximum number of pills shown before a "+N more" button appears. Default: 6 */
  maxVisible?: number;
  className?: string;
}

interface PillProps {
  citation: SourceCitation;
  onClick: (url: string) => void;
}

function SourcePill({ citation, onClick }: PillProps) {
  const domain = extractDomain(citation.url);
  const favicon = faviconUrl(citation.url);

  return (
    <button
      type="button"
      onClick={() => onClick(citation.url)}
      title={citation.title ?? citation.url}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5',
        'rounded-full px-3 py-1.5',
        'bg-white/5 hover:bg-white/10',
        'border border-white/10 hover:border-white/20',
        'text-xs text-foreground hover:text-foreground',
        'transition-colors cursor-pointer',
        'max-w-[180px]',
      )}
    >
      {/* Citation index badge */}
      <span className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-terra-cotta/70 text-[9px] font-bold text-white">
        {citation.index}
      </span>

      {/* Favicon */}
      <img
        src={favicon}
        alt=""
        width={12}
        height={12}
        className="w-3 h-3 shrink-0 rounded-sm"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />

      {/* Domain */}
      <span className="truncate">{domain}</span>

      {/* External link hint */}
      <ExternalLink className="shrink-0 w-2.5 h-2.5 text-muted-foreground" />
    </button>
  );
}

export function SourcePillRow({ citations, maxVisible = 6, className }: SourcePillRowProps) {
  const [expanded, setExpanded] = useState(false);
  const openSidecar = useUnifiedChatStore((state) => state.openSidecar);

  if (citations.length === 0) {
    return null;
  }

  const visibleCitations = expanded ? citations : citations.slice(0, maxVisible);
  const hiddenCount = citations.length - maxVisible;

  const handlePillClick = (url: string) => {
    // Validate URL scheme before opening — block non-http(s) URLs
    if (/^https?:\/\//i.test(url)) {
      openSidecar('browser', url);
    }
  };

  return (
    <div className={cn('flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5', className)}>
      {visibleCitations.map((citation) => (
        <SourcePill key={`pill-${citation.index}`} citation={citation} onClick={handlePillClick} />
      ))}

      {/* "+N more" toggle — only shown when there are hidden pills and not expanded */}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            'inline-flex shrink-0 items-center',
            'rounded-full px-3 py-1.5',
            'bg-white/5 hover:bg-white/10',
            'border border-white/10 hover:border-white/20',
            'text-xs text-muted-foreground hover:text-foreground',
            'transition-colors cursor-pointer',
          )}
        >
          +{hiddenCount} more
        </button>
      )}

      {/* "Show less" toggle — only shown when expanded and there were hidden pills */}
      {expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className={cn(
            'inline-flex shrink-0 items-center',
            'rounded-full px-3 py-1.5',
            'bg-white/5 hover:bg-white/10',
            'border border-white/10 hover:border-white/20',
            'text-xs text-muted-foreground hover:text-foreground',
            'transition-colors cursor-pointer',
          )}
        >
          Show less
        </button>
      )}
    </div>
  );
}
