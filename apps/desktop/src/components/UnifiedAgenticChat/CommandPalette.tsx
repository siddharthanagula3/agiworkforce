import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Clock,
  MessageSquare,
  FileText,
  X,
  Loader2,
  TrendingUp,
  Zap,
  History,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Fuse from 'fuse.js';
import { useChatStore, dbIdToUuid, type ConversationSummary } from '../../stores/chat/chatStore';
import { cn } from '../../lib/utils';
import { invoke, isTauri } from '../../lib/tauri-mock';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  formatLastUsed,
  getCommandStats,
  getRecentCommandIds,
  recordCommandExecution,
} from '../../utils/commandHistory';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CommandOption {
  id: string;
  title: string;
  subtitle?: string;
  group?: string;
  shortcut?: string;
  icon?: LucideIcon;
  active?: boolean;
  action: () => void | Promise<void>;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  /** Command actions from the host shell (new chat, settings, theme, etc.) */
  commands?: CommandOption[];
}

interface ChatSearchResult {
  message_id: number;
  conversation_id: number;
  conversation_title: string | null;
  content_snippet: string;
  role: string;
  created_at: string;
  rank: number;
}

type ResultKind = 'command' | 'conversation' | 'message';

interface PaletteResult {
  kind: ResultKind;
  id: string;
  // for conversation/message results
  conversation?: ConversationSummary;
  ftsResult?: ChatSearchResult;
  score: number;
  snippet?: string;
  // for command results
  command?: CommandOption;
}

// ─── Date grouping helpers ───────────────────────────────────────────────────

type DateGroup = 'Today' | 'Yesterday' | 'This week' | 'Older';

function getDateGroup(date: Date | string | undefined): DateGroup {
  if (!date) return 'Older';
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return 'Today';
  if (diffDays < 2) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  return 'Older';
}

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Highlight utility ────────────────────────────────────────────────────────

function highlightSearchTerm(text: string, searchQuery: string): ReactNode {
  if (!searchQuery.trim()) return text;
  try {
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === searchQuery.toLowerCase() ? (
            <mark key={`hl-${i}`} className="bg-teal-500/30 text-teal-200 rounded-sm px-0.5">
              {part}
            </mark>
          ) : (
            <span key={`t-${i}`}>{part}</span>
          ),
        )}
      </>
    );
  } catch {
    return text;
  }
}

// ─── Recent search history (localStorage) ────────────────────────────────────

const RECENT_SEARCHES_KEY = 'agiworkforce-recent-searches';
const MAX_RECENT_SEARCHES = 6;

interface RecentSearchEntry {
  query: string;
  timestamp: number;
}

function getRecentSearches(): RecentSearchEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentSearchEntry[];
  } catch {
    return [];
  }
}

function recordRecentSearch(searchQuery: string): void {
  if (!searchQuery.trim() || searchQuery.trim().length < 3) return;
  try {
    const entries = getRecentSearches().filter(
      (e) => e.query.toLowerCase() !== searchQuery.toLowerCase(),
    );
    entries.unshift({ query: searchQuery.trim(), timestamp: Date.now() });
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(entries.slice(0, MAX_RECENT_SEARCHES)),
    );
  } catch {
    // Silently ignore storage errors
  }
}

