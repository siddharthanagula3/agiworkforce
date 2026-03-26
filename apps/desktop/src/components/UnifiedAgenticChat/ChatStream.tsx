import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowDown,
  Braces,
  ChevronDown,
  ChevronUp,
  FileText,
  MousePointerClick,
  PanelTopOpen,
  Search,
  Sparkles,
  Terminal,
  Wand2,
  X,
} from 'lucide-react';
import { UsageLimitBannerContainer } from './UsageLimitBanner';
import React, {
  Suspense,
  useMemo,
  useRef,
  useEffect,
  useState,
  useCallback,
  useDeferredValue,
} from 'react';

import { SidecarMode, useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getToolRenderer, hasInlineRenderer } from './InlineToolResults';
import { Button } from '../ui/Button';
import { MessageBubble } from './MessageBubble';
import { ActiveToolStreams } from './Cards/ActiveToolStreams';
import { IterationProgressPanel } from '../AGI';
import { useSimpleModeStore, selectIsSimpleMode } from '../../stores/ui';
import { SimpleEmptyState } from './SimpleEmptyState';
import { AdvancedEmptyState } from './AdvancedEmptyState';
import { ToolRationaleDisplay } from './ToolRationaleDisplay';
import { ApprovalRequestCard } from './Cards/ApprovalRequestCard';
import { MessageRuntimeDecorators } from './MessageRuntimeActivity';
import { useUnassignedApprovals } from './useMessageRuntimeActivity';

interface ChatStreamProps {
  onOpenSidecar?: (panel: SidecarMode, payload?: Record<string, unknown>) => void;
  onSuggestionClick?: (prompt: string) => void;
}

import type { Artifact } from '../../types/chat';
import type { EnhancedMessage } from '../../stores/chat/types';

// Extended artifact type for message artifacts that may have additional properties
interface MessageArtifact extends Partial<Artifact> {
  toolName?: string;
  status?: 'running' | 'completed' | 'failed';
}

// Type for message metadata that may include artifacts
interface MessageMetadataWithArtifacts {
  artifacts?: MessageArtifact[];
  [key: string]: unknown;
}

interface ChatMessageItemProps {
  message: EnhancedMessage;
  messageIndex: number;
  isCurrentMatch: boolean;
  isSearchMatch: boolean;
  isKeyboardFocused: boolean;
  isLastMessage: boolean;
  showMessageTimestamps: boolean;
  onOpenSidecar?: (panel: SidecarMode, payload?: Record<string, unknown>) => void;
  onRetry: (id: string, content: string) => void;
  onEditSave: (messageId: string, newContent: string) => void;
  onSuggestionClick?: (suggestion: string) => void;
}

