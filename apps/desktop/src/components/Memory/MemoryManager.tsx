/**
 * MemoryManager Component
 *
 * Comprehensive memory management interface with project-specific
 * filtering, search, viewing, editing, and deletion capabilities.
 *
 * Features:
 * - Display all memories for current project
 * - Search memories by content, topic, and category
 * - Filter by memory type (preference, fact, decision, context)
 * - View detailed memory information
 * - Edit memory importance and content
 * - Delete memories with confirmation
 * - Import/export memories
 */
import { memo, useCallback, useMemo, useState } from 'react';
import { ArrowUpDown, Brain, Clock, Download, Plus, RefreshCw, Star } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { ScrollArea } from '@/components/ui/ScrollArea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
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
import { MemorySearch } from './MemorySearch';
import { CreateMemoryDialog } from './CreateMemoryDialog';

type SortOption = 'importance-desc' | 'importance-asc' | 'date-desc' | 'date-asc' | 'topic-asc';
type TabValue = 'all' | MemoryCategory;

const TAB_OPTIONS: { value: TabValue; label: string }[] = [
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
  { value: 'topic-asc', label: 'Alphabetical', icon: <Brain className="h-4 w-4" /> },
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

export interface MemoryManagerProps {
  /** Additional class names */
  className?: string;
  /** Maximum height for scroll area */
  maxHeight?: string;
  /** Show create memory button */
  showCreateButton?: boolean;
  /** Show import/export buttons */
  showImportExport?: boolean;
}

export const MemoryManager = memo(function MemoryManager({
  className,
  maxHeight = 'calc(100vh - 250px)',
  showCreateButton = true,
  showImportExport = false,
}: MemoryManagerProps) {
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [sortBy, setSortBy] = useState<SortOption>('importance-desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryEntry[]>([]);

  const { memories, isLoading, error, loadAll } = useMemoryStore();

  // Category selectors for counts
  const preferences = useMemoryStore(selectPreferences);
  const facts = useMemoryStore(selectFacts);
  const decisions = useMemoryStore(selectDecisions);
  const contextMemories = useMemoryStore(selectContextMemories);

  // Process and display memories
  const displayedMemories = useMemo(() => {
    const baseMemories = searchQuery.trim() ? searchResults : memories;
    const filtered = filterByCategory(baseMemories, activeTab);
    return sortMemories(filtered, sortBy);
  }, [memories, searchResults, searchQuery, activeTab, sortBy]);

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

  const handleRefresh = useCallback(async () => {
    await loadAll();
  }, [loadAll]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSearchResults = useCallback((results: MemoryEntry[]) => {
    setSearchResults(results);
  }, []);

  const handleExport = useCallback(() => {
    const data = {
      exported_at: new Date().toISOString(),
      memories: displayedMemories,
      total_count: displayedMemories.length,
      filter: {
        category: activeTab,
        sort: sortBy,
        search: searchQuery,
      },
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `memories-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [displayedMemories, activeTab, sortBy, searchQuery]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as TabValue);
  }, []);

  const handleSortChange = useCallback((value: string) => {
    setSortBy(value as SortOption);
  }, []);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Memory Manager</h2>
          <span className="text-sm text-zinc-400">({memories.length} memories)</span>
        </div>

        <div className="flex items-center gap-2">
          {showImportExport && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                disabled={memories.length === 0}
                className="h-8 text-zinc-400 hover:text-white"
                title="Export memories as JSON"
              >
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="h-8 text-zinc-400 hover:text-white"
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search and Sort Controls */}
      <div className="flex items-center gap-3 py-4">
        <MemorySearch
          onSearch={handleSearch}
          onResults={handleSearchResults}
          className="flex-1"
          placeholder="Search by topic, content, or category..."
        />
        <Select value={sortBy} onValueChange={handleSortChange}>
          <SelectTrigger className="w-[180px] bg-zinc-800 border-zinc-700 text-white">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-white">
                <div className="flex items-center gap-2">
                  {option.icon}
                  {option.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showCreateButton && (
          <CreateMemoryDialog
            trigger={
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            }
          />
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-3 mb-4 rounded-lg bg-red-500/10 text-red-400 text-sm border border-red-500/20">
          {error}
        </div>
      )}

      {/* Tabs and Content */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start bg-zinc-800 border-b border-zinc-700 rounded-none">
          {TAB_OPTIONS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex items-center gap-1.5 data-[state=active]:bg-zinc-700 text-zinc-300 data-[state=active]:text-white"
            >
              {tab.label}
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-900 text-zinc-400">
                {categoryCounts[tab.value]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Memory Cards */}
        <TabsContent value={activeTab} className="flex-1 mt-4">
          <ScrollArea style={{ maxHeight }} className="pr-4">
            {displayedMemories.length === 0 ? (
              <EmptyState
                hasMemories={memories.length > 0}
                query={searchQuery}
                category={activeTab}
              />
            ) : (
              <div className="space-y-3">
                {displayedMemories.map((memory) => (
                  <MemoryCard
                    key={memory.id}
                    memory={memory}
                    highlightText={searchQuery || undefined}
                  />
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
function EmptyState({
  hasMemories,
  query,
  category,
}: {
  hasMemories: boolean;
  query: string;
  category: TabValue;
}) {
  if (query) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
          <Brain className="h-6 w-6 text-zinc-500" />
        </div>
        <h3 className="font-medium text-white mb-1">No matching memories</h3>
        <p className="text-sm text-zinc-400 max-w-sm">
          No memories found matching &quot;{query}&quot;. Try a different search term.
        </p>
      </div>
    );
  }

  if (!hasMemories) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
          <Brain className="h-6 w-6 text-zinc-500" />
        </div>
        <h3 className="font-medium text-white mb-1">No memories yet</h3>
        <p className="text-sm text-zinc-400 max-w-sm">
          Start saving memories to help AGI Workforce remember important details across sessions.
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
      <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
        <Brain className="h-6 w-6 text-zinc-500" />
      </div>
      <h3 className="font-medium text-white mb-1">No {categoryLabels[category]}</h3>
      <p className="text-sm text-zinc-400 max-w-sm">
        No {categoryLabels[category]} found. Create one to help remember important details.
      </p>
    </div>
  );
}
