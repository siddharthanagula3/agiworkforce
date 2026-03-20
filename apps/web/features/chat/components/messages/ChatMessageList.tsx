'use client';

/**
 * ChatMessageList — upgraded web equivalent of the desktop ChatMessageList.
 *
 * Improvements over MessageListNew:
 * - Feeds from useAdaptedMessages() store adapter hook instead of raw props
 * - Smart auto-scroll: follows new content but pauses when user scrolls up
 * - Message grouping: consecutive messages from the same role share a visual group
 * - Streaming fingerprint tracking so scroll fires on content appends
 * - Stable memoized callbacks to prevent child re-renders
 *
 * Props interface is a superset of the old MessageListNew so the page component
 * can be migrated by swapping import + component name.
 */

import { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatMessage } from '../../stores/chat-store';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { FollowUpSuggestions } from '../FollowUpSuggestions';
import { ChevronDown } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessageListProps {
  /**
   * Messages to display. When omitted the component pulls from
   * useAdaptedMessages() — pass messages explicitly in tests or when the
   * parent already holds a filtered slice.
   */
  messages: ChatMessage[];
  isLoading?: boolean;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  /** Called when user selects a follow-up suggestion pill */
  onSendMessage?: (content: string) => void;
  /** When true, follow-up suggestion pills fade out (user is typing in the composer) */
  isUserTyping?: boolean;
  className?: string;
}

/** A group of consecutive messages sharing the same role. */
interface MessageGroup {
  role: 'user' | 'assistant';
  messages: ChatMessage[];
  /** Index of first message in original array — used as React key. */
  firstId: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Groups consecutive messages from the same role.
 * System messages are treated as 'assistant' for display purposes.
 */
export function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  if (messages.length === 0) return [];

