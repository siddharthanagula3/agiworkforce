/**
 * MemoryPanel
 *
 * Full-featured memory management UI that lets users see and manage
 * what the AI "knows" about them. Supports search, category filtering,
 * add/delete operations, and expandable memory cards.
 */
import { Brain, Edit2, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import {
  useMemoryStore,
  selectMemories,
  selectMemoryLoading,
  type MemoryCategory,
  type MemoryEntry,
} from '../../stores/memoryStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { ScrollArea } from '../ui/ScrollArea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Slider } from '../ui/Slider';
import { Textarea } from '../ui/Textarea';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CategoryFilter = 'all' | MemoryCategory;

interface AddMemoryForm {
  category: MemoryCategory;
  topic: string;
  content: string;
  importance: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: 'Preference',
  fact: 'Fact',
  decision: 'Decision',
  context: 'Context',
};

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  preference: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  fact: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  decision: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  context: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
};

const FILTER_TABS: { label: string; value: CategoryFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Preferences', value: 'preference' },
  { label: 'Facts', value: 'fact' },
  { label: 'Decisions', value: 'decision' },
  { label: 'Context', value: 'context' },
];

const IMPORTANCE_BAR_SEGMENTS = 10;

const DEFAULT_FORM: AddMemoryForm = {
  category: 'fact',
  topic: '',
  content: '',
  importance: 5,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return `${m} ${m === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  }
  const d = Math.floor(diffSec / 86400);
  if (d < 30) return `${d} ${d === 1 ? 'day' : 'days'} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} ${mo === 1 ? 'month' : 'months'} ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} ${yr === 1 ? 'year' : 'years'} ago`;
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen) + '…';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ImportanceBar({ value }: { value: number }) {
  const filled = Math.round(Math.max(1, Math.min(IMPORTANCE_BAR_SEGMENTS, value)));
  return (
    <div className="flex items-center gap-1.5" aria-label={`Importance: ${value} out of 10`}>
      <div className="flex gap-0.5">
        {Array.from({ length: IMPORTANCE_BAR_SEGMENTS }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 w-2.5 rounded-full transition-colors',
              i < filled
                ? value >= 8
                  ? 'bg-amber-400'
                  : value >= 5
                    ? 'bg-teal-400'
                    : 'bg-zinc-400'
                : 'bg-zinc-700',
            )}
          />
        ))}
      </div>
      <span className="text-xs text-zinc-500">{value}/10</span>
    </div>
  );
}

interface MemoryCardProps {
  entry: MemoryEntry;
  onDelete: (entry: MemoryEntry) => void;
}

function MemoryCard({ entry, onDelete }: MemoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.content.length > 100;
  const displayContent = expanded || !isLong ? entry.content : truncate(entry.content, 100);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className="group rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-700 transition-colors p-4"
    >
      {/* Card header */}
      <div className="flex items-start gap-3 mb-2">
        {/* Star icon — highlight high importance */}
        <Star
          className={cn(
            'h-4 w-4 mt-0.5 shrink-0 transition-colors',
            entry.importance >= 8 ? 'fill-amber-400 text-amber-400' : 'text-zinc-600',
          )}
        />

        {/* Topic and category badge */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-zinc-100 truncate">{entry.topic}</span>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0',
                CATEGORY_COLORS[entry.category],
              )}
            >
              {CATEGORY_LABELS[entry.category]}
            </span>
          </div>
        </div>

        {/* Action buttons — appear on hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-red-400/10"
            onClick={() => onDelete(entry)}
            title="Forget this memory"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-zinc-400 leading-relaxed pl-7">
        {displayContent}
        {isLong && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="ml-1.5 text-teal-400 hover:text-teal-300 text-xs font-medium transition-colors"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </p>

      {/* Footer */}
      <div className="mt-3 pl-7 flex items-center justify-between gap-4">
        <ImportanceBar value={entry.importance} />
        <span className="text-xs text-zinc-600 shrink-0">
          {formatRelativeTime(entry.updated_at)}
        </span>
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-4 rounded-full bg-zinc-800" />
        <Skeleton className="h-4 w-2/5 bg-zinc-800" />
        <Skeleton className="h-5 w-16 rounded-full bg-zinc-800 ml-2" />
      </div>
      <Skeleton className="h-3.5 w-full bg-zinc-800 ml-7" />
      <Skeleton className="h-3.5 w-3/4 bg-zinc-800 ml-7" />
      <div className="flex items-center justify-between ml-7">
        <Skeleton className="h-2 w-24 bg-zinc-800" />
        <Skeleton className="h-2 w-16 bg-zinc-800" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Memory Dialog
// ---------------------------------------------------------------------------

interface AddMemoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (form: AddMemoryForm) => Promise<void>;
  isSaving: boolean;
}

function AddMemoryDialog({ isOpen, onClose, onSave, isSaving }: AddMemoryDialogProps) {
  const [form, setForm] = useState<AddMemoryForm>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const topicRef = useRef<HTMLInputElement>(null);

  // Reset and focus on open
  useEffect(() => {
    if (isOpen) {
      setForm(DEFAULT_FORM);
      setError(null);
      setTimeout(() => topicRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleSave = async () => {
    if (!form.topic.trim()) {
      setError('Topic is required.');
      return;
    }
    if (!form.content.trim()) {
      setError('Content is required.');
      return;
    }
    setError(null);
    await onSave(form);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.18 }}
            className={cn(
              'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
              'w-full max-w-md',
              'rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-teal-400" />
                <h2 className="text-base font-semibold text-zinc-100">Add Memory</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form body */}
            <div className="p-5 space-y-4">
              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Category
                </label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v as MemoryCategory }))}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 focus:ring-teal-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
                      <SelectItem
                        key={cat}
                        value={cat}
                        className="text-zinc-200 focus:bg-zinc-700 focus:text-zinc-100"
                      >
                        {CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Topic */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Topic
                </label>
                <Input
                  ref={topicRef}
                  value={form.topic}
                  onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                  placeholder="e.g. Preferred coding language"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:ring-teal-500"
                />
              </div>

              {/* Content */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Content
                </label>
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="What should I remember?"
                  rows={3}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:ring-teal-500 resize-none"
                />
              </div>

              {/* Importance slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                    Importance
                  </label>
                  <span className="text-sm font-semibold text-zinc-200">{form.importance}/10</span>
                </div>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={[form.importance]}
                  onValueChange={([v]) => setForm((f) => ({ ...f, importance: v ?? f.importance }))}
                  className="[&_[data-radix-slider-range]]:bg-teal-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={isSaving}
                className="text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-teal-600 hover:bg-teal-500 text-white"
              >
                {isSaving ? 'Saving…' : 'Save Memory'}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirm Dialog
// ---------------------------------------------------------------------------

interface DeleteConfirmDialogProps {
  entry: MemoryEntry | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({ entry, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && entry) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [entry, onCancel]);

  return (
    <AnimatePresence>
      {entry && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
              'w-full max-w-sm',
              'rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl p-6 space-y-4',
            )}
          >
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-zinc-100">Forget this memory?</h3>
              <p className="text-sm text-zinc-400">
                "{entry.topic}" will be permanently removed. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={onCancel}
                className="text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </Button>
              <Button onClick={onConfirm} className="bg-red-600 hover:bg-red-500 text-white">
                Forget
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Main MemoryPanel
// ---------------------------------------------------------------------------

export interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MemoryPanel({ isOpen, onClose }: MemoryPanelProps) {
  const memories = useMemoryStore(selectMemories);
  const isLoading = useMemoryStore(selectMemoryLoading);
  const loadAll = useMemoryStore((state) => state.loadAll);
  const remember = useMemoryStore((state) => state.remember);
  const forget = useMemoryStore((state) => state.forget);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchResults, setSearchResults] = useState<MemoryEntry[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemoryEntry | null>(null);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = useMemoryStore((state) => state.search);

  // Load all memories when panel opens
  useEffect(() => {
    if (isOpen) {
      loadAll();
    }
  }, [isOpen, loadAll]);

  // Close on Escape (only when add dialog and delete dialog are both closed)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !addDialogOpen && !deleteTarget) {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, addDialogOpen, deleteTarget]);

  // Debounce search query
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery]);

  // Run search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    search(debouncedQuery.trim(), 50)
      .then((results) => {
        setSearchResults(results);
      })
      .catch(() => {
        setSearchResults([]);
      })
      .finally(() => {
        setIsSearching(false);
      });
  }, [debouncedQuery, search]);

  // Derive the displayed list
  const displayedMemories = useMemo<MemoryEntry[]>(() => {
    const base = searchResults !== null ? searchResults : memories;
    if (categoryFilter === 'all') return base;
    return base.filter((m) => m.category === categoryFilter);
  }, [memories, searchResults, categoryFilter]);

  const handleSave = useCallback(
    async (form: AddMemoryForm) => {
      setIsSaving(true);
      try {
        await remember(form.category, form.topic, form.content, form.importance);
      } finally {
        setIsSaving(false);
      }
    },
    [remember],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await forget(deleteTarget.category, deleteTarget.topic);
    setDeleteTarget(null);
  }, [deleteTarget, forget]);

  // Show loading skeletons
  const showSkeletons = isLoading && memories.length === 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 48 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'fixed right-0 top-0 bottom-0 z-40',
              'w-full max-w-xl',
              'flex flex-col',
              'bg-zinc-950 border-l border-zinc-800 shadow-2xl',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-teal-500/15 flex items-center justify-center">
                  <Brain className="h-4.5 w-4.5 text-teal-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">Memory</h2>
                  <p className="text-[11px] text-zinc-500">
                    {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setAddDialogOpen(true)}
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-500 text-white flex items-center gap-1.5 h-8 px-3 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Memory
                </Button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Search bar */}
            <div className="px-4 py-3 border-b border-zinc-800 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search memories..."
                  className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:ring-teal-500 h-9 text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category filter tabs */}
            <div className="flex items-center gap-1 px-4 py-2.5 border-b border-zinc-800 shrink-0 overflow-x-auto scrollbar-none">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setCategoryFilter(tab.value)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0',
                    categoryFilter === tab.value
                      ? 'bg-teal-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Memory list */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {/* Loading skeletons */}
                {(showSkeletons || isSearching) &&
                  Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}

                {/* Memory cards */}
                {!showSkeletons && !isSearching && (
                  <AnimatePresence mode="popLayout">
                    {displayedMemories.map((entry) => (
                      <MemoryCard
                        key={`${entry.category}-${entry.topic}-${entry.id}`}
                        entry={entry}
                        onDelete={setDeleteTarget}
                      />
                    ))}
                  </AnimatePresence>
                )}

                {/* Empty state */}
                {!showSkeletons && !isSearching && displayedMemories.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                  >
                    <div className="h-14 w-14 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
                      <Brain className="h-7 w-7 text-zinc-600" />
                    </div>
                    {searchQuery ? (
                      <>
                        <p className="text-sm font-medium text-zinc-400 mb-1">No results found</p>
                        <p className="text-xs text-zinc-600">
                          Try a different search term or clear the filter.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-zinc-400 mb-1">No memories yet</p>
                        <p className="text-xs text-zinc-600 max-w-xs">
                          As you chat, I'll remember things about you. You can also add memories
                          manually.
                        </p>
                        <Button
                          onClick={() => setAddDialogOpen(true)}
                          size="sm"
                          className="mt-4 bg-teal-600 hover:bg-teal-500 text-white h-8 px-3 text-xs flex items-center gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add your first memory
                        </Button>
                      </>
                    )}
                  </motion.div>
                )}
              </div>
            </ScrollArea>

            {/* Footer hint */}
            <div className="shrink-0 px-4 py-3 border-t border-zinc-800">
              <p className="text-[11px] text-zinc-600 text-center">
                Memories help the AI personalize responses for you across all conversations.
              </p>
            </div>
          </motion.div>

          {/* Add Memory Dialog (z-50 sits above panel at z-40) */}
          <AddMemoryDialog
            isOpen={addDialogOpen}
            onClose={() => setAddDialogOpen(false)}
            onSave={handleSave}
            isSaving={isSaving}
          />

          {/* Delete Confirm Dialog */}
          <DeleteConfirmDialog
            entry={deleteTarget}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteTarget(null)}
          />
        </>
      )}
    </AnimatePresence>
  );
}

export default MemoryPanel;

// Re-export for convenience
export { Edit2 };
