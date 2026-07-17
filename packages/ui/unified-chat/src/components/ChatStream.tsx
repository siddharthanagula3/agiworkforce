/**
 * ChatStream — Phase A Slice 5 (ported from UAC)
 *
 * Wrapping component for the message list with:
 *   - Auto-scroll to bottom on new messages / streaming
 *   - Cmd+F in-conversation search bar
 *   - j/k keyboard navigation between messages
 *   - Scroll-to-bottom FAB
 *   - Loading / streaming indicators
 *
 * Desktop-specific dependencies removed:
 *   - useUnifiedChatStore → useChatStore (package store)
 *   - useSimpleModeStore  → isSimpleMode prop
 *   - IterationProgressPanel, ActiveToolStreams, Cards/*, InlineToolResults → deferred (Slice 6)
 *   - Approval cards → deferred (Slice 6)
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, Search, ChevronDown, ChevronUp, X, Sparkles, Activity } from 'lucide-react';
import React, { useMemo, useRef, useEffect, useState, useCallback, useDeferredValue } from 'react';
import { cn } from '../lib/utils';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useChatStore } from '../stores/chatStore';
import type { ChatMessage } from '../lib/types';

export interface ChatStreamProps {
  /** Whether to show simplified (non-agentic) indicators. */
  isSimpleMode?: boolean;
  /** Whether the agent is currently running. */
  isAgentRunning?: boolean;
  /** Current agent goal description (shown in running indicator). */
  agentGoal?: string | null;
  /** Called when user clicks a suggestion chip (passed through to host's emptyState). */
  onSuggestionClick?: (prompt: string) => void;
  /** Custom empty state to render when no messages. */
  emptyState?: React.ReactNode;
  /** Custom message renderer; when omitted, messages are rendered as plain text. */
  renderMessage?: (message: ChatMessage, index: number, isLast: boolean) => React.ReactNode;
  /**
   * When provided, overrides the store-sourced message list.
   * Useful for web surfaces and tests that manage messages externally.
   */
  messages?: ChatMessage[];
  className?: string;
}

