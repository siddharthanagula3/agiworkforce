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
import React, { Suspense, useMemo, useRef, useEffect, useState, useCallback } from 'react';

import { SidecarMode, useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { getToolRenderer, hasInlineRenderer } from './InlineToolResults';
import { Button } from '../ui/Button';
import { MessageBubble } from './MessageBubble';
import { CurrentActionBadge } from './CurrentActionBadge';

interface ChatStreamProps {
  onOpenSidecar?: (panel: SidecarMode, payload?: Record<string, unknown>) => void;
  onSuggestionClick?: (prompt: string) => void;
}

const card =
  'rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]';

// Suggestion prompts removed

// Keyboard shortcuts removed

export const ChatStream: React.FC<ChatStreamProps> = ({ onOpenSidecar }) => {
  const messages = useUnifiedChatStore((state) => state.messages);
  const agentStatus = useUnifiedChatStore((state) => state.agentStatus);
  const isLoading = useUnifiedChatStore((state) => state.isLoading);
  const isStreaming = useUnifiedChatStore((state) => state.isStreaming);
  const startEditingMessage = useUnifiedChatStore((state) => state.startEditingMessage);
  const showMessageTimestamps = useUnifiedChatStore((state) => state.showMessageTimestamps);

  const items = useMemo(() => messages ?? [], [messages]);

  // Auto-scroll to bottom on new messages or streaming content
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Message search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return items
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) => msg.content.toLowerCase().includes(query));
  }, [items, searchQuery]);

  // Handle Cmd/Ctrl+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
        setCurrentMatchIndex(0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

  // Auto-scroll effect
  useEffect(() => {
    if (shouldAutoScroll.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [items.length, isStreaming]);

  const handleRetry = (id: string, content: string) => {
    startEditingMessage(id, content);
  };

  const renderThought = (messageId: string, title: string, body: string) => (
    <details className={card} key={messageId} open>
      <summary className="flex items-center gap-2 cursor-pointer text-sm text-zinc-200">
        <Wand2 className="h-4 w-4 text-indigo-300" />
        {title}
      </summary>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200/90">{body}</p>
    </details>
  );

  const renderActionCard = (
    messageId: string,
    label: string,
    body: string,
    panel: SidecarMode,
    payload?: Record<string, unknown>,
  ) => (
    <div className={card} key={messageId}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-zinc-200">
          {panel === 'terminal' && <Terminal className="h-4 w-4 text-emerald-300" />}
          {panel === 'browser' && <MousePointerClick className="h-4 w-4 text-sky-300" />}
          {panel === 'code' && <Braces className="h-4 w-4 text-purple-300" />}
          {panel === 'preview' && <PanelTopOpen className="h-4 w-4 text-orange-300" />}
          {panel === 'diff' && <FileText className="h-4 w-4 text-slate-300" />}
          <span className="font-medium">{label}</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => onOpenSidecar?.(panel, payload)}>
          View output
        </Button>
      </div>
      <p className="mt-2 text-sm text-zinc-300">{body}</p>
    </div>
  );

  const renderInlineToolResult = (
    toolName: string,
    result: any,
    status?: 'running' | 'completed' | 'failed',
  ) => {
    if (!hasInlineRenderer(toolName)) {
      return null;
    }

    const Renderer = getToolRenderer(toolName);
    if (!Renderer) {
      return null;
    }

    return (
      <Suspense
        fallback={
          <div className={`${card} animate-pulse`}>
            <div className="h-24 bg-white/5 rounded" />
          </div>
        }
      >
        <Renderer result={result} status={status} />
      </Suspense>
    );
  };

  return (
    <div className="relative flex-1">
      {/* Message search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.15 }}
            className="absolute top-0 left-0 right-0 z-20 p-2 bg-zinc-900/95 backdrop-blur-sm border-b border-white/10"
          >
            <div className="flex items-center gap-2 max-w-xl mx-auto">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
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
                  className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                />
              </div>
              {searchQuery && (
                <span className="text-xs text-zinc-400 tabular-nums whitespace-nowrap">
                  {searchMatches.length > 0
                    ? `${currentMatchIndex + 1} of ${searchMatches.length}`
                    : 'No matches'}
                </span>
              )}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigateSearch('prev')}
                  disabled={searchMatches.length === 0}
                  className="p-1.5 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Previous match"
                >
                  <ChevronUp className="h-4 w-4 text-zinc-400" />
                </button>
                <button
                  onClick={() => navigateSearch('next')}
                  disabled={searchMatches.length === 0}
                  className="p-1.5 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Next match"
                >
                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                </button>
              </div>
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                  setCurrentMatchIndex(0);
                }}
                className="p-1.5 rounded hover:bg-zinc-700 transition-colors"
                title="Close search"
              >
                <X className="h-4 w-4 text-zinc-400" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current Action Indicator - shows at top when agent is working */}
      <div className="sticky top-0 z-10 flex justify-center py-2">
        <CurrentActionBadge />
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex flex-col gap-4 overflow-y-auto h-full ${showSearch ? 'pt-14' : ''}`}
      >
        <AnimatePresence>
          {}
          {isLoading && !isStreaming ? (
            <motion.div
              key="thinking"
              className="flex items-start gap-3 px-4 py-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              {/* Typing bubble */}
              <div className="bg-zinc-800/50 backdrop-blur-sm rounded-2xl rounded-tl-md px-4 py-3 border border-white/5">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full bg-purple-400"
                      animate={{
                        y: [0, -6, 0],
                        opacity: [0.5, 1, 0.5],
                      }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        delay: i * 0.15,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : agentStatus?.status === 'running' ? (
            <motion.div
              key="live-execution"
              className="flex items-start gap-3 px-4 py-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center flex-shrink-0">
                <Activity className="h-4 w-4 text-white animate-pulse" />
              </div>
              {/* Status bubble */}
              <div className="bg-emerald-900/30 backdrop-blur-sm rounded-2xl rounded-tl-md px-4 py-2.5 border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{
                          duration: 0.6,
                          repeat: Infinity,
                          delay: i * 0.1,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-emerald-200">Running...</span>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {items.length === 0
          ? null
          : items.map((message, messageIndex) => {
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
                searchQuery && searchMatches.some((m) => m.index === messageIndex);
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
                );
              }

              if (kind === 'terminal' && meta.command) {
                return renderActionCard(
                  message.id,
                  `Executed ${meta.command}`,
                  meta.preview || 'Command finished. View output for details.',
                  'terminal',
                  { command: meta.command, messageId: message.id },
                );
              }

              return (
                <div
                  key={message.id}
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
                    onToggleSidecar={(tab) => onOpenSidecar?.(tab)}
                    onRegenerate={() => handleRetry(message.id, message.content)}
                    onEdit={(content) => handleRetry(message.id, content)}
                  />
                  {(message.artifacts || (message.metadata as any)?.artifacts)?.length ? (
                    <div className="grid grid-cols-1 gap-2">
                      {(message.artifacts || (message.metadata as any)?.artifacts || []).map(
                        (artifact: any, idx: number) => {
                          // Check if this artifact has an inline renderer
                          const toolName = artifact.toolName || artifact.type;
                          const inlineRenderer =
                            toolName && hasInlineRenderer(toolName)
                              ? renderInlineToolResult(
                                  toolName,
                                  { data: artifact },
                                  artifact.status || 'completed',
                                )
                              : null;

                          // If inline renderer exists, use it
                          if (inlineRenderer) {
                            return (
                              <div key={idx} className="space-y-2">
                                {inlineRenderer}
                              </div>
                            );
                          }

                          // Fallback to clickable card
                          return (
                            <div
                              key={idx}
                              onClick={() => onOpenSidecar?.('preview', { artifact })}
                              className="cursor-pointer group flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 group-hover:text-teal-300 transition-colors">
                                  {artifact.type === 'image' ? (
                                    <FileText className="w-4 h-4" />
                                  ) : (
                                    <Braces className="w-4 h-4" />
                                  )}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-zinc-200">
                                    {artifact.title || 'Generated Artifact'}
                                  </div>
                                  <div className="text-xs text-zinc-400">
                                    {artifact.type === 'code' ? artifact.language : artifact.type}
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-zinc-400 group-hover:text-white"
                              >
                                View <PanelTopOpen className="ml-2 w-3 h-3" />
                              </Button>
                            </div>
                          );
                        },
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800/90 backdrop-blur-sm border border-white/10 text-sm text-zinc-200 hover:bg-zinc-700/90 hover:text-white shadow-lg transition-colors z-10"
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
