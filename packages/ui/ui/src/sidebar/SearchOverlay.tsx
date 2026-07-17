'use client';

/**
 * SearchOverlay — the centered command-palette-style search modal the desktop
 * Sidebar opens. Pure presentation: results + handlers are passed in. Uses a
 * CSS fade (no framer-motion) and a plain backdrop. Escape/backdrop close.
 */
import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../cn';
import type { SidebarSession } from './types';

export interface SearchOverlayProps {
  open: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  results: SidebarSession[];
  activeSessionId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function SearchOverlay({
  open,
  query,
  onQueryChange,
  results,
  activeSessionId,
  onSelect,
  onClose,
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      data-state="open"
    >
      <div
        className="fixed left-1/2 top-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-xl bg-[hsl(var(--card))] shadow-2xl">
          <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-5 py-4">
            <Search className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
            <input
              ref={inputRef}
              placeholder="Search conversations..."
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
            />
            <kbd className="rounded bg-[hsl(var(--muted))] px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]">
              ESC
            </kbd>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {results.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                No conversations found
              </div>
            ) : (
              results.slice(0, 10).map((conv) => (
                <button
                  type="button"
                  key={conv.id}
                  onClick={() => {
                    onSelect(conv.id);
                    onClose();
                  }}
                  className={cn(
                    'w-full rounded-lg px-3 py-2 text-left transition-colors',
                    conv.id === activeSessionId
                      ? 'bg-[hsl(var(--primary))]/10'
                      : 'hover:bg-[hsl(var(--accent))]',
                  )}
                >
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {conv.title || 'Untitled'}
                  </div>
                  {(conv.lastMessage ?? conv.preview) && (
                    <div className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">
                      {conv.lastMessage ?? conv.preview}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
