/**
 * OptimizedMessageBubble
 *
 * Performance-optimized version of MessageBubble using React.memo
 * and shallow comparison to prevent unnecessary re-renders.
 *
 * This wrapper ensures that MessageBubble components only re-render
 * when their actual content changes, not on every parent render.
 */

import { memo } from 'react';
import { MessageBubble as BaseMessageBubble } from './index';
import type { MessageBubbleProps } from './index';

/**
 * Custom comparison function for memo
 * Returns true if props are equal (component won't re-render)
 */
function arePropsEqual(prevProps: MessageBubbleProps, nextProps: MessageBubbleProps): boolean {
  // Compare primitive values directly
  if (
    prevProps.message.id !== nextProps.message.id ||
    prevProps.message.content !== nextProps.message.content ||
    prevProps.message.role !== nextProps.message.role ||
    prevProps.showAvatar !== nextProps.showAvatar ||
    prevProps.showTimestamp !== nextProps.showTimestamp ||
    prevProps.enableActions !== nextProps.enableActions
  ) {
    return false;
  }

  // Compare metadata if present
  if (prevProps.message.metadata !== nextProps.message.metadata) {
    // Deep compare metadata only if both exist
    if (prevProps.message.metadata && nextProps.message.metadata) {
      if (
        JSON.stringify(prevProps.message.metadata) !== JSON.stringify(nextProps.message.metadata)
      ) {
        return false;
      }
    } else if (prevProps.message.metadata !== nextProps.message.metadata) {
      return false;
    }
  }

  // Function references change on every parent render, so we can't compare them
  // by reference. Instead, we rely on the props being the same object reference.
  // In practice, the callbacks should be memoized by the parent component.
  // We don't return false here, assuming callbacks are stable.

  return true;
}

/**
 * Memoized MessageBubble component
 * Prevents re-renders when message content hasn't changed
 */
export const OptimizedMessageBubble = memo(BaseMessageBubble, arePropsEqual);

OptimizedMessageBubble.displayName = 'OptimizedMessageBubble';

export default OptimizedMessageBubble;
