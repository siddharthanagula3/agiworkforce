/**
 * MemorySearch Component
 *
 * Search input with debounce for filtering memories.
 * Displays search results with highlighted matching text.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { MemoryEntry } from '@/stores/memoryStore';
import { useMemoryStore } from '@/stores/memoryStore';

export interface MemorySearchProps {
  /** Callback when search query changes (debounced) */
  onSearch?: (query: string) => void;
  /** Callback when search results are found */
  onResults?: (results: MemoryEntry[]) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
  /** Additional class names */
  className?: string;
  /** Whether to use the store's search API or filter locally */
  useApiSearch?: boolean;
}

export const MemorySearch = memo(function MemorySearch({
  onSearch,
  onResults,
  placeholder = 'Search memories...',
  debounceMs = 300,
  className,
  useApiSearch = false,
}: MemorySearchProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { search: apiSearch, memories, isLoading: storeLoading } = useMemoryStore();

  // Perform search with debounce
  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set up debounced search
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
          // Use the backend search API
          const results = await apiSearch(query, 50);
          onResults?.(results);
        } else {
          // Filter locally
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
        // On error, fall back to showing all memories
        onResults?.(memories);
      } finally {
        setIsSearching(false);
      }
    }, debounceMs);

    // Cleanup timeout on unmount or when dependencies change
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

/**
 * Hook for managing memory search state
 */
export function useMemorySearch(initialQuery = '') {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MemoryEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { memories } = useMemoryStore();

  // Update results when memories change and no active search
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
