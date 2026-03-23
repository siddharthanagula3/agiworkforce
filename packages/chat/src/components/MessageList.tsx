import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { useChatStore } from '../stores/chatStore';
import { MessageBubble } from './MessageBubble';
import { Button } from './ui/Button';
import type { Artifact } from '../lib/types';

interface MessageListProps {
  conversationId: string;
  onArtifactClick?: (artifact: Artifact) => void;
}

export function MessageList({ conversationId, onArtifactClick }: MessageListProps) {
  const messages = useChatStore((s) => s.messages[conversationId] ?? []);
  const isStreaming = useChatStore((s) => s.isStreaming);

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  // Auto-scroll when new messages arrive, unless user has scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      scrollToBottom('smooth');
    }
  }, [messages.length, scrollToBottom]);

  // Auto-scroll per-chunk during streaming: track content length of last message
  const lastMessageContent =
    messages.length > 0 ? (messages[messages.length - 1]?.content?.length ?? 0) : 0;

  // Also auto-scroll during streaming of the last message
  useEffect(() => {
    if (isStreaming && !userScrolledUpRef.current) {
      scrollToBottom('instant');
    }
  }, [isStreaming, lastMessageContent, scrollToBottom]);

  // Detect manual scroll position to toggle "scroll to bottom" button
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const threshold = 80;

    if (distanceFromBottom > threshold) {
      userScrolledUpRef.current = true;
      setShowScrollButton(true);
    } else {
      userScrolledUpRef.current = false;
      setShowScrollButton(false);
    }
  }, []);

  function handleScrollButtonClick() {
    userScrolledUpRef.current = false;
    setShowScrollButton(false);
    scrollToBottom('smooth');
  }

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex flex-1 flex-col overflow-y-auto"
      >
        <div className="max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              isLast={index === messages.length - 1}
              onRetry={undefined}
              onArtifactClick={onArtifactClick}
            />
          ))}
          <div ref={bottomRef} className="h-px" aria-hidden />
        </div>
      </div>

      {showScrollButton && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScrollButtonClick}
            aria-label="Scroll to bottom"
            className={cn(
              'flex items-center gap-1.5 shadow-md',
              'bg-[var(--chat-surface-elevated)] border-[var(--chat-border)]',
              'text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)]',
              'hover:bg-[var(--chat-surface-hover)]',
            )}
          >
            <ChevronDown size={14} />
            <span className="text-xs">Latest</span>
          </Button>
        </div>
      )}
    </div>
  );
}
