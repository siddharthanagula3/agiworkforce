/**
 * ChatLoadingState Component
 *
 * Wrapper component for displaying loading state with skeleton loaders
 * in the chat message list. Transitions smoothly between loading and loaded states.
 *
 * Features:
 * - Conditional rendering of skeleton loaders or children
 * - Smooth fade transition using framer-motion
 * - Customizable loading message
 * - Multiple skeleton message bubbles for visual feedback
 *
 * @component
 */

import React from 'react';
import { motion } from 'framer-motion';
import { MessageBubbleSkeleton } from './MessageBubbleSkeleton';

interface ChatLoadingStateProps {
  /**
   * Whether the chat is currently loading
   */
  isLoading: boolean;

  /**
   * Child content to display when not loading
   */
  children: React.ReactNode;

  /**
   * Loading message to display while loading
   * @default "Waiting for response..."
   */
  message?: string;
}

/**
 * ChatLoadingState - Displays loading skeletons or content with smooth transition
 *
 * @example
 * ```tsx
 * <ChatLoadingState isLoading={isLoading} message="Processing...">
 *   Chat content here
 * </ChatLoadingState>
 * ```
 */
export const ChatLoadingState: React.FC<ChatLoadingStateProps> = ({
  isLoading,
  children,
  message = 'Waiting for response...',
}) => {
  return (
    <>
      {isLoading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          data-testid="chat-loading-state"
        >
          {/* Display skeleton loaders */}
          <MessageBubbleSkeleton />
          <MessageBubbleSkeleton />
          <MessageBubbleSkeleton />

          {/* Loading message */}
          <div className="flex justify-center py-4">
            <p className="text-center text-sm text-muted-foreground">{message}</p>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      )}
    </>
  );
};

export default ChatLoadingState;
