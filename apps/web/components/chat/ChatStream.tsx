'use client';

import React, { useRef, useEffect, useCallback, useState, memo } from 'react';
import { ArrowDown, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { useChatStore } from '@/stores/chatStore';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './EmptyState';

interface ChatStreamProps {
  onSuggestionClick?: (prompt: string) => void;
}

export const ChatStream = memo(function ChatStream({ onSuggestionClick }: ChatStreamProps) {
  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const isLoading = useChatStore((state) => state.isLoading);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Track scroll position to enable/disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // User is considered "at bottom" if within 100px of the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    shouldAutoScroll.current = isAtBottom;
    // Show scroll button when not at bottom and there's content to scroll
    setShowScrollButton(!isAtBottom && scrollHeight > clientHeight + 200);
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
      shouldAutoScroll.current = true;
      setShowScrollButton(false);
    }
  }, []);

  // Track the last message content length for auto-scroll during streaming
  const lastMessageContentLength = React.useMemo(() => {
    if (messages.length === 0) return 0;
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.content?.length ?? 0;
  }, [messages]);

  // Auto-scroll effect
  useEffect(() => {
    if (!shouldAutoScroll.current || !scrollContainerRef.current) return;

    scrollContainerRef.current.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      // Use instant scroll during streaming to avoid animation queue-up
      behavior: isStreaming ? 'auto' : 'smooth',
    });
  }, [messages.length, isStreaming, lastMessageContentLength]);

  // Show empty state if no messages
  if (messages.length === 0) {
    return <EmptyState onSuggestionClick={onSuggestionClick} />;
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Thinking indicator */}
      {isLoading && !isStreaming && (
        <div className="absolute top-0 left-0 right-0 z-10 flex justify-center py-4 bg-gradient-to-b from-white dark:from-gray-900 to-transparent">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
            <span className="text-sm text-amber-700 dark:text-amber-300">Thinking...</span>
          </div>
        </div>
      )}

      {/* Message list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-2 py-4 space-y-1"
      >
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            showAvatar
            showTimestamp={false}
            enableActions
          />
        ))}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className={clsx(
            'absolute bottom-4 left-1/2 -translate-x-1/2 z-20',
            'flex items-center gap-2 px-4 py-2 rounded-full',
            'bg-gray-800/90 dark:bg-gray-200/90 backdrop-blur-sm',
            'border border-gray-700 dark:border-gray-300',
            'text-sm text-white dark:text-gray-900',
            'hover:bg-gray-700 dark:hover:bg-gray-300',
            'shadow-lg transition-all duration-200',
            'animate-in fade-in slide-in-from-bottom-2',
          )}
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
          <span>New messages</span>
        </button>
      )}
    </div>
  );
});

export default ChatStream;
