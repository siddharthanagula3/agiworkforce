import { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Globe } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useUnifiedChatStore } from '@/stores/unified/unifiedChatStore';

interface SourcesFooterProps {
  /** The message content to extract citation numbers from */
  content: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when a source is clicked */
  onSourceClick?: (url: string) => void;
}

/**
 * A footer component that displays all sources referenced in a message.
 * Similar to how Perplexity shows sources at the end of responses.
 */
export function SourcesFooter({ content, className, onSourceClick }: SourcesFooterProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const getCitationByIndex = useUnifiedChatStore((state) => state.getCitationByIndex);
  const openSidecar = useUnifiedChatStore((state) => state.openSidecar);

  // Extract unique citation indices from the content
  const citationIndices = useMemo(() => {
    const regex = /\[(\d+)\]/g;
    const indices = new Set<number>();
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        indices.add(parseInt(match[1], 10));
      }
    }

    return Array.from(indices).sort((a, b) => a - b);
  }, [content]);

  // Get citation objects for each index
  const citations = useMemo(() => {
    return citationIndices
      .map((index) => {
        const citation = getCitationByIndex(index);
        if (citation) {
          return { ...citation, index };
        }
        return null;
      })
      .filter(Boolean) as Array<{
      index: number;
      url: string;
      title?: string;
      snippet?: string;
      favicon?: string;
    }>;
  }, [citationIndices, getCitationByIndex]);

  // Don't render if no citations found
  if (citations.length === 0) {
    return null;
  }

  const handleSourceClick = (url: string) => {
    if (onSourceClick) {
      onSourceClick(url);
    } else {
      openSidecar('browser', url);
    }
  };

  const displayedCitations = isExpanded ? citations : citations.slice(0, 3);

  return (
    <div className={cn('mt-4 pt-3 border-t border-border/50', 'text-sm', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Globe className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wider">
            {citations.length} Source{citations.length !== 1 ? 's' : ''}
          </span>
        </div>
        {citations.length > 3 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-teal hover:text-teal/80 transition-colors"
          >
            {isExpanded ? 'Show less' : `+${citations.length - 3} more`}
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {/* Sources Grid */}
      <div className="grid gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {displayedCitations.map((citation) => (
            <motion.button
              key={citation.index}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              onClick={() => handleSourceClick(citation.url)}
              className={cn(
                'flex items-center gap-3 p-2.5 rounded-lg text-left w-full',
                'bg-muted/40 hover:bg-muted/60 border border-border/30 hover:border-teal/30',
                'transition-all group',
              )}
            >
              {/* Citation number */}
              <div className="shrink-0 w-6 h-6 rounded-full bg-terra-cotta/80 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{citation.index}</span>
              </div>

              {/* Favicon + Content */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {citation.favicon ? (
                  <img
                    src={citation.favicon}
                    alt=""
                    className="w-4 h-4 rounded shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate group-hover:text-teal transition-colors">
                    {citation.title || new URL(citation.url).hostname}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {new URL(citation.url).hostname}
                  </p>
                </div>
              </div>

              {/* External link icon */}
              <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-teal shrink-0 transition-colors" />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default SourcesFooter;
