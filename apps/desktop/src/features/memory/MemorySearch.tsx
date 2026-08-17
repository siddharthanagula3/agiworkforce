import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import type { MemoryEntry } from '@/stores/memoryStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { SEARCH_INPUT_DEBOUNCE_MS } from '@agiworkforce/utils';

export interface MemorySearchProps {
  onSearch?: (query: string) => void;
  onResults?: (results: MemoryEntry[]) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  useApiSearch?: boolean;
}

export const MemorySearch = memo(function MemorySearch({
  onSearch,
  onResults,
  placeholder = 'Search memories...',
  debounceMs = SEARCH_INPUT_DEBOUNCE_MS,
  className,
  useApiSearch = false,
}: MemorySearchProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    search: apiSearch,
    memories,
    isLoading: storeLoading,
  } = useMemoryStore(
    useShallow((s) => ({ search: s.search, memories: s.memories, isLoading: s.isLoading })),
  );

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      onSearch?.(query);

      if (!query.trim()) {
        onResults?.(memories);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);

      try {
        if (useApiSearch) {
          const results = await apiSearch(query, 50);
          onResults?.(results);
        } else {
          const lowercaseQuery = query.toLowerCase();
          const filtered = memories.filter(
            (memory) =>
              memory.topic.toLowerCase().includes(lowercaseQuery) ||
              memory.content.toLowerCase().includes(lowercaseQuery) ||
              memory.category.toLowerCase().includes(lowercaseQuery),
          );
          onResults?.(filtered);
        }
      } catch (error) {
        console.error('[MemorySearch] Search failed:', error);
        onResults?.(memories);
      } finally {
        setIsSearching(false);
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [query, apiSearch, memories, onSearch, onResults, useApiSearch, debounceMs]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        if (query) {
          handleClear();
        } else {
          inputRef.current?.blur();
        }
      }
    },
    [query, handleClear],
  );

  const showSpinner = isSearching || (storeLoading && query.trim().length > 0);
  const showClearButton = query.length > 0 && !showSpinner;

  return (
    <div className={cn('relative', className)}>
      {/* Search Icon */}
      <Search
        className={cn(
          'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors',
          query ? 'text-foreground' : 'text-muted-foreground',
        )}
      />

      {/* Input */}
      <Input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn('pl-9 pr-9', 'focus-visible:ring-1', query && 'pr-16')}
        aria-label="Search memories"
      />

      {/* Loading Spinner */}
      {showSpinner && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}

      {/* Clear Button */}
      {showClearButton && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClear}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-transparent"
          aria-label="Clear search"
        >
          <X className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
        </Button>
      )}
    </div>
  );
});

export function useMemorySearch(initialQuery = '') {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MemoryEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { memories } = useMemoryStore(useShallow((s) => ({ memories: s.memories })));

  useEffect(() => {
    if (!query.trim()) {
      setResults(memories);
    }
  }, [memories, query]);

  const handleSearch = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
    if (searchQuery.trim()) {
      setIsSearching(true);
    }
  }, []);

  const handleResults = useCallback((searchResults: MemoryEntry[]) => {
    setResults(searchResults);
    setIsSearching(false);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults(memories);
  }, [memories]);

  return {
    query,
    results,
    isSearching,
    handleSearch,
    handleResults,
    clearSearch,
    hasResults: results.length > 0,
    resultCount: results.length,
  };
}
