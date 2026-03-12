/**
 * FileMentionPicker Component
 *
 * Dropdown picker that appears when the user types `@file:query` or `@path.ext`
 * in the chat input. Shows a filtered list of files with keyboard navigation.
 *
 * Search strategy:
 * - If query is empty or no project folder set: lists the project root directory.
 * - If query contains a `/` or `\`: drills into that directory path.
 * - Otherwise: uses `glob_search` to find files matching `**‌/<query>*` across
 *   the whole project (same as OpenCode's `@` file mention).
 *
 * Selected files are injected into the chat as `@path/to/file.ts` tokens, which
 * the context builder reads and includes as file content in the system prompt.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { File, FileText, Folder, Loader2, Search } from 'lucide-react';
import { invoke } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';
import { useProjectStore, selectCurrentFolder } from '../../stores/projectStore';

export interface MentionFile {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

interface FileMentionPickerProps {
  /** Text typed after the @ prefix, used to filter files */
  query: string;
  /** Called when a file is selected */
  onSelect: (file: MentionFile) => void;
  /** Called when the picker should close */
  onClose: () => void;
}

interface DirEntry {
  name: string;
  path: string;
  is_file: boolean;
  is_dir: boolean;
  size: number;
}

interface GlobMatch {
  path: string;
  relativePath: string;
  isFile: boolean;
  sizeBytes: number;
  modifiedSecs: number;
}

