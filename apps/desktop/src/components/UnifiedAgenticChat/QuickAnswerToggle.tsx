/**
 * QuickAnswerToggle Component
 *
 * ChatGPT-style toggle that appears on assistant messages which used extended thinking.
 * Lets users switch between the detailed thinking response and a concise quick answer.
 */

import React, { memo, useCallback, useState } from 'react';
import { Brain, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { invoke } from '../../lib/tauri-mock';

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
  messageId,
  hasThinking,
  isQuickMode,
  onToggle,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (isLoading) return;

    const nextQuickMode = !isQuickMode;

    // If switching to quick mode, request a condensed regeneration from the backend.
    // If switching back to detailed mode, just flip the local toggle — the full content
    // is already stored in the message.
    if (nextQuickMode) {
      setIsLoading(true);
      try {
        await invoke('request_quick_answer', { messageId });
        onToggle(nextQuickMode);
      } catch {
        toast.error('Failed to generate quick answer');
      } finally {
        setIsLoading(false);
      }
    } else {
      onToggle(nextQuickMode);
    }
  }, [isLoading, isQuickMode, messageId, onToggle]);

  if (!hasThinking) return null;

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={isLoading}
      aria-label={isQuickMode ? 'Show detailed answer with reasoning' : 'Show quick answer'}
      className={cn(
        'ml-auto inline-flex items-center gap-1 text-sm transition-colors',
        'text-white/40 hover:text-white/70',
        'disabled:opacity-50 disabled:cursor-not-allowed',
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
