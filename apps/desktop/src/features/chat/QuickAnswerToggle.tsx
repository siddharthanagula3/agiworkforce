/**
 * QuickAnswerToggle Component
 *
 * ChatGPT-style toggle that appears on assistant messages which used extended thinking.
 * Lets users switch between the detailed thinking response and a concise quick answer.
 */

import React, { memo, useCallback } from 'react';
import { Brain, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface QuickAnswerToggleProps {
  /** ID of the message this toggle belongs to */
  messageId: string;
  /** Whether the message contains thinking/reasoning content */
  hasThinking: boolean;
  /** Whether we are currently showing the quick (condensed) version */
  isQuickMode: boolean;
  /** Callback invoked when the user clicks the toggle */
  onToggle: (quickMode: boolean) => void;
}

const QuickAnswerToggleComponent: React.FC<QuickAnswerToggleProps> = ({
  hasThinking,
  isQuickMode,
  onToggle,
}) => {
  // Pure client-side toggle — full content is already stored in the message,
  // so we just flip the display mode without a backend call.
  const handleClick = useCallback(() => {
    onToggle(!isQuickMode);
  }, [isQuickMode, onToggle]);

  if (!hasThinking) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isQuickMode ? 'Show detailed answer with reasoning' : 'Show quick answer'}
      className={cn(
        'ml-auto inline-flex items-center gap-1 text-sm transition-colors',
        'text-white/40 hover:text-white/70',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-sm',
      )}
    >
      {isQuickMode ? (
        <>
          <Brain size={12} />
          <span>Detailed answer</span>
        </>
      ) : (
        <>
          <Zap size={12} />
          <span>Quick answer</span>
        </>
      )}
    </button>
  );
};

QuickAnswerToggleComponent.displayName = 'QuickAnswerToggle';

export const QuickAnswerToggle = memo(QuickAnswerToggleComponent);
