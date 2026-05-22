/**
 * Simple Empty State
 *
 * A completely minimal empty state - just empty space.
 * The input area at the bottom is the only UI element visible.
 * The AI is smart enough to figure out what to do from the conversation.
 */
import React from 'react';
import { cn } from '../../lib/utils';

interface SimpleEmptyStateProps {
  onSuggestionClick?: (text: string) => void;
  className?: string;
}

export const SimpleEmptyState: React.FC<SimpleEmptyStateProps> = ({ className }) => {
  // Completely empty - only the input area shows
  return <div className={cn('flex-1 min-h-[40vh]', className)} />;
};

export default SimpleEmptyState;
