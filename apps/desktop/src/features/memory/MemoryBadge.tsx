/**
 * MemoryBadge Component
 *
 * Inline badge shown on assistant messages when their content has been
 * saved to persistent memory. Renders a small brain icon with "Saved to
 * memory" text to give the user visible confirmation that the AI captured
 * something important from the conversation.
 */

import { memo } from 'react';
import { Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MemoryBadgeProps {
  /** Additional class names */
  className?: string;
}

export const MemoryBadge = memo(function MemoryBadge({ className }: MemoryBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
        'text-xs font-medium',
        'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
        'animate-in fade-in slide-in-from-bottom-1 duration-300',
        className,
      )}
      title="This message was saved to your memory"
      aria-label="Saved to memory"
    >
      <Brain className="h-3 w-3 shrink-0" aria-hidden="true" />
      Saved to memory
    </span>
  );
});
