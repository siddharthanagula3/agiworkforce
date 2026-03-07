/**
 * MemoryViewer Component
 *
 * Main memory browser component with tabs for category filtering,
 * search functionality, and sorting options.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpDown, Brain, Clock, RefreshCw, Star } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { ScrollArea } from '@/components/ui/ScrollArea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import type { MemoryCategory, MemoryEntry } from '@/stores/memoryStore';
import {
  useMemoryStore,
  selectPreferences,
  selectFacts,
  selectDecisions,
  selectContextMemories,
} from '@/stores/memoryStore';

import { MemoryCard } from './MemoryCard';
import { MemorySearch, useMemorySearch } from './MemorySearch';

type SortOption = 'importance-desc' | 'importance-asc' | 'date-desc' | 'date-asc' | 'topic-asc';
type TabValue = 'all' | MemoryCategory;

const TAB_OPTIONS: { value: TabValue; label: string; icon?: React.ReactNode }[] = [
  { value: 'all', label: 'All' },
  { value: 'preference', label: 'Preferences' },
  { value: 'fact', label: 'Facts' },
  { value: 'decision', label: 'Decisions' },
  { value: 'context', label: 'Context' },
];

const SORT_OPTIONS: { value: SortOption; label: string; icon: React.ReactNode }[] = [
  { value: 'importance-desc', label: 'Most Important', icon: <Star className="h-4 w-4" /> },
  { value: 'importance-asc', label: 'Least Important', icon: <Star className="h-4 w-4" /> },
  { value: 'date-desc', label: 'Newest First', icon: <Clock className="h-4 w-4" /> },
  { value: 'date-asc', label: 'Oldest First', icon: <Clock className="h-4 w-4" /> },
  { value: 'topic-asc', label: 'Alphabetical', icon: <ArrowDownAZ className="h-4 w-4" /> },
];

/**
 * Sort memories based on selected option
 */
function sortMemories(memories: MemoryEntry[], sortBy: SortOption): MemoryEntry[] {
  const sorted = [...memories];

  switch (sortBy) {
    case 'importance-desc':
      return sorted.sort((a, b) => b.importance - a.importance);
    case 'importance-asc':
      return sorted.sort((a, b) => a.importance - b.importance);
    case 'date-desc':
      return sorted.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
    case 'date-asc':
      return sorted.sort(
        (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(),
      );
    case 'topic-asc':
      return sorted.sort((a, b) => a.topic.localeCompare(b.topic));
    default:
      return sorted;
  }
}

/**
 * Filter memories by category
 */
function filterByCategory(memories: MemoryEntry[], category: TabValue): MemoryEntry[] {
  if (category === 'all') {
    return memories;
  }
  return memories.filter((m) => m.category === category);
}

export interface MemoryViewerProps {
  /** Additional class names */
  className?: string;
  /** Initial tab to display */
  initialTab?: TabValue;
  /** Initial sort option */
  initialSort?: SortOption;
  /** Maximum height for the scroll area */
  maxHeight?: string;
}

export const MemoryViewer = memo(function MemoryViewer({
  className,
  initialTab = 'all',
  initialSort = 'importance-desc',
  maxHeight = 'calc(100vh - 200px)',
}: MemoryViewerProps) {
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  const [sortBy, setSortBy] = useState<SortOption>(initialSort);

  const { memories, isLoading, error, loadAll } = useMemoryStore();

  // Category selectors for tab counts
  const preferences = useMemoryStore(selectPreferences);
  const facts = useMemoryStore(selectFacts);
  const decisions = useMemoryStore(selectDecisions);
  const contextMemories = useMemoryStore(selectContextMemories);

  // Search state
  const { query, results, handleSearch, handleResults } = useMemorySearch();

  // Load memories on mount
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Process and display memories
  const displayedMemories = useMemo(() => {
    // Start with search results or all memories
    const baseMemories = query.trim() ? results : memories;
    // Filter by category
    const filtered = filterByCategory(baseMemories, activeTab);
    // Sort
    return sortMemories(filtered, sortBy);
  }, [memories, results, query, activeTab, sortBy]);

  // Category counts
  const categoryCounts = useMemo(
    () => ({
      all: memories.length,
      preference: preferences.length,
      fact: facts.length,
      decision: decisions.length,
      context: contextMemories.length,
    }),
    [memories.length, preferences.length, facts.length, decisions.length, contextMemories.length],
  );

  const handleRefresh = useCallback(() => {
    loadAll();
  }, [loadAll]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as TabValue);
  }, []);

  const handleSortChange = useCallback((value: string) => {
    setSortBy(value as SortOption);
  }, []);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-foreground" />
          <h2 className="text-lg font-semibold">Memory</h2>
          <span className="text-sm text-muted-foreground">({memories.length} memories)</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="h-8"
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Search and Sort Controls */}
      <div className="flex items-center gap-3 py-4">
        <MemorySearch
          onSearch={handleSearch}
          onResults={handleResults}
          className="flex-1"
          placeholder="Search by topic, content, or category..."
        />
        <Select value={sortBy} onValueChange={handleSortChange}>
          <SelectTrigger className="w-[180px]">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-2">
                  {option.icon}
                  {option.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start">
          {TAB_OPTIONS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-1.5">
              {tab.label}
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  activeTab === tab.value
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {categoryCounts[tab.value]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Content for all tabs - using single content area */}
        <TabsContent value={activeTab} className="flex-1 mt-4">
          <ScrollArea style={{ maxHeight }} className="pr-4">
            {isLoading && memories.length === 0 ? (
              // Loading skeleton
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-3 p-4 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ))}
              </div>
            ) : displayedMemories.length === 0 ? (
              // Empty state
              <EmptyState query={query} category={activeTab} />
            ) : (
              // Memory cards
              <div className="space-y-3">
                {displayedMemories.map((memory) => (
                  <MemoryCard key={memory.id} memory={memory} highlightText={query || undefined} />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
});

/**
 * Empty state component
 */
function EmptyState({ query, category }: { query: string; category: TabValue }) {
  if (query) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Brain className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-foreground mb-1">No matching memories</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          No memories found matching &ldquo;{query}&rdquo;. Try a different search term.
        </p>
      </div>
    );
  }

  const categoryLabels: Record<TabValue, string> = {
    all: 'memories',
    preference: 'preferences',
    fact: 'facts',
    decision: 'decisions',
    context: 'context memories',
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Brain className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium text-foreground mb-1">No {categoryLabels[category]} yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        {category === 'all'
          ? 'As you interact with the AI, it will remember important details here.'
          : `No ${categoryLabels[category]} have been saved yet.`}
      </p>
    </div>
  );
}