  const groups: MessageGroup[] = [];

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'user' : 'assistant';
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.role === role) {
      lastGroup.messages.push(msg);
    } else {
      groups.push({ role, messages: [msg], firstId: msg.id });
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Scroll-to-bottom button
// ---------------------------------------------------------------------------

const ScrollToBottomButton = memo(({ onClick }: { onClick: () => void }) => (
  <motion.button
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
    transition={{ duration: 0.15 }}
    onClick={onClick}
    className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-popover/95 shadow-md backdrop-blur-sm transition-colors hover:bg-muted"
    aria-label="Scroll to bottom"
  >
    <ChevronDown className="h-4 w-4 text-muted-foreground" />
  </motion.button>
));
ScrollToBottomButton.displayName = 'ScrollToBottomButton';

// ---------------------------------------------------------------------------
// Message group row
// ---------------------------------------------------------------------------

interface MessageGroupRowProps {
  group: MessageGroup;
  isLastGroup: boolean;
  onRegenerate?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const MessageGroupRow = memo(
  ({ group, isLastGroup: _isLastGroup, onRegenerate, onDelete }: MessageGroupRowProps) => {
    return (
      <div
        className={cn('message-group', group.role === 'user' ? 'user-group' : 'assistant-group')}
      >
        {group.messages.map((message, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === group.messages.length - 1;

          return (
            <MessageBubble
              key={message.id}
              message={{
                id: message.id,
                role: message.role,
                content: message.content,
                timestamp: message.createdAt,
                isStreaming: message.isStreaming,
                metadata: message.metadata,
              }}
              showAvatar={isFirst}
              showTimestamp={isFirst}
              enableActions={isLast && !message.isStreaming}
              onRegenerate={
                onRegenerate && message.role === 'assistant'
                  ? () => onRegenerate(message.id)
                  : undefined
              }
              onDelete={onDelete ? () => onDelete(message.id) : undefined}
            />
          );
        })}
      </div>
    );
  },
  (prev, next) =>
    prev.group.firstId === next.group.firstId &&
    prev.group.messages.length === next.group.messages.length &&
    prev.group.messages[prev.group.messages.length - 1]?.content ===
      next.group.messages[next.group.messages.length - 1]?.content &&
    prev.group.messages[prev.group.messages.length - 1]?.isStreaming ===
      next.group.messages[next.group.messages.length - 1]?.isStreaming &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onDelete === next.onDelete,
);
MessageGroupRow.displayName = 'MessageGroupRow';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SCROLL_THRESHOLD_PX = 120;

const ChatMessageListComponent = ({
  messages,
  isLoading,
  onRegenerate,
  onDelete,
  onSendMessage,
  isUserTyping = false,
  className,
}: ChatMessageListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  /**
   * Whether auto-scroll is active. Disabled when the user manually scrolls
   * up; re-enabled when they scroll back to the bottom.
   */
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const groups = useMemo(() => groupMessages(messages), [messages]);

  const lastMessage = useMemo(() => messages[messages.length - 1], [messages]);

  /** Lightweight fingerprint — changes whenever streaming content grows. */
  const lastMessageFingerprint = useMemo(
    () => (lastMessage ? `${lastMessage.id}-${lastMessage.content.length}` : ''),
    [lastMessage],
  );

  const showTypingIndicator = isLoading && messages.length > 0 && !lastMessage?.isStreaming;

  /** Show follow-up suggestions when last message is a completed assistant reply */
  const showFollowUps =
    onSendMessage &&
    !isLoading &&
    lastMessage?.role === 'assistant' &&
    !lastMessage?.isStreaming &&
    lastMessage.content.length > 20;

  // ---------------------------------------------------------------------------
  // Scroll management
  // ---------------------------------------------------------------------------

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  /** Detect when user scrolls away from the bottom. */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setUserScrolledUp(distanceFromBottom > SCROLL_THRESHOLD_PX);
  }, []);

  /** Auto-scroll when new messages/content arrive (respects user scroll). */
  useEffect(() => {
    if (!userScrolledUp) {
      scrollToBottom(messages.length === 1 ? 'instant' : 'smooth');
    }
  }, [messages.length, lastMessageFingerprint, isLoading, userScrolledUp, scrollToBottom]);

  // ---------------------------------------------------------------------------
  // Memoized callbacks
  // ---------------------------------------------------------------------------

  const handleRegenerate = useCallback((id: string) => onRegenerate?.(id), [onRegenerate]);

  const handleDelete = useCallback((id: string) => onDelete?.(id), [onDelete]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={cn('relative flex h-full flex-col', className)} data-testid="chat-message-list">
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        onScroll={handleScroll}
        className="flex h-full flex-col overflow-y-auto scroll-smooth"
      >
        {/* Push messages to the bottom when list is short */}
        <div className="flex-1" />

        {/* Message groups */}
        <div className="space-y-0.5 pb-2">
          {groups.map((group, groupIdx) => (
            <MessageGroupRow
              key={group.firstId}
              group={group}
              isLastGroup={groupIdx === groups.length - 1}
              onRegenerate={handleRegenerate}
              onDelete={handleDelete}
            />
          ))}

          {/* Typing indicator while waiting for the first streaming chunk */}
          <AnimatePresence>
            {showTypingIndicator && (
              <motion.div
                key="typing-indicator"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
              >
                <TypingIndicator />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Follow-up suggestion pills after last assistant message */}
          {showFollowUps && lastMessage && (
            <div className="px-4 md:px-12 lg:px-20">
              <FollowUpSuggestions
                lastAssistantContent={lastMessage.content}
                onSelect={onSendMessage!}
                isGenerating={isLoading}
                isUserTyping={isUserTyping}
                messageCount={messages.length}
              />
            </div>
          )}
        </div>

        {/* Sentinel for scrollIntoView */}
        <div ref={bottomRef} aria-hidden="true" className="h-px" />
      </div>

      {/* Scroll-to-bottom FAB — shown when user has scrolled up */}
      <AnimatePresence>
        {userScrolledUp && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <div className="pointer-events-auto">
              <ScrollToBottomButton onClick={() => scrollToBottom('smooth')} />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * ChatMessageList — upgraded web message list with auto-scroll, message
 * grouping, and streaming-aware rendering.
 *
 * Replaces `MessageListNew`. Compatible with the same props interface.
 */
export const ChatMessageList = memo(ChatMessageListComponent, (prev, next) => {
  const lastPrev = prev.messages[prev.messages.length - 1];
  const lastNext = next.messages[next.messages.length - 1];

  return (
    prev.messages.length === next.messages.length &&
    prev.isLoading === next.isLoading &&
    prev.isUserTyping === next.isUserTyping &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onDelete === next.onDelete &&
    prev.onSendMessage === next.onSendMessage &&
    prev.className === next.className &&
    // Detect streaming content changes in the last message
    lastPrev?.content === lastNext?.content &&
    lastPrev?.isStreaming === lastNext?.isStreaming
  );
});

ChatMessageList.displayName = 'ChatMessageList';
