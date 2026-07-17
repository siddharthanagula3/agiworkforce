/**
 * AdvancedEmptyState — Phase A Slice 5 (ported from UAC)
 *
 * Minimal empty state — just empty space. The input area at the bottom
 * is the only UI element visible. The AI is smart enough to figure out
 * what to do from the conversation.
 */
import React from 'react';
import { cn } from '../lib/utils';

export interface AdvancedEmptyStateProps {
  onSuggestionClick?: (text: string) => void;
  className?: string;
}

export const AdvancedEmptyState: React.FC<AdvancedEmptyStateProps> = ({ className }) => {
  // Completely empty — only the input area shows
  return <div className={cn('flex-1 min-h-[40vh]', className)} />;
};

export default AdvancedEmptyState;
