'use client';

/**
 * MessageSearch -- Inline search bar for in-session conversation search.
 *
 * Features:
 * - Text input with "Search messages..." placeholder
 * - Match count display ("3 of 12 matches")
 * - Prev/Next navigation arrows
 * - Close button (X)
 * - Keyboard: Escape closes, Enter = next, Shift+Enter = prev
 *
 * The parent (ChatMessageList) is responsible for:
 * - Toggling visibility via Cmd+F
 * - Computing search matches against messages
 * - Scrolling to the current match
 * - Highlighting matched text inside MessageBubble
 */

import { useRef, useEffect, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageSearchProps {
  /** Current search query (controlled). */
  query: string;
  /** Called when the user types in the search input. */
  onQueryChange: (query: string) => void;
  /** Total number of matches found. */
  totalMatches: number;
  /** Zero-based index of the currently focused match. */
  currentMatchIndex: number;
  /** Navigate to next match. */
  onNext: () => void;
  /** Navigate to previous match. */
  onPrev: () => void;
  /** Close the search bar. */
  onClose: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MessageSearchComponent = ({
  query,
  onQueryChange,
  totalMatches,
  currentMatchIndex,
  onNext,
  onPrev,
  onClose,
  className,
}: MessageSearchProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when the search bar mounts.
  useEffect(() => {
    // Short delay so the mount animation doesn't interfere with focus.
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          onPrev();
        } else {
          onNext();
        }
      }
    },
    [onClose, onNext, onPrev],
  );

  const matchLabel =
    query.trim().length > 0
      ? totalMatches > 0
        ? `${currentMatchIndex + 1} of ${totalMatches} matches`
        : 'No matches'
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'absolute inset-x-0 top-0 z-20 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur-sm',
        className,
      )}
      role="search"
      aria-label="Search messages"
    >
      <div className="mx-auto flex max-w-xl items-center gap-2">
        {/* Search icon + input */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search messages..."
            aria-label="Search messages"
            className="w-full rounded-md border border-border bg-muted/50 py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Match count */}
        {matchLabel && (
          <span
            className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {matchLabel}
          </span>
        )}

        {/* Prev / Next arrows */}
        <div className="flex items-center gap-0.5" role="group" aria-label="Search navigation">
          <button
            type="button"
            onClick={onPrev}
            disabled={totalMatches === 0}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            title="Previous match (Shift+Enter)"
            aria-label="Go to previous match"
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={totalMatches === 0}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            title="Next match (Enter)"
            aria-label="Go to next match"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Close search (Escape)"
          aria-label="Close search"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
};

/**
 * MessageSearch -- memoized inline search bar for chat message lists.
 */
export const MessageSearch = memo(MessageSearchComponent);
MessageSearch.displayName = 'MessageSearch';
