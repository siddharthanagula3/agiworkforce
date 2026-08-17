import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { useSkillMarketplaceStore } from '../../stores/skillMarketplaceStore';
import { SEARCH_INPUT_DEBOUNCE_MS as DEBOUNCE_MS } from '@agiworkforce/utils';

export function SkillSearchBar() {
  const storeQuery = useSkillMarketplaceStore((s) => s.searchQuery);
  const setSearchQuery = useSkillMarketplaceStore((s) => s.setSearchQuery);

  const [localValue, setLocalValue] = useState(storeQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (pendingValueRef.current !== null) {
      return;
    }
    if (storeQuery !== localValue) {
      setLocalValue(storeQuery);
    }
  }, [storeQuery, localValue]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalValue(value);
      pendingValueRef.current = value;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSearchQuery(value);
        pendingValueRef.current = null;
      }, DEBOUNCE_MS);
    },
    [setSearchQuery],
  );

  const handleClear = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    pendingValueRef.current = null;
    setLocalValue('');
    setSearchQuery('');
    inputRef.current?.focus();
  }, [setSearchQuery]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') handleClear();
    },
    [handleClear],
  );

  return (
    <div className="relative flex-1">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        role="searchbox"
        aria-label="Search skills"
        placeholder="Search skills..."
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={cn(
          'h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm',
          'text-foreground placeholder:text-muted-foreground',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