function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Silently ignore
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CommandPalette({ isOpen, onClose, commands = [] }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [ftsResults, setFtsResults] = useState<ChatSearchResult[]>([]);
  const [ftsLoading, setFtsLoading] = useState(false);
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);
  const [recentSearchEntries, setRecentSearchEntries] = useState<RecentSearchEntry[]>([]);
  const ftsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const conversations = useChatStore((state) => state.conversations);
  const selectConversation = useChatStore((state) => state.selectConversation);

  // Load recent commands + recent searches on open
  useEffect(() => {
    if (isOpen) {
      setRecentCommandIds(getRecentCommandIds());
      setRecentSearchEntries(getRecentSearches());
    }
  }, [isOpen]);

  // Debounced FTS5 backend search for message content
  useEffect(() => {
    if (ftsDebounceRef.current) clearTimeout(ftsDebounceRef.current);
    if (!query.trim() || query.trim().length < 3 || !isTauri) {
      setFtsResults([]);
      return;
    }
    ftsDebounceRef.current = setTimeout(async () => {
      setFtsLoading(true);
      try {
        const results = await invoke<ChatSearchResult[]>('search_chat_history', {
          query: query.trim(),
          limit: 8,
        });
        setFtsResults(results);
        // Record search in recent history when results come back
        if (results.length > 0) {
          recordRecentSearch(query.trim());
        }
      } catch {
        setFtsResults([]);
      } finally {
        setFtsLoading(false);
      }
    }, 300);
    return () => {
      if (ftsDebounceRef.current) clearTimeout(ftsDebounceRef.current);
    };
  }, [query]);

  // Clear FTS results when closed
  useEffect(() => {
    if (!isOpen) {
      setFtsResults([]);
      setFtsLoading(false);
    }
  }, [isOpen]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Reset selection index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleCommandExecution = useCallback(
    (cmd: CommandOption) => {
      recordCommandExecution(cmd.id);
      Promise.resolve(cmd.action()).catch((error) => {
        console.error(`Command "${cmd.id}" failed`, error);
      });
      onClose();
    },
    [onClose],
  );

  const handleSelect = useCallback(
    (result: PaletteResult) => {
      if (result.kind === 'command' && result.command) {
        handleCommandExecution(result.command);
        return;
      }
      if (result.ftsResult) {
        // FTS5 returns conversation_id as an i64 SQLite row ID, but the store uses UUID strings.
        // Use dbIdToUuid to translate the numeric DB ID to the frontend UUID, then look it up.
        const uuid = dbIdToUuid(result.ftsResult.conversation_id);
        const conv = conversations.find((c) => c.id === uuid);
        if (conv) {
          selectConversation(conv.id);
        }
        // If no mapping exists (conversation not yet loaded into the store), silently skip.
      } else if (result.kind === 'conversation' && result.conversation) {
        selectConversation(result.conversation.id);
      }
      onClose();
    },
    [selectConversation, onClose, conversations, handleCommandExecution],
  );

  // Build unified result list
  const results = useMemo((): PaletteResult[] => {
    const q = query.trim();

    if (!q) {
      // Default mode: recent commands + recent conversations
      const recentSet = new Set(recentCommandIds);
      const recentCmds: PaletteResult[] = commands
        .filter((c) => recentSet.has(c.id))
        .sort((a, b) => recentCommandIds.indexOf(a.id) - recentCommandIds.indexOf(b.id))
        .map((c) => ({ kind: 'command' as const, id: `cmd-${c.id}`, command: c, score: 0 }));

      const recentConvs: PaletteResult[] = conversations
        .slice()
        .sort(
          (a, b) =>
            (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) -
            (a.updatedAt ? new Date(a.updatedAt).getTime() : 0),
        )
        .slice(0, 8)
        .map((conv) => ({
          kind: 'conversation' as const,
          id: `conv-${conv.id}`,
          conversation: conv,
          score: 0,
        }));

      return [...recentCmds, ...recentConvs].slice(0, 12);
    }

    const ql = q.toLowerCase();

    // Fuzzy-match commands
    const cmdFuse = new Fuse(commands, {
      keys: ['title', 'subtitle', 'group'],
      threshold: 0.35,
      includeScore: true,
    });
    const cmdResults: PaletteResult[] = cmdFuse
      .search(q)
      .slice(0, 3)
      .map((r) => ({
        kind: 'command' as const,
        id: `cmd-${r.item.id}`,
        command: r.item,
        score: r.score ?? 0,
      }));

    // Fuzzy-match conversations by title/lastMessage
    const convFuse = new Fuse(conversations, {
      keys: ['title', 'lastMessage'],
      threshold: 0.3,
      includeScore: true,
    });
    const convResults: PaletteResult[] = convFuse
      .search(q)
      .slice(0, 5)
      .map((r) => ({
        kind: 'conversation' as const,
        id: `conv-${r.item.id}`,
        conversation: r.item,
        score: r.score ?? 0,
      }));

    // FTS5 message results — rank is a negative float (more negative = better)
    const msgResults: PaletteResult[] = ftsResults.map((r) => ({
      kind: 'message' as const,
      id: `msg-${r.message_id}`,
      ftsResult: r,
      score: r.rank < 0 ? 1 / (1 - r.rank) : 1,
      snippet: r.content_snippet,
    }));

    // Also do simple fallback substring match for commands if fuse misses
    const cmdIds = new Set(cmdResults.map((r) => r.command?.id));
    const extraCmds: PaletteResult[] = commands
      .filter((c) => !cmdIds.has(c.id) && c.title.toLowerCase().includes(ql))
      .slice(0, 2)
      .map((c) => ({ kind: 'command' as const, id: `cmd-${c.id}`, command: c, score: 0.5 }));

    return [...cmdResults, ...extraCmds, ...convResults, ...msgResults].slice(0, 14);
  }, [query, conversations, ftsResults, commands, recentCommandIds]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]!);
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
  }, [isOpen, results, selectedIndex, onClose, handleSelect]);

  // ─── Render helpers ─────────────────────────────────────────────────────

  const getResultIcon = (result: PaletteResult) => {
    if (result.kind === 'command') {
      const Icon = result.command?.icon;
      return Icon ? <Icon className="h-4 w-4" /> : <Zap className="h-4 w-4" />;
    }
    if (result.ftsResult) return <FileText className="h-4 w-4" />;
    return <MessageSquare className="h-4 w-4" />;
  };

  const renderResultContent = (result: PaletteResult) => {
    const q = query.trim();

    if (result.kind === 'command' && result.command) {
      const cmd = result.command;
      const stats = getCommandStats(cmd.id);
      return (
        <div className="flex flex-1 items-center justify-between min-w-0">
          <div className="flex flex-col min-w-0">
            <span
              className={cn('text-sm font-medium text-foreground', cmd.active && 'text-teal-300')}
            >
              {q ? highlightSearchTerm(cmd.title, q) : cmd.title}
            </span>
            {cmd.subtitle && (
              <span className="text-xs text-muted-foreground truncate">
                {q ? highlightSearchTerm(cmd.subtitle, q) : cmd.subtitle}
              </span>
            )}
            {!cmd.subtitle && cmd.group && (
              <span className="text-xs text-muted-foreground truncate">{cmd.group}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {stats.lastUsed && (
              <span className="text-[10px] text-muted-foreground">
                {formatLastUsed(stats.lastUsed)}
              </span>
            )}
            {stats.executionCount > 1 && (
              <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <TrendingUp className="h-2.5 w-2.5" />
                {stats.executionCount}
              </span>
            )}
            {cmd.shortcut && (
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {cmd.shortcut}
              </kbd>
            )}
          </div>
        </div>
      );
    }

    if (result.ftsResult) {
      const r = result.ftsResult;
      return (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {q
                ? highlightSearchTerm(r.conversation_title || 'Untitled conversation', q)
                : r.conversation_title || 'Untitled conversation'}
            </span>
            <span className="shrink-0 rounded-full bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-medium text-teal-300">
              {r.role}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {q ? highlightSearchTerm(r.content_snippet, q) : r.content_snippet}
          </p>
        </div>
      );
    }

    // Conversation result
    const conv = result.conversation!;
    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {q ? highlightSearchTerm(conv.title || 'Untitled', q) : conv.title || 'Untitled'}
          </span>
          {conv.updatedAt && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(conv.updatedAt)}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {q && conv.lastMessage
            ? highlightSearchTerm(conv.lastMessage, q)
            : conv.lastMessage || 'No activity'}
        </p>
      </div>
    );
  };

  // Group results by section header for default (no-query) mode
  const sections = useMemo(() => {
    if (query.trim()) return null; // flat list in search mode

    type Section = { heading: string; items: PaletteResult[] };
    const sections: Section[] = [];

    const cmdItems = results.filter((r) => r.kind === 'command');
    if (cmdItems.length > 0) {
      sections.push({ heading: 'Recent Commands', items: cmdItems });
    }

    // Group conversation results by date
    const convItems = results.filter((r) => r.kind === 'conversation');
    const dateGroups: Record<DateGroup, PaletteResult[]> = {
      Today: [],
      Yesterday: [],
      'This week': [],
      Older: [],
    };
    for (const item of convItems) {
      const group = getDateGroup(item.conversation?.updatedAt);
      dateGroups[group].push(item);
    }
    const dateOrder: DateGroup[] = ['Today', 'Yesterday', 'This week', 'Older'];
    for (const label of dateOrder) {
      if (dateGroups[label].length > 0) {
        sections.push({ heading: label, items: dateGroups[label] });
      }
    }

    return sections;
  }, [results, query]);

  // Build a flat ordered list for keyboard navigation (same order as rendered)
  const flatResults = useMemo(() => {
    if (!sections) return results;
    return sections.flatMap((s) => s.items);
  }, [sections, results]);

  // Keep selectedIndex in sync with flatResults length
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, flatResults.length - 1)));
  }, [flatResults.length]);

  const renderItem = (result: PaletteResult, flatIndex: number) => {
    const isSelected = flatIndex === selectedIndex;
    return (
      <button
        type="button"
        key={result.id}
        id={`palette-result-${flatIndex}`}
        onClick={() => handleSelect(result)}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors',
          isSelected
            ? 'bg-teal-500/15 border-l-2 border-teal-500'
            : 'hover:bg-accent border-l-2 border-transparent',
        )}
        role="option"
        aria-selected={isSelected}
      >
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            isSelected ? 'bg-teal-500/20 text-teal-400' : 'bg-card text-muted-foreground',
          )}
        >
          {getResultIcon(result)}
        </div>
        {renderResultContent(result)}
        {isSelected && (
          <kbd className="mt-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground shrink-0">
            ↵
          </kbd>
        )}
      </button>
    );
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center pt-28"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={onClose}
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        />

        {/* Panel */}
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -20 }}
          transition={
            prefersReducedMotion
              ? { duration: 0.15 }
              : { type: 'spring', stiffness: 350, damping: 30 }
          }
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'relative w-full max-w-2xl',
            'rounded-2xl border border-border',
            'bg-background/95 backdrop-blur-xl',
            'shadow-2xl shadow-black/50',
            'overflow-hidden',
          )}
          style={{ willChange: prefersReducedMotion ? 'auto' : 'opacity, transform' }}
        >
          {/* Search header */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            {ftsLoading ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-teal-400" aria-hidden="true" />
            ) : (
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations, messages, or commands..."
              className={cn(
                'flex-1 bg-transparent text-sm text-foreground outline-hidden',
                'placeholder:text-muted-foreground',
              )}
              autoFocus
              role="searchbox"
              aria-label="Search conversations, messages, and commands"
              aria-autocomplete="list"
              aria-controls="palette-results"
              aria-activedescendant={
                flatResults.length > 0 ? `palette-result-${selectedIndex}` : undefined
              }
            />
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Close command palette"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[420px] overflow-y-auto" id="palette-results" role="listbox">
            {flatResults.length === 0 && !query.trim() ? (
              // Empty default view — show recent searches + empty state
              <div className="py-2">
                {recentSearchEntries.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-4 py-1.5">
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <History className="h-3 w-3" />
                        Recent Searches
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          clearRecentSearches();
                          setRecentSearchEntries([]);
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                    {recentSearchEntries.map((entry) => (
                      <button
                        type="button"
                        key={`rsearch-${entry.timestamp}`}
                        onClick={() => setQuery(entry.query)}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent transition-colors border-l-2 border-transparent"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-sm text-foreground truncate">{entry.query}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          {formatRelativeTime(new Date(entry.timestamp).toISOString())}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {recentSearchEntries.length === 0 && (
                  <div className="px-4 py-10 text-center" role="status">
                    <Search
                      className="mx-auto h-10 w-10 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="mt-3 text-sm text-muted-foreground">No recent activity</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Search conversations, messages, and commands
                    </p>
                  </div>
                )}
              </div>
            ) : flatResults.length === 0 && query.trim() ? (
              <div className="px-4 py-10 text-center" role="status">
                <Search className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 text-sm text-muted-foreground">No results found</p>
                <p className="mt-1 text-xs text-muted-foreground">Try different keywords</p>
              </div>
            ) : sections ? (
              // Grouped view (default, no query)
              <div className="py-2">
                {sections.map((section) => (
                  <div key={section.heading}>
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.heading}
                    </div>
                    {section.items.map((result) => renderItem(result, flatResults.indexOf(result)))}
                  </div>
                ))}
              </div>
            ) : (
              // Flat list (search mode) — group by kind
              <div className="py-2">
                {(() => {
                  const cmdResults = flatResults.filter((r) => r.kind === 'command');
                  const convResults = flatResults.filter((r) => r.kind === 'conversation');
                  const msgResults = flatResults.filter((r) => r.kind === 'message');
                  return (
                    <>
                      {cmdResults.length > 0 && (
                        <div>
                          <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Commands
                          </div>
                          {cmdResults.map((result) =>
                            renderItem(result, flatResults.indexOf(result)),
                          )}
                        </div>
                      )}
                      {convResults.length > 0 && (
                        <div>
                          <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Conversations
                          </div>
                          {convResults.map((result) =>
                            renderItem(result, flatResults.indexOf(result)),
                          )}
                        </div>
                      )}
                      {msgResults.length > 0 && (
                        <div>
                          <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Messages
                          </div>
                          {msgResults.map((result) =>
                            renderItem(result, flatResults.indexOf(result)),
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border bg-card/50 px-4 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">↑</kbd>
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">↓</kbd>
                <span className="ml-1">Navigate</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">↵</kbd>
                <span className="ml-1">Select</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Esc</kbd>
                <span className="ml-1">Close</span>
              </div>
            </div>
            <span>{flatResults.length} results</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default CommandPalette;