const ChatMessageItem = React.memo<ChatMessageItemProps>(
  ({
    message,
    messageIndex,
    isCurrentMatch,
    isSearchMatch,
    isKeyboardFocused,
    isLastMessage,
    showMessageTimestamps,
    onOpenSidecar,
    onRetry,
    onEditSave,
    onSuggestionClick,
  }) => {
    const renderInlineToolResult = (
      toolName: string,
      result: unknown,
      status?: 'running' | 'completed' | 'failed' | 'success' | 'error' | 'idle',
    ) => {
      if (!hasInlineRenderer(toolName)) {
        return null;
      }

      const Renderer = getToolRenderer(toolName);
      if (!Renderer) {
        return null;
      }

      const typedResult =
        result !== null && typeof result === 'object'
          ? (result as { data?: unknown; status?: typeof status; error?: string })
          : { data: result, status, error: undefined };

      return (
        <Suspense
          fallback={
            <div className={`${card} animate-pulse`}>
              <div className="h-24 bg-white/5 rounded" />
            </div>
          }
        >
          <Renderer result={typedResult} status={status} />
        </Suspense>
      );
    };

    return (
      <div
        data-message-index={messageIndex}
        className={`space-y-3 transition-all duration-200 rounded-lg ${
          isCurrentMatch
            ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-zinc-900'
            : isSearchMatch
              ? 'ring-1 ring-zinc-600'
              : isKeyboardFocused
                ? 'ring-2 ring-blue-500/50 ring-offset-2 ring-offset-zinc-900 bg-blue-500/5'
                : ''
        }`}
      >
        <MessageBubble
          message={message}
          showAvatar
          showTimestamp={showMessageTimestamps}
          enableActions
          isLastMessage={isLastMessage}
          onToggleSidecar={(tab) => onOpenSidecar?.(tab)}
          onRegenerate={() => onRetry(message.id, message.content)}
          onEdit={(content) => onRetry(message.id, content)}
          onEditSave={onEditSave}
          onSuggestionClick={onSuggestionClick}
        />
        {(() => {
          // Skip inline artifact rendering when the message is a tool call —
          // the tool timeline inside MessageBubble already renders these results.
          // Rendering them again here causes ugly duplication (red "Code operation failed"
          // cards below the clean timeline).
          const msgMeta = (message.metadata ?? {}) as Record<string, unknown>;
          const isToolCallMessage = Boolean(msgMeta['toolCall'] || msgMeta['toolName']);
          if (isToolCallMessage) return null;

          const artifactList: MessageArtifact[] =
            (message.artifacts as MessageArtifact[] | undefined) ??
            (message.metadata as MessageMetadataWithArtifacts | undefined)?.artifacts ??
            [];
          if (artifactList.length === 0) return null;
          return (
            <div className="grid grid-cols-1 gap-2">
              {artifactList.map((artifact, idx) => {
                const art = artifact as MessageArtifact;
                const toolName = art.toolName ?? art.type;
                const inlineRenderer =
                  toolName && hasInlineRenderer(toolName)
                    ? renderInlineToolResult(toolName, { data: art }, art.status ?? 'completed')
                    : null;

                if (inlineRenderer) {
                  return (
                    <div key={art.id ?? idx} className="space-y-2">
                      {inlineRenderer}
                    </div>
                  );
                }

                return (
                  <div
                    key={art.id ?? idx}
                    onClick={() =>
                      onOpenSidecar?.('preview', { artifactId: art.id, messageId: message.id })
                    }
                    className="cursor-pointer group flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 group-hover:text-teal-300 transition-colors">
                        {art.type === 'image' ? (
                          <FileText className="w-4 h-4" />
                        ) : (
                          <Braces className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {art.title ?? 'Generated Artifact'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {art.type === 'code'
                            ? (art.language ?? art.type)
                            : (art.type ?? 'artifact')}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground group-hover:text-white"
                    >
                      View <PanelTopOpen className="ml-2 w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    );
  },
  (prev, next) =>
    prev.message === next.message &&
    prev.isCurrentMatch === next.isCurrentMatch &&
    prev.isSearchMatch === next.isSearchMatch &&
    prev.isKeyboardFocused === next.isKeyboardFocused &&
    prev.isLastMessage === next.isLastMessage &&
    prev.showMessageTimestamps === next.showMessageTimestamps &&
    prev.onOpenSidecar === next.onOpenSidecar &&
    prev.onRetry === next.onRetry &&
    prev.onEditSave === next.onEditSave &&
    prev.onSuggestionClick === next.onSuggestionClick,
);
ChatMessageItem.displayName = 'ChatMessageItem';

const card =
  'rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]';

// Suggestion prompts removed

// Keyboard shortcuts removed

export const ChatStream: React.FC<ChatStreamProps> = ({ onOpenSidecar, onSuggestionClick }) => {
  const prefersReducedMotion = useReducedMotion();
  const messages = useUnifiedChatStore((state) => state.messages);
  const isSimpleMode = useSimpleModeStore(selectIsSimpleMode);
  const agentStatus = useUnifiedChatStore((state) => state.agentStatus);
  const isLoading = useUnifiedChatStore((state) => state.isLoading);
  const isStreaming = useUnifiedChatStore((state) => state.isStreaming);
  const pendingApprovals = useUnassignedApprovals();
  const startEditingMessage = useUnifiedChatStore((state) => state.startEditingMessage);
  const showMessageTimestamps = useUnifiedChatStore((state) => state.showMessageTimestamps);
  const editAndRegenerateFromMessage = useUnifiedChatStore(
    (state) => state.editAndRegenerateFromMessage,
  );

  const items = useMemo(() => messages ?? [], [messages]);

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

  // Keyboard navigation between messages
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when not in search mode and not in an input
      if (showSearch) return;
      const activeElement = document.activeElement;
      if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedMessageIndex((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, items.length - 1);
          const el = scrollContainerRef.current?.querySelector(`[data-message-index="${next}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return next;
        });
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedMessageIndex((prev) => {
          const next = prev === null ? items.length - 1 : Math.max(prev - 1, 0);
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
  }, [showSearch, items.length]);

  // Filter messages based on search
  const searchMatches = useMemo(() => {
    if (!showSearch || !deferredSearchQuery.trim()) return [];
    const query = deferredSearchQuery.toLowerCase();
    return items
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) => msg.content.toLowerCase().includes(query));
  }, [items, showSearch, deferredSearchQuery]);

  // AUDIT-005-002 fix: Ref to track focus timeout for cleanup
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle Cmd/Ctrl+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        // AUDIT-005-002 fix: Store timeout ID for cleanup
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
      // AUDIT-005-002 fix: Clear timeout on cleanup
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

  // Track if user has scrolled up (disable auto-scroll)
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // User is considered "at bottom" if within 100px of the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    shouldAutoScroll.current = isAtBottom;
    // Show scroll button when not at bottom and there's content to scroll
    setShowScrollButton(!isAtBottom && scrollHeight > clientHeight + 200);
  }, []);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  // Track the last message content length for auto-scroll during streaming
  const lastMessageContentLength = useMemo(() => {
    if (items.length === 0) return 0;
    const lastMessage = items[items.length - 1];
    return lastMessage?.content?.length ?? 0;
  }, [items]);

  // Ref to track pending scroll animation frame
  const scrollAnimationRef = useRef<number | null>(null);

  // Auto-scroll effect - debounced during streaming to prevent jitter
  useEffect(() => {
    if (!shouldAutoScroll.current || !scrollContainerRef.current) return;

    // Cancel any pending scroll animation
    if (scrollAnimationRef.current !== null) {
      cancelAnimationFrame(scrollAnimationRef.current);
    }

    // Use requestAnimationFrame to batch scroll updates and prevent jitter
    scrollAnimationRef.current = requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          // Use instant scroll during streaming to avoid animation queue-up,
          // smooth scroll only when not streaming (e.g., new message added)
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
  }, [items.length, isStreaming, lastMessageContentLength]);

  const handleRetry = useCallback(
    (id: string, content: string) => {
      startEditingMessage(id, content);
    },
    [startEditingMessage],
  );

  const handleEditSave = useCallback(
    (messageId: string, newContent: string) => {
      // Edit the message and remove subsequent messages for regeneration
      editAndRegenerateFromMessage(messageId, newContent);
      // Trigger regeneration by starting an edit with the new content
      // This will populate the input and allow the user to send
      startEditingMessage(messageId, newContent);
    },
    [editAndRegenerateFromMessage, startEditingMessage],
  );

  const renderThought = (messageId: string, title: string, body: string) => (
    <details className={card} key={messageId} open>
      <summary className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
        <Wand2 className="h-4 w-4 text-indigo-300" />
        {title}
      </summary>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{body}</p>
    </details>
  );

  const renderActionCard = (
    messageId: string,
    label: string,
    body: string,
    panel: SidecarMode,
    payload?: Record<string, unknown>,
    toolRationale?: {
      toolName?: string;
      rationale?: string;
      alternatives?: string[];
      capabilities?: string[];
    },
  ) => (
    <div className="space-y-2">
      {toolRationale?.toolName && <ToolRationaleDisplay rationale={toolRationale} />}
      <div className={card} key={messageId}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-foreground">
            {panel === 'terminal' && <Terminal className="h-4 w-4 text-emerald-300" />}
            {panel === 'browser' && <MousePointerClick className="h-4 w-4 text-sky-300" />}
            {panel === 'code' && <Braces className="h-4 w-4 text-amber-400" />}
            {panel === 'preview' && <PanelTopOpen className="h-4 w-4 text-orange-300" />}
            {panel === 'diff' && <FileText className="h-4 w-4 text-slate-300" />}
            <span className="font-medium">{label}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => onOpenSidecar?.(panel, payload)}>
            View output
          </Button>
        </div>
        <p className="mt-2 text-sm text-foreground">{body}</p>
      </div>
    </div>
  );

  return (
    <div className="relative flex-1">
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
                  title="Previous match"
                  aria-label="Go to previous search match"
                >
                  <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => navigateSearch('next')}
                  disabled={searchMatches.length === 0}
                  className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Next match"
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
                title="Close search"
                aria-label="Close search"
              >
                <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current Action Indicator removed per user request */}

      {/* Active Tool Streams - shows real-time progress for running tools (hidden in simple mode) */}
      {!isSimpleMode && (
        <ActiveToolStreams showCompleted={false} maxStreams={3} className="px-4 mb-2" />
      )}

      {/* AGI Iteration Progress Panel - shows reasoning loop progress (only when AGI task is running) */}
      {!isSimpleMode && agentStatus?.status === 'running' && agentStatus?.currentGoal && (
        <div className="px-4 mb-2">
          <IterationProgressPanel goalDescription={agentStatus.currentGoal} />
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex flex-col gap-4 overflow-y-auto h-full ${showSearch ? 'pt-16' : ''}`}
        style={{ paddingBottom: 'var(--agi-chat-input-reserve, 220px)' }}
      >
        <AnimatePresence>
          {}
          {isLoading && !isStreaming ? (
            <motion.div
              key="thinking"
              className="flex items-start gap-3 px-4 py-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Warm avatar - Claude style */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              {/* Thinking indicator - warm, communicative */}
              <div className="bg-amber-900/20 dark:bg-amber-900/30 backdrop-blur-xs rounded-2xl rounded-tl-md px-4 py-3 border border-amber-500/20">
                <div className="flex items-center gap-2.5" role="status" aria-live="polite">
                  {/* ASCII-style spinner - simplified for reduced motion */}
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
          ) : agentStatus?.status === 'running' ? (
            <motion.div
              key="live-execution"
              className="flex items-start gap-3 px-4 py-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Warm working avatar */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                <Activity className="h-4 w-4 text-white" />
              </div>
              {/* Working indicator - warm, communicative */}
              <div className="bg-amber-900/20 dark:bg-amber-900/30 backdrop-blur-xs rounded-2xl rounded-tl-md px-4 py-2.5 border border-amber-500/20">
                <div className="flex items-center gap-2.5" role="status" aria-live="polite">
                  {/* Pulsing indicator - simplified for reduced motion */}
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
                      ? agentStatus?.currentGoal
                        ? `Working on it... ${agentStatus.currentGoal.slice(0, 40)}${agentStatus.currentGoal.length > 40 ? '...' : ''}`
                        : 'Working on your request...'
                      : 'Running...'}
                  </span>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Inline usage limit banner — only shown when there are messages and usage > 70% */}
        <UsageLimitBannerContainer hasMessages={items.length > 0} />

        {items.length === 0 ? (
          /* Show appropriate empty state based on mode */
          isSimpleMode ? (
            <SimpleEmptyState onSuggestionClick={onSuggestionClick} />
          ) : (
            <AdvancedEmptyState onSuggestionClick={onSuggestionClick} />
          )
        ) : (
          items.map((message, messageIndex) => {
            const meta = message.metadata || {};
            const kind: SidecarMode | undefined =
              (meta.sidecarType as SidecarMode | undefined) ||
              (meta.tool === 'terminal'
                ? 'terminal'
                : meta.tool === 'browser'
                  ? 'browser'
                  : meta.tool === 'code'
                    ? 'code'
                    : meta.tool === 'media' || meta.tool === 'video'
                      ? 'preview'
                      : meta.tool === 'files'
                        ? 'code'
                        : undefined);

            // Check if this message is a search match or keyboard focused
            const isSearchMatch =
              deferredSearchQuery && searchMatches.some((m) => m.index === messageIndex);
            const isCurrentMatch =
              isSearchMatch && searchMatches[currentMatchIndex]?.index === messageIndex;
            const isKeyboardFocused = focusedMessageIndex === messageIndex;

            if (meta.phase === 'thinking' || meta.thinking) {
              return renderThought(
                message.id,
                meta.thinking?.title || 'Planning task...',
                meta.thinking?.details ||
                  message.content ||
                  'The agent is reasoning about this task.',
              );
            }

            if (meta.event === 'action' && kind) {
              return renderActionCard(
                message.id,
                meta.label || 'Action executed',
                meta.summary || message.content || 'Agent performed an action.',
                kind,
                { messageId: message.id, ...meta },
                meta.toolRationale,
              );
            }

            if (kind === 'terminal' && meta.command) {
              return renderActionCard(
                message.id,
                `Executed ${meta.command}`,
                meta.preview || 'Command finished. View output for details.',
                'terminal',
                { command: meta.command, messageId: message.id },
                meta.toolRationale,
              );
            }

            return (
              <React.Fragment key={message.id}>
                {message.role === 'assistant' && (
                  <MessageRuntimeDecorators
                    messageId={message.id}
                    isStreaming={Boolean(message.metadata?.streaming) && isStreaming}
                    className="mx-4 mb-1"
                  />
                )}
                <ChatMessageItem
                  message={message}
                  messageIndex={messageIndex}
                  isCurrentMatch={Boolean(isCurrentMatch)}
                  isSearchMatch={Boolean(isSearchMatch)}
                  isKeyboardFocused={Boolean(isKeyboardFocused)}
                  isLastMessage={messageIndex === items.length - 1}
                  showMessageTimestamps={showMessageTimestamps}
                  onOpenSidecar={onOpenSidecar}
                  onRetry={handleRetry}
                  onEditSave={handleEditSave}
                  onSuggestionClick={onSuggestionClick}
                />
              </React.Fragment>
            );
          })
        )}
        {pendingApprovals.length > 0 && (
          <div className="mx-4 mb-2 space-y-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-yellow-300">
              <PanelTopOpen className="h-3.5 w-3.5" />
              Unassigned approvals
            </div>
            {pendingApprovals.map((approval) => (
              <ApprovalRequestCard
                key={approval.id}
                approval={approval}
                className="border-yellow-500/30 bg-transparent"
              />
            ))}
          </div>
        )}
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
