'use client';

/**
 * GhostTextOverlay
 *
 * Renders ghost-text (inline AI suggestion) behind the textarea content.
 * The suggestion text is displayed in a muted color at the end of the current input.
 *
 * Usage:
 *   - Position the overlay to exactly match the textarea dimensions
 *   - The visible input text is transparent in the overlay; only the suggestion shows
 *   - Tab or ArrowRight accepts the suggestion
 */

import { memo } from 'react';
import { cn } from '@shared/lib/utils';

interface GhostTextOverlayProps {
  /** The current text the user has typed */
  inputText: string;
  /** The ghost-text suggestion to display after the input */
  suggestion: string;
  /** Whether a completion request is in flight */
  isLoading?: boolean;
  /** Extra classes forwarded to the overlay wrapper */
  className?: string;
}

const GhostTextOverlayComponent = ({
  inputText,
  suggestion,
  isLoading = false,
  className,
}: GhostTextOverlayProps) => {
  if (!suggestion && !isLoading) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        // Positioned to overlay the textarea; pointer-events-none so it doesn't capture clicks
        'pointer-events-none absolute inset-0 overflow-hidden px-2 py-3',
        'whitespace-pre-wrap break-words text-xs sm:text-sm md:text-[15px] leading-relaxed',
        className,
      )}
    >
      {/* Invisible replica of the user's typed text */}
      <span className="text-transparent">{inputText}</span>

      {/* Suggestion ghost text */}
      {isLoading ? (
        <span className="animate-pulse text-muted-foreground/30">...</span>
      ) : (
        <span className="text-muted-foreground/40">{suggestion}</span>
      )}
    </div>
  );
};

export const GhostTextOverlay = memo(GhostTextOverlayComponent);
GhostTextOverlay.displayName = 'GhostTextOverlay';
