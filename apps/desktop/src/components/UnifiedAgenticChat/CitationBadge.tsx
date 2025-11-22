import React from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { cn } from '../../lib/utils';

interface CitationBadgeProps {
  index: number;
  className?: string;
  onClick?: () => void;
}

export function CitationBadge({ index, className, onClick }: CitationBadgeProps) {
  const getCitationByIndex = useUnifiedChatStore((state) => state.getCitationByIndex);
  const openSidecar = useUnifiedChatStore((state) => state.openSidecar);
  const citation = getCitationByIndex(index);

  const handleClick = () => {
    if (citation) {
      // Open in sidecar browser mode
      openSidecar('browser', citation.url);
      onClick?.();
    }
  };

  if (!citation) {
    // Fallback for citations not yet in store
    return (
      <sup
        className={cn(
          'inline-flex items-center justify-center',
          'w-5 h-5 rounded-full',
          'bg-terra-cotta text-white text-[10px] font-bold',
          'cursor-pointer hover:bg-terra-cotta/80 transition-colors',
          'ml-0.5',
          className,
        )}
        onClick={handleClick}
        role="button"
        aria-label={`Citation ${index}`}
        tabIndex={0}
      >
        {index}
      </sup>
    );
  }

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <sup
          className={cn(
            'inline-flex items-center justify-center',
            'w-5 h-5 rounded-full',
            'bg-terra-cotta text-white text-[10px] font-bold',
            'cursor-pointer hover:bg-terra-cotta/80 hover:scale-110 transition-all',
            'ml-0.5',
            className,
          )}
          onClick={handleClick}
          role="button"
          aria-label={`Citation ${index}: ${citation.title || citation.url}`}
          tabIndex={0}
        >
          {index}
        </sup>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        className={cn('w-80 p-3', 'bg-zinc-900 border-zinc-700/50', 'rounded-xl shadow-2xl')}
      >
        <div className="flex flex-col gap-2">
          {/* Header with favicon */}
          <div className="flex items-start gap-2">
            {citation.favicon ? (
              <img
                src={citation.favicon}
                alt=""
                className="w-4 h-4 mt-0.5 rounded"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <FileText className="w-4 h-4 mt-0.5 text-zinc-400" />
            )}
            <div className="flex-1 min-w-0">
              {citation.title && (
                <h4 className="text-sm font-semibold text-zinc-100 line-clamp-2 mb-1">
                  {citation.title}
                </h4>
              )}
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal hover:text-teal/80 flex items-center gap-1 break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {new URL(citation.url).hostname}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          </div>

          {/* Snippet */}
          {citation.snippet && (
            <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">{citation.snippet}</p>
          )}

          {/* Action hint */}
          <div className="text-xs text-zinc-500 pt-1 border-t border-white/5">
            Click to open in Sidecar Browser
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// Helper function to parse and replace citation markers in text
export function parseCitations(text: string): React.ReactNode[] {
  const citationRegex = /\[(\d+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(text)) !== null) {
    // Add text before citation
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add citation badge
    const index = match[1] ? parseInt(match[1], 10) : 0;
    parts.push(<CitationBadge key={`citation-${index}-${match.index}`} index={index} />);

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