export const ChatStream: React.FC<ChatStreamProps> = ({
  isSimpleMode = false,
  isAgentRunning = false,
  agentGoal = null,
  onSuggestionClick: _onSuggestionClick,
  emptyState,
  renderMessage,
  messages: messagesProp,
  className,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const isStreaming = useChatStore((s) => s.isStreaming);

  const storeMessages: ChatMessage[] = useMemo(
    () => (activeConversationId ? (messagesByConversation[activeConversationId] ?? []) : []),
    [activeConversationId, messagesByConversation],
  );

  // Prop overrides store — useful for web surfaces and tests
  const messages = messagesProp ?? storeMessages;

  // Auto-scroll to bottom on new messages or streaming content
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Message search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard navigation state
  const [focusedMessageIndex, setFocusedMessageIndex] = useState<number | null>(null);

  // AUDIT fix: Ref to track focus timeout for cleanup
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard navigation between messages
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSearch) return;
      const activeElement = document.activeElement;
      if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedMessageIndex((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, messages.length - 1);
          const el = scrollContainerRef.current?.querySelector(`[data-message-index="${next}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return next;
        });
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedMessageIndex((prev) => {
          const next = prev === null ? messages.length - 1 : Math.max(prev - 1, 0);
          const el = scrollContainerRef.current?.querySelector(`[data-message-index="${next}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return next;
        });
      } else if (e.key === 'Escape') {
        setFocusedMessageIndex(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, messages.length]);

  // Filter messages based on search
  const searchMatches = useMemo(() => {
    if (!showSearch || !deferredSearchQuery.trim()) return [];
    const query = deferredSearchQuery.toLowerCase();
    return messages
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) => msg.content.toLowerCase().includes(query));
  }, [messages, showSearch, deferredSearchQuery]);

  // Handle Cmd/Ctrl+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        if (focusTimeoutRef.current) {
          clearTimeout(focusTimeoutRef.current);
        }
        focusTimeoutRef.current = setTimeout(() => {
          searchInputRef.current?.focus();
          focusTimeoutRef.current = null;
        }, 50);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
        setCurrentMatchIndex(0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
      }
    };
  }, [showSearch]);

  // Scroll to current match
  useEffect(() => {
    if (searchMatches.length > 0 && scrollContainerRef.current) {
      const matchIndex = searchMatches[currentMatchIndex]?.index;
      if (matchIndex !== undefined) {
        const messageElement = scrollContainerRef.current.querySelector(
          `[data-message-index="${matchIndex}"]`,
        );
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [currentMatchIndex, searchMatches]);

  const navigateSearch = useCallback(
    (direction: 'next' | 'prev') => {
      if (searchMatches.length === 0) return;
      setCurrentMatchIndex((prev) => {
        if (direction === 'next') {
          return (prev + 1) % searchMatches.length;
        } else {
          return prev === 0 ? searchMatches.length - 1 : prev - 1;
        }
      });
    },
    [searchMatches.length],
  );

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    shouldAutoScroll.current = isAtBottom;
    setShowScrollButton(!isAtBottom && scrollHeight > clientHeight + 200);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  const lastMessageContentLength = useMemo(() => {
    if (messages.length === 0) return 0;
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.content?.length ?? 0;
  }, [messages]);

  const scrollAnimationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldAutoScroll.current || !scrollContainerRef.current) return;

    if (scrollAnimationRef.current !== null) {
      cancelAnimationFrame(scrollAnimationRef.current);
    }

    scrollAnimationRef.current = requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: isStreaming ? 'auto' : 'smooth',
        });
      }
      scrollAnimationRef.current = null;
    });

    return () => {
      if (scrollAnimationRef.current !== null) {
        cancelAnimationFrame(scrollAnimationRef.current);
        scrollAnimationRef.current = null;
      }
    };
  }, [messages.length, isStreaming, lastMessageContentLength]);

  return (
    <div className={cn('relative flex-1', className)}>
      {/* Message search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -20 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -20 }}
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.15 }}
            className="absolute top-0 left-0 right-0 z-20 p-2 bg-card/95 backdrop-blur-xs border-b border-white/10"
          >
            <div className="flex items-center gap-2 max-w-xl mx-auto">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentMatchIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      navigateSearch(e.shiftKey ? 'prev' : 'next');
                    }
                  }}
                  placeholder="Search messages..."
                  aria-label="Search messages"
                  className="w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                />
              </div>
              {searchQuery && (
                <span
                  className="text-xs text-muted-foreground tabular-nums whitespace-nowrap"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {searchMatches.length > 0
                    ? `${currentMatchIndex + 1} of ${searchMatches.length}`
                    : 'No matches'}
                </span>
              )}
              <div className="flex items-center gap-1" role="group" aria-label="Search navigation">
                <button
                  type="button"
                  onClick={() => navigateSearch('prev')}
                  disabled={searchMatches.length === 0}
                  className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Go to previous search match"
                >
                  <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => navigateSearch('next')}
                  disabled={searchMatches.length === 0}
                  className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Go to next search match"
                >
                  <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                  setCurrentMatchIndex(0);
                }}
                className="p-1.5 rounded hover:bg-accent transition-colors"
                aria-label="Close search"
              >
                <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex flex-col gap-4 overflow-y-auto h-full ${showSearch ? 'pt-16' : ''}`}
        style={{ paddingBottom: 'var(--agi-chat-input-reserve, 220px)' }}
      >
        {/* Loading / streaming indicators */}
        <AnimatePresence>
          {isStreaming && !messages.length ? (
            <motion.div
              key="thinking"
              className="flex items-start gap-3 px-4 py-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="bg-amber-900/20 dark:bg-amber-900/30 backdrop-blur-xs rounded-2xl rounded-tl-md px-4 py-3 border border-amber-500/20">
                <div className="flex items-center gap-2.5" role="status" aria-live="polite">
                  {prefersReducedMotion ? (
                    <span className="text-amber-500 dark:text-amber-400 font-mono text-base">
                      ✦
                    </span>
                  ) : (
                    <motion.span
                      className="text-amber-500 dark:text-amber-400 font-mono text-base"
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    >
                      ✦
                    </motion.span>
                  )}
                  <span className="text-sm text-amber-700 dark:text-amber-200">
                    {isSimpleMode ? 'Thinking about your question...' : 'Thinking...'}
                  </span>
                </div>
              </div>
            </motion.div>
          ) : isAgentRunning ? (
            <motion.div
              key="live-execution"
              className="flex items-start gap-3 px-4 py-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                <Activity className="h-4 w-4 text-white" />
              </div>
              <div className="bg-amber-900/20 dark:bg-amber-900/30 backdrop-blur-xs rounded-2xl rounded-tl-md px-4 py-2.5 border border-amber-500/20">
                <div className="flex items-center gap-2.5" role="status" aria-live="polite">
                  {prefersReducedMotion ? (
                    <div className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400" />
                  ) : (
                    <motion.div
                      className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400"
                      animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                  <span className="text-sm text-amber-700 dark:text-amber-200">
                    {isSimpleMode
                      ? agentGoal
                        ? `Working on it... ${agentGoal.slice(0, 40)}${agentGoal.length > 40 ? '...' : ''}`
                        : 'Working on your request...'
                      : 'Running...'}
                  </span>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {messages.length === 0
          ? (emptyState ?? <div className="flex-1 min-h-[40vh]" />)
          : messages.map((message, messageIndex) => {
              const isSearchMatch =
                deferredSearchQuery && searchMatches.some((m) => m.index === messageIndex);
              const isCurrentMatch =
                isSearchMatch && searchMatches[currentMatchIndex]?.index === messageIndex;
              const isKeyboardFocused = focusedMessageIndex === messageIndex;
              const isLastMessage = messageIndex === messages.length - 1;

              return (
                <div
                  key={message.id}
                  data-message-index={messageIndex}
                  className={`transition-all duration-200 rounded-lg ${
                    isCurrentMatch
                      ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-zinc-900'
                      : isSearchMatch
                        ? 'ring-1 ring-zinc-600'
                        : isKeyboardFocused
                          ? 'ring-2 ring-blue-500/50 ring-offset-2 ring-offset-zinc-900 bg-blue-500/5'
                          : ''
                  }`}
                >
                  {renderMessage ? (
                    renderMessage(message, messageIndex, isLastMessage)
                  ) : (
                    <div className="px-4 py-3">
                      <div
                        className={cn(
                          'text-sm',
                          message.role === 'user' ? 'text-foreground' : 'text-foreground/90',
                        )}
                      >
                        {message.content}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            type="button"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.9 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: prefersReducedMotion ? 0.15 : 0.2 }}
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-muted/90 backdrop-blur-xs border border-white/10 text-sm text-foreground hover:bg-accent/90 hover:text-white shadow-lg transition-colors z-10"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
            <span>New messages</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatStream;