interface GlobSearchResult {
  matches: GlobMatch[];
  truncated: boolean;
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
  if (textExts.includes(ext)) return <FileText size={14} className="shrink-0 text-gray-400" />;
  return <File size={14} className="shrink-0 text-gray-400" />;
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
}) => {
  const [entries, setEntries] = useState<MentionFile[]>([]);
  const [browsePath, setBrowsePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const currentFolder = useProjectStore(selectCurrentFolder);

  // Refs for keyboard handler (avoids stale closures)
  const filteredRef = useRef<MentionFile[]>([]);
  const selectedIndexRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const rootPath = browsePath ?? currentFolder ?? null;

  // ── Glob-based search for non-empty queries ────────────────────────────────
  const searchByGlob = useCallback(
    async (searchQuery: string, root: string) => {
      setIsLoading(true);
      try {
        // Build a glob pattern that matches the query anywhere in the path.
        const cleanQuery = searchQuery.replace(/^[@/\\]+/, '');
        const globPattern = cleanQuery.includes('/') ? `**/${cleanQuery}*` : `**/*${cleanQuery}*`;

        const result = await invoke<GlobSearchResult>('glob_search', {
          pattern: globPattern,
          root,
          limit: MAX_RESULTS,
        });

        if (!isMountedRef.current) return;

        const mapped: MentionFile[] = result.matches.map((m) => ({
          name: m.path.split('/').pop() ?? m.path,
          path: m.path,
          isDir: !m.isFile,
          size: m.sizeBytes,
        }));

        setEntries(mapped);
      } catch {
        if (isMountedRef.current) {
          // Fallback to directory listing if glob_search isn't available yet.
          await loadDirEntries(root);
        }
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Directory listing for empty query or explicit directory browse ─────────
  const loadDirEntries = useCallback(async (path: string) => {
    setIsLoading(true);
    try {
      const results = await invoke<DirEntry[]>('dir_list', { path });
      if (!isMountedRef.current) return;
      const mapped: MentionFile[] = results
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          path: e.path,
          isDir: e.is_dir,
          size: e.size ?? 0,
        }))
        .sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      setEntries(mapped);
    } catch {
      if (isMountedRef.current) setEntries([]);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, []);

  // ── Effect: load entries when query or browsePath changes ──────────────────
  useEffect(() => {
    if (!rootPath) {
      setEntries([]);
      return;
    }
    // Strip the "file:" prefix if present (legacy @file: trigger).
    const cleanQuery = query.startsWith('file:') ? query.slice(5) : query;

    if (browsePath) {
      // Explicit directory browse — always do a directory listing.
      void loadDirEntries(browsePath);
    } else if (cleanQuery.trim().length > 0) {
      // Query present — use glob search.
      void searchByGlob(cleanQuery, rootPath);
    } else {
      // No query — list project root.
      void loadDirEntries(rootPath);
    }
  }, [rootPath, query, browsePath, loadDirEntries, searchByGlob]);

  // Client-side filter on top of server results (for instant response on dir listing).
  const displayEntries = entries.slice(0, MAX_RESULTS);

  // Keep refs in sync for keyboard handler.
  filteredRef.current = displayEntries;
  selectedIndexRef.current = selectedIndex;

  useEffect(() => {
    setSelectedIndex(0);
  }, [displayEntries.length, query]);

  const handleEntryActivate = useCallback(
    (entry: MentionFile) => {
      if (entry.isDir) {
        setBrowsePath(entry.path);
      } else {
        onSelect(entry);
      }
    },
    [onSelect],
  );

  // Keyboard navigation.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const currentFiltered = filteredRef.current;
      const currentIdx = selectedIndexRef.current;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev >= currentFiltered.length - 1 ? 0 : prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev <= 0 ? currentFiltered.length - 1 : prev - 1));
      } else if (e.key === 'Enter' && currentFiltered.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const entry = currentFiltered[currentIdx];
        if (entry) handleEntryActivate(entry);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose, handleEntryActivate]);

  // Scroll selected item into view.
  // BUG-FMP-04: list.children[selectedIndex] was off-by-header because the
  // first child is the header <div>, not a file item. Use a targeted selector
  // on the data-mention-item attribute instead.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = list.querySelectorAll<HTMLElement>('[data-mention-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!rootPath) {
    return (
      <div
        className={cn(
          'absolute bottom-full left-0 z-50 mb-2 w-80',
          'rounded-xl border border-gray-200/70 bg-white/95 shadow-2xl backdrop-blur-xl',
          'dark:border-gray-700 dark:bg-charcoal-900/95',
          'px-4 py-3',
        )}
      >
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Select a project folder first to use @file mentions.
        </p>
      </div>
    );
  }

  const cleanQuery = query.startsWith('file:') ? query.slice(5) : query;
  const isSearchMode = cleanQuery.trim().length > 0 && !browsePath;

  return (
    <div
      ref={listRef}
      className={cn(
        'absolute bottom-full left-0 z-50 mb-2 w-80 max-h-72 overflow-y-auto',
        'rounded-xl border border-gray-200/70 bg-white/95 shadow-2xl backdrop-blur-xl',
        'dark:border-gray-700 dark:bg-charcoal-900/95',
      )}
      role="listbox"
      aria-label="File mentions"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {isSearchMode ? (
            <>
              <Search size={10} />
              Files matching "{cleanQuery}"
            </>
          ) : (
            'Files — type to search'
          )}
        </span>
        {browsePath && (
          <button
            type="button"
            className="text-[10px] text-primary hover:underline"
            onClick={() => setBrowsePath(null)}
          >
            Back
          </button>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 size={14} className="animate-spin" />
          <span>Searching…</span>
        </div>
      ) : displayEntries.length === 0 ? (
        <div className="px-3 py-4 text-sm text-gray-400 dark:text-gray-500">
          {cleanQuery ? `No files matching "${cleanQuery}"` : 'No files found'}
        </div>
      ) : (
        displayEntries.map((entry, i) => (
          <button type="button"
            key={entry.path}
            data-mention-item
            role="option"
            aria-selected={i === selectedIndex}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
              i === selectedIndex
                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground'
                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-charcoal-800',
            )}
            onClick={() => handleEntryActivate(entry)}
            onMouseEnter={() => setSelectedIndex(i)}
          >
            {getFileIcon(entry)}
            <span className="flex-1 truncate font-medium">{entry.name}</span>
            {isSearchMode && (
              <span className="shrink-0 max-w-[120px] truncate text-[10px] text-gray-400 dark:text-gray-500">
                {shortPath(entry.path, currentFolder)}
              </span>
            )}
            {!entry.isDir && !isSearchMode && entry.size > 0 && (
              <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                {formatSize(entry.size)}
              </span>
            )}
            {entry.isDir && (
              <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">/</span>
            )}
          </button>
        ))
      )}
    </div>
  );
};

export default FileMentionPicker;
