import { cn } from '../lib/utils';
import { truncate } from '../lib/utils';
import type { Citation } from '../lib/types';

interface CitationPillProps {
  citation: Citation;
  className?: string;
}

export function CitationPill({ citation, className }: CitationPillProps) {
  const label = citation.domain || citation.title;
  const displayText = truncate(label, 20);
  const fullTitle = citation.title || citation.url;

  function handleClick() {
    window.open(citation.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={fullTitle}
      aria-label={`Open citation: ${fullTitle}`}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full',
        'bg-[var(--chat-surface-hover)] text-[var(--chat-text-secondary)] text-[11px]',
        'hover:bg-[var(--chat-surface-overlay)] cursor-pointer transition-colors',
        className,
      )}
    >
      {citation.faviconUrl && (
        <img
          src={citation.faviconUrl}
          alt=""
          aria-hidden
          width={12}
          height={12}
          className="rounded-[2px] shrink-0 object-contain"
          onError={(e) => {
            // Hide broken favicon images gracefully
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <span className="truncate">{displayText}</span>
      {citation.additionalCount !== undefined && citation.additionalCount > 0 && (
        <span className="text-[var(--chat-text-muted)]">+{citation.additionalCount}</span>
      )}
    </button>
  );
}
