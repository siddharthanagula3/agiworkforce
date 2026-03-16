/**
 * MessageBubbleSkeleton Component
 *
 * Skeleton loader for MessageBubble component with wave animation.
 * Mimics the structure of MessageBubble with placeholder elements.
 *
 * Features:
 * - Avatar skeleton (circular, md size)
 * - Header/username skeleton
 * - Message content skeleton (3 lines with last line at 60% width)
 * - Wave animation for smooth shimmer effect
 *
 * @component
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface MessageBubbleSkeletonProps {
  /**
   * Custom CSS class names
   */
  className?: string;
}

/**
 * MessageBubbleSkeleton - Displays a loading skeleton for message bubbles
 *
 * @example
 * ```tsx
 * <MessageBubbleSkeleton />
 * ```
 */
export const MessageBubbleSkeleton: React.FC<MessageBubbleSkeletonProps> = ({ className }) => {
  return (
    <div className={cn('flex gap-3 py-3 px-4', className)} data-testid="message-bubble-skeleton">
      {/* Avatar skeleton */}
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />

      {/* Content area */}
      <div className="flex-1 space-y-2">
        {/* Header/username skeleton */}
        <div className="h-4 w-2/5 rounded bg-gray-200 dark:bg-gray-700" />

        {/* Message content skeleton - 3 lines */}
        <div className="space-y-2 pt-1">
          <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-3/5 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  );
};

export default MessageBubbleSkeleton;
