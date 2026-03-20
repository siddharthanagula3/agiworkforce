/**
 * SearchModal — Unified Spotlight Search (Cmd+K)
 *
 * Claude.ai-style unified search modal that searches across chats, projects,
 * and artifacts in one view. Shows type icons, timestamps, and project
 * attribution. Supports keyboard navigation and client-side fuzzy filtering.
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Search, MessageSquare, Folder, FileCode, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../../stores/chat/chatStore';
import { useProjectStore } from '../../stores/projectStore';
import { useArtifactStore } from '../../stores/artifactStore';
import { useSearchModal } from '../../hooks/useSearchModal';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { ConversationSummary } from '../../stores/chat/types';
import type { Project } from '../../stores/projectStore';
import type { ArtifactSummary } from '../../stores/artifactStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultType = 'chat' | 'project' | 'artifact';
type FilterTab = 'all' | 'chats' | 'projects';

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  updatedAt?: Date | string;
  /** Payload for navigation on select */
  payload: ConversationSummary | Project | ArtifactSummary;
}

// ─── Timestamp helper ─────────────────────────────────────────────────────────

function formatTimestamp(date: Date | string | undefined): string {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return 'Past hour';
  if (diffHours < 24) return 'Today';
  if (diffDays < 2) return 'Yesterday';
  if (diffDays < 7) return 'Past week';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Result icon ──────────────────────────────────────────────────────────────

function ResultIcon({ type, selected }: { type: ResultType; selected: boolean }) {
  const className = cn('h-4 w-4', selected ? 'text-teal-400' : 'text-zinc-500');

  switch (type) {
    case 'chat':
      return <MessageSquare className={className} />;
    case 'project':
      return <Folder className={className} />;
    case 'artifact':
      return <FileCode className={className} />;
  }
}

// ─── SearchModal ──────────────────────────────────────────────────────────────

export function SearchModal() {
  const isOpen = useSearchModal((s) => s.isOpen);
  const close = useSearchModal((s) => s.close);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Store data
  const conversations = useChatStore((s) => s.conversations);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const projects = useProjectStore((s) => s.projects);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const summaries = useArtifactStore((s) => s.summaries);
  const setActiveArtifact = useArtifactStore((s) => s.setActiveArtifact);
  const openArtifactPanel = useArtifactStore((s) => s.openPanel);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) return;

    setQuery('');
    setFilter('all');
    setSelectedIndex(0);
    // Autofocus input after animation frame
    const frameId = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frameId);
  }, [isOpen]);

  // Reset selection when query or filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, filter]);

  // Build search results from store data
  const results = useMemo((): SearchResult[] => {
    const q = query.trim().toLowerCase();

    const chatResults: SearchResult[] =
      filter === 'all' || filter === 'chats'
        ? conversations
            .filter((c) => !c.archived)
            .filter(
              (c) =>
                !q || c.title.toLowerCase().includes(q) || c.lastMessage?.toLowerCase().includes(q),
            )
            .slice(0, 8)
            .map((c) => ({
              id: `chat-${c.id}`,
              type: 'chat' as const,
              title: c.title || 'Untitled chat',
              subtitle: c.lastMessage || undefined,
              updatedAt: c.updatedAt,
              payload: c,
            }))
        : [];

    const projectResults: SearchResult[] =
      filter === 'all' || filter === 'projects'
        ? projects
            .filter((p) => !p.isArchived)
            .filter(
              (p) =>
                !q ||
                p.name.toLowerCase().includes(q) ||
                (p.description ?? '').toLowerCase().includes(q),
            )
            .slice(0, 6)
            .map((p) => ({
              id: `project-${p.id}`,
              type: 'project' as const,
              title: p.name,
              subtitle: p.description || undefined,
              updatedAt: p.updatedAt,
              payload: p,
            }))
        : [];

    const artifactResults: SearchResult[] =
      filter === 'all'
        ? summaries
            .filter((a) => a.status !== 'archived')
            .filter((a) => !q || a.title.toLowerCase().includes(q))
            .slice(0, 5)
            .map((a) => ({
              id: `artifact-${a.id}`,
              type: 'artifact' as const,
              title: a.title,
              subtitle: a.artifact_type,
              updatedAt: a.updated_at,
              payload: a,
            }))
        : [];

    // When there's no query, sort all by recency
    if (!q) {
      const allResults = [...chatResults, ...projectResults, ...artifactResults];
      return allResults.sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });
    }

    return [...chatResults, ...projectResults, ...artifactResults];
  }, [query, filter, conversations, projects, summaries]);

  // Group results by type for display
  const groupedResults = useMemo(() => {
    if (query.trim()) {
      // In search mode, group by type
      const chats = results.filter((r) => r.type === 'chat');
      const projectItems = results.filter((r) => r.type === 'project');
      const artifacts = results.filter((r) => r.type === 'artifact');
      return { chats, projects: projectItems, artifacts };
    }
    return null;
  }, [results, query]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      switch (result.type) {
        case 'chat': {
          const conv = result.payload as ConversationSummary;
          selectConversation(conv.id);
          break;
        }
        case 'project': {
          const project = result.payload as Project;
          setActiveProject(project.id);
          break;
        }
        case 'artifact': {
          const artifact = result.payload as ArtifactSummary;
          setActiveArtifact(artifact.id);
          openArtifactPanel();
          break;
        }
      }
      close();
    },
    [selectConversation, setActiveProject, setActiveArtifact, openArtifactPanel, close],
  );

  // Keyboard navigation — only register the listener while the modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
          close();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, handleSelect, close]);

  if (!isOpen) return null;

  const renderResultItem = (result: SearchResult, flatIndex: number) => {
    const isSelected = flatIndex === selectedIndex;
    return (
      <button
        key={result.id}
        type="button"
        id={`search-result-${flatIndex}`}
        onClick={() => handleSelect(result)}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors',
          isSelected
            ? 'bg-teal-500/15 border-l-2 border-teal-500'
            : 'hover:bg-zinc-900/50 border-l-2 border-transparent',
        )}
        role="option"
        aria-selected={isSelected}
      >
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            isSelected ? 'bg-teal-500/20' : 'bg-zinc-900',
          )}
        >
          <ResultIcon type={result.type} selected={isSelected} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">{result.title}</span>
            {result.updatedAt && (
              <span className="flex items-center gap-1 shrink-0 text-xs text-zinc-500">
                <Clock className="h-3 w-3" />
                {formatTimestamp(result.updatedAt)}
              </span>
            )}
          </div>
          {result.subtitle && (
            <p className="mt-0.5 truncate text-xs text-zinc-500">{result.subtitle}</p>
          )}
        </div>

        {isSelected && (
          <kbd className="mt-1 rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono text-zinc-400 shrink-0">
            ↵
          </kbd>
        )}
      </button>
    );
  };

  const renderGrouped = () => {
    if (!groupedResults) {
      // Flat chronological list (no search query)
      if (results.length === 0) {
        return (
          <div className="px-4 py-10 text-center" role="status">
            <Search className="mx-auto h-10 w-10 text-zinc-700" aria-hidden="true" />
            <p className="mt-3 text-sm text-zinc-500">No chats, projects, or artifacts yet</p>
          </div>
        );
      }
      return <div className="py-2">{results.map((result, i) => renderResultItem(result, i))}</div>;
    }

    const { chats, projects: projectItems, artifacts } = groupedResults;

    if (results.length === 0) {
      return (
        <div className="px-4 py-10 text-center" role="status">
          <Search className="mx-auto h-10 w-10 text-zinc-700" aria-hidden="true" />
          <p className="mt-3 text-sm text-zinc-500">No results for &ldquo;{query}&rdquo;</p>
          <p className="mt-1 text-xs text-zinc-600">Try different keywords</p>
        </div>
      );
    }

    // Build a flat ordered index for keyboard nav: chats → projects → artifacts
    const orderedResults = [...chats, ...projectItems, ...artifacts];

    return (
      <div className="py-2">
        {chats.length > 0 && (
          <div>
            <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Chats
            </div>
            {chats.map((result) => renderResultItem(result, orderedResults.indexOf(result)))}
          </div>
        )}
        {projectItems.length > 0 && (
          <div>
            <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Projects
            </div>
            {projectItems.map((result) => renderResultItem(result, orderedResults.indexOf(result)))}
          </div>
        )}
        {artifacts.length > 0 && (
          <div>
            <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Artifacts
            </div>
            {artifacts.map((result) => renderResultItem(result, orderedResults.indexOf(result)))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center pt-28"
        role="dialog"
        aria-modal="true"
        aria-label="Spotlight search"
        onClick={close}
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
            'rounded-2xl border border-zinc-800',
            'bg-zinc-950/95 backdrop-blur-xl',
            'shadow-2xl shadow-black/50',
            'overflow-hidden',
          )}
          style={{ willChange: prefersReducedMotion ? 'auto' : 'opacity, transform' }}
        >
          {/* Search header */}
          <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
            <Search className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats and projects..."
              className={cn(
                'flex-1 bg-transparent text-sm text-zinc-100 outline-hidden',
                'placeholder:text-zinc-500',
              )}
              role="searchbox"
              aria-label="Search chats, projects, and artifacts"
              aria-autocomplete="list"
              aria-controls="search-results"
              aria-activedescendant={
                results.length > 0 ? `search-result-${selectedIndex}` : undefined
              }
            />
            <button
              type="button"
              onClick={close}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
              aria-label="Close search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 border-b border-zinc-800/60 px-4 py-2">
            {(['all', 'chats', 'projects'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors',
                  filter === tab
                    ? 'bg-teal-500/20 text-teal-300'
                    : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300',
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Results */}
          <div
            className="max-h-[420px] overflow-y-auto"
            id="search-results"
            role="listbox"
            aria-label="Search results"
          >
            {renderGrouped()}
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
                <span className="ml-1">Open</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono">Esc</kbd>
                <span className="ml-1">Close</span>
              </div>
            </div>
            <span>
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
