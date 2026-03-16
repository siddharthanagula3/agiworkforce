'use client';

import React from 'react';
import { cn } from '@shared/lib/utils';
import { MessageBubbleSkeleton } from './MessageBubbleSkeleton';

interface ChatLoadingStateProps {
  /**
   * Number of skeleton message bubbles to display.
   * Defaults to 4 — a balanced visual weight that covers most viewports.
   */
  count?: number;
  /**
   * Animation variant forwarded to all MessageBubbleSkeleton children.
   * Defaults to 'pulse' to match the existing Skeleton primitive default.
   */
  animation?: 'pulse' | 'wave' | 'none';
  className?: string;
}

/**
 * Skeleton arrangement that simulates a realistic alternating user / assistant
 * conversation while chat history is loading from the database.
 *
 * Pattern (repeating pair):
 *   1. user message   — right-aligned, 1 line (short query)
 *   2. assistant msg  — left-aligned,  2-3 lines (longer reply)
 *
 * Matches the layout container used by MessageListNew (flex h-full flex-col
 * overflow-y-auto with flex-1 spacer pushing messages to bottom).
 */
export function ChatLoadingState({
  count = 4,
  animation = 'pulse',
  className,
}: ChatLoadingStateProps) {
  /**
   * For each skeleton slot, derive whether it is a user or assistant bubble
   * and how many lines to render, creating visual variety.
   */
  const skeletons = Array.from({ length: count }, (_, index) => {
    const isUser = index % 2 === 0;
    // Alternate line counts for more realistic appearance.
    const lines = isUser ? 1 : index % 4 === 1 ? 3 : 2;
    return { isUser, lines };
  });

  return (
    <div
      className={cn('flex h-full flex-col overflow-y-auto', className)}
      aria-label="Loading conversation history"
      aria-live="polite"
    >
      {/* Spacer that pushes the skeletons toward the bottom, matching MessageListNew */}
      <div className="flex-1" />

      <div>
        {skeletons.map(({ isUser, lines }, index) => (
          <MessageBubbleSkeleton key={index} isUser={isUser} lines={lines} animation={animation} />
        ))}
      </div>
    </div>
  );
}

ChatLoadingState.displayName = 'ChatLoadingState';
