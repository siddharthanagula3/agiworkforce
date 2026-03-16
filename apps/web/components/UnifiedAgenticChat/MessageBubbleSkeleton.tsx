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
import SkeletonLoader from '@shared/ui/skeleton-loader';
import { SkeletonAvatar } from '@shared/ui/skeleton-loader';

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
      <div className="flex-shrink-0">
        <SkeletonAvatar size="md" />
      </div>

      {/* Content area */}
      <div className="flex-1 space-y-2">
        {/* Header/username skeleton */}
        <SkeletonLoader variant="text" width="40%" animation="wave" />

        {/* Message content skeleton - 3 lines */}
        <div className="space-y-2 pt-1">
          <SkeletonLoader variant="text" width="100%" animation="wave" />
          <SkeletonLoader variant="text" width="100%" animation="wave" />
          <SkeletonLoader variant="text" width="60%" animation="wave" />
        </div>
      </div>
    </div>
  );
};

export default MessageBubbleSkeleton;
