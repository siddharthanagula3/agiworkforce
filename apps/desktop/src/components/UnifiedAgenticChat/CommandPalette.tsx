import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Clock, MessageSquare, FileText, Globe, X } from 'lucide-react';
import Fuse from 'fuse.js';
import {
  useUnifiedChatStore,
  type EnhancedMessage,
  type ConversationSummary,
} from '../../stores/unifiedChatStore';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

type SearchResult = {
  type: 'conversation' | 'message';
  conversation?: ConversationSummary;
  message?: EnhancedMessage;
  score: number;
  snippet?: string;
};

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const conversations = useUnifiedChatStore((state) => state.conversations);
  const selectConversation = useUnifiedChatStore((state) => state.selectConversation);

  // Handle selection
  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (result.type === 'conversation' && result.conversation) {
        selectConversation(result.conversation.id);
      }
      onClose();
    },
    [selectConversation, onClose],
  );

  // Create search index
  const searchResults = useMemo(() => {
    if (!query.trim()) {
      // Return recent conversations when no query
      return conversations
        .slice(0, 10)
        .sort((a, b) => (b.updatedAt?.valueOf() ?? 0) - (a.updatedAt?.valueOf() ?? 0))
        .map((conv) => ({
          type: 'conversation' as const,
          conversation: conv,
          score: 0,
        }));
    }

    // Search conversations only
    const conversationFuse = new Fuse(conversations, {
      keys: ['title', 'lastMessage'],
      threshold: 0.3,
      includeScore: true,
    });

    const conversationResults = conversationFuse.search(query).map((result) => ({
      type: 'conversation' as const,
      conversation: result.item,
      score: result.score ?? 0,
    }));

    return conversationResults.slice(0, 10);
  }, [query, conversations]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (searchResults[selectedIndex]) {
            handleSelect(searchResults[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, searchResults, selectedIndex, onClose, handleSelect]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Reset query when closing
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const getResultIcon = (result: SearchResult) => {
    if (result.type === 'conversation') {
      return <MessageSquare className="h-4 w-4" />;
    } else {
      return <FileText className="h-4 w-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-32" onClick={onClose}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Palette */}
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -20 }}
          transition={
            prefersReducedMotion
              ? { duration: 0.15 }
              : {
                  type: 'spring',
                  stiffness: 350,
                  damping: 30,
                }
          }
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'relative w-full max-w-2xl',
            'rounded-2xl border border-zinc-800',
            'bg-zinc-950/95 backdrop-blur-xl',
            'shadow-2xl shadow-black/50',
            'overflow-hidden',
          )}
          style={{ willChange: prefersReducedMotion ? 'auto' : 'opacity, transform' }}
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
            <Search className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations and messages..."
              className={cn(
                'flex-1 bg-transparent text-sm text-zinc-100 outline-none',
                'placeholder:text-zinc-500',
              )}
              autoFocus
              role="searchbox"
              aria-label="Search conversations and messages"
              aria-autocomplete="list"
              aria-controls="search-results"
              aria-activedescendant={
                searchResults.length > 0 ? `result-${selectedIndex}` : undefined
              }
            />
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
              aria-label="Close command palette"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto" id="search-results" role="listbox">
            {searchResults.length === 0 ? (
              <div className="px-4 py-12 text-center" role="status">
                <Globe className="mx-auto h-12 w-12 text-zinc-700" aria-hidden="true" />
                <p className="mt-4 text-sm text-zinc-500">
                  {query ? 'No results found' : 'Start typing to search...'}
                </p>
              </div>
            ) : (
              <div className="py-2">
                {searchResults.map((result, index) => (
                  <button
                    key={`${result.type}-${result.conversation?.id || index}`}
                    id={`result-${index}`}
                    onClick={() => handleSelect(result)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                      index === selectedIndex
                        ? 'bg-teal/20 border-l-2 border-teal'
                        : 'hover:bg-zinc-900/50 border-l-2 border-transparent',
                    )}
                    role="option"
                    aria-selected={index === selectedIndex}
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        index === selectedIndex
                          ? 'bg-teal/20 text-teal'
                          : 'bg-zinc-900 text-zinc-500',
                      )}
                    >
                      {getResultIcon(result)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-zinc-100">
                          {result.conversation?.title || 'Untitled'}
                        </span>
                        {result.conversation?.updatedAt && (
                          <span className="flex items-center gap-1 text-xs text-zinc-500">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(result.conversation.updatedAt)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {result.conversation?.lastMessage || 'No activity'}
                      </p>
                    </div>

                    {/* Keyboard hint */}
                    {index === selectedIndex && (
                      <kbd className="mt-1 rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono text-zinc-400">
                        ↵
                      </kbd>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs text-zinc-500">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono">↑</kbd>
                <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono">↓</kbd>
                <span className="ml-1">Navigate</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono">↵</kbd>
                <span className="ml-1">Select</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono">Esc</kbd>
                <span className="ml-1">Close</span>
              </div>
            </div>
            <span>{searchResults.length} results</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
