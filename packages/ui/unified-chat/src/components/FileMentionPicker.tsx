/**
 * FileMentionPicker — Phase A Slice 5 (ported from UAC)
 *
 * Dropdown picker for @file mentions in the chat input.
 * Shows a filtered list of files with keyboard navigation.
 *
 * Desktop-specific dependencies removed:
 *   - invoke('glob_search' | 'dir_list') → replaced by an async `onSearch` callback prop
 *   - useProjectStore → projectRoot prop
 *
 * Hosts wire in their own filesystem search (Tauri invoke, REST, etc.)
 * via the `onSearch` prop. Falls back to the provided `entries` prop if
 * `onSearch` is not supplied (useful for testing).
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { File, FileText, Folder, Loader2, Search } from 'lucide-react';
import { cn } from '../lib/utils';

export interface MentionFile {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

export interface FileMentionPickerProps {
  /** Text typed after the @ prefix, used to filter files */
  query: string;
  /** Called when a file is selected */
  onSelect: (file: MentionFile) => void;
  /** Called when the picker should close */
  onClose: () => void;
  /**
   * Async search callback. Hosts supply filesystem access here.
   * Receives (query, projectRoot) and resolves to a list of MentionFile.
   * When omitted, the picker shows the provided `staticEntries`.
   */
  onSearch?: (query: string, projectRoot: string | null) => Promise<MentionFile[]>;
  /** Static entries to show (useful when onSearch not provided, e.g. tests). */
  staticEntries?: MentionFile[];
  /** Project root path (used as context for the search). */
  projectRoot?: string | null;
}

const MAX_RESULTS = 12;

function getFileIcon(entry: MentionFile) {
  if (entry.isDir) return <Folder size={14} className="shrink-0 text-blue-400" />;
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  const codeExts = [
    'ts',
    'tsx',
    'js',
    'jsx',
    'py',
    'rs',
    'go',
    'java',
    'kt',
    'c',
    'cpp',
    'h',
    'rb',
    'php',
    'swift',
    'dart',
    'zig',
  ];
  const textExts = ['md', 'txt', 'json', 'yaml', 'yml', 'toml', 'css', 'html', 'xml', 'sh'];
  if (codeExts.includes(ext)) return <FileText size={14} className="shrink-0 text-emerald-400" />;
  if (textExts.includes(ext))
    return <FileText size={14} className="shrink-0 text-muted-foreground" />;
  return <File size={14} className="shrink-0 text-muted-foreground" />;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function shortPath(fullPath: string, projectRoot: string | null): string {
  if (projectRoot && fullPath.startsWith(projectRoot)) {
    return fullPath.slice(projectRoot.length).replace(/^[/\\]/, '');
  }
  return fullPath;
}

export const FileMentionPicker: React.FC<FileMentionPickerProps> = ({
  query,
  onSelect,
  onClose,
  onSearch,
  staticEntries = [],
  projectRoot = null,
}) => {
  // Compute initial entries synchronously so SSR renders the correct filtered list.
  const initialEntries = useMemo(() => {
    if (onSearch) return staticEntries.slice(0, MAX_RESULTS); // will be overridden by onSearch
    const q = query.toLowerCase().replace(/^file:/, '');
    if (!q) return staticEntries.slice(0, MAX_RESULTS);
    return staticEntries
      .filter((e) => e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only on mount — useEffect keeps it updated

  const [entries, setEntries] = useState<MentionFile[]>(initialEntries);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  // Refs for keyboard handler (avoids stale closures)
  const entriesRef = useRef<MentionFile[]>([]);
  const selectedIndexRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load entries from onSearch when query changes
  useEffect(() => {
    if (!onSearch) {
      // Use static entries directly, filtered by query
      const q = query.toLowerCase().replace(/^file:/, '');
      if (!q) {
        setEntries(staticEntries.slice(0, MAX_RESULTS));
      } else {
        setEntries(
          staticEntries
            .filter((e) => e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q))
            .slice(0, MAX_RESULTS),
        );
      }
      return;
    }

    setIsLoading(true);
    onSearch(query, projectRoot)
      .then((results) => {
        if (isMountedRef.current) {
          setEntries(results.slice(0, MAX_RESULTS));
        }
      })
      .catch(() => {
        if (isMountedRef.current) setEntries([]);
      })
      .finally(() => {
        if (isMountedRef.current) setIsLoading(false);
      });
  }, [query, projectRoot, onSearch, staticEntries]);

  // Keep refs in sync
  entriesRef.current = entries;
  selectedIndexRef.current = selectedIndex;

  useEffect(() => {
    setSelectedIndex(0);
  }, [entries.length, query]);

  const handleEntryActivate = useCallback(
    (entry: MentionFile) => {
      if (!entry.isDir) {
        onSelect(entry);
      }
      // Directory click: no-op here — host can extend if needed
    },
    [onSelect],
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const currentEntries = entriesRef.current;
      const currentIdx = selectedIndexRef.current;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev >= currentEntries.length - 1 ? 0 : prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev <= 0 ? currentEntries.length - 1 : prev - 1));
      } else if (e.key === 'Enter' && currentEntries.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const entry = currentEntries[currentIdx];
        if (entry) handleEntryActivate(entry);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose, handleEntryActivate]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = list.querySelectorAll<HTMLElement>('[data-mention-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const cleanQuery = query.startsWith('file:') ? query.slice(5) : query;
  const isSearchMode = cleanQuery.trim().length > 0;

  return (
    <div
      ref={listRef}
      className={cn(
        'absolute bottom-full left-0 z-50 mb-2 w-80 max-h-72 overflow-y-auto',
        'rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--popover))] shadow-2xl backdrop-blur-xl',
      )}
      role="listbox"
      aria-label="File mentions"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-2">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {isSearchMode ? (
            <>
              <Search size={10} />
              Files matching &quot;{cleanQuery}&quot;
            </>
          ) : (
            'Files — type to search'
          )}
        </span>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          <span>Searching…</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="px-3 py-4 text-sm text-muted-foreground">
          {cleanQuery ? `No files matching &quot;${cleanQuery}&quot;` : 'No files found'}
        </div>
      ) : (
        entries.map((entry, i) => (
          <button
            type="button"
            key={entry.path}
            data-mention-item
            role="option"
            aria-selected={i === selectedIndex}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
              i === selectedIndex
                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground'
                : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]',
            )}
            onClick={() => handleEntryActivate(entry)}
            onMouseEnter={() => setSelectedIndex(i)}
          >
            {getFileIcon(entry)}
            <span className="flex-1 truncate font-medium">{entry.name}</span>
            {isSearchMode && (
              <span className="shrink-0 max-w-[120px] truncate text-[10px] text-muted-foreground">
                {shortPath(entry.path, projectRoot)}
              </span>
            )}
            {!entry.isDir && !isSearchMode && entry.size > 0 && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatSize(entry.size)}
              </span>
            )}
            {entry.isDir && <span className="shrink-0 text-[10px] text-muted-foreground">/</span>}
          </button>
        ))
      )}
    </div>
  );
};

export default FileMentionPicker;
