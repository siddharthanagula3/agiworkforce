/**
 * FileMentionPicker Component
 *
 * Dropdown picker that appears when the user types "@file:" or a path-like
 * pattern after "@" in the chat input. Shows a filtered list of files and
 * folders with keyboard navigation support.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { File, FileText, Folder, Loader2 } from 'lucide-react';
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
  /** Text after the @file: prefix used to filter files */
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

const MAX_RESULTS = 10;

function getFileIcon(entry: MentionFile) {
  if (entry.isDir) return <Folder size={14} className="text-blue-400 shrink-0" />;
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  const textExts = [
    'ts',
    'tsx',
    'js',
    'jsx',
    'py',
    'rs',
    'go',
    'java',
    'md',
    'txt',
    'json',
    'yaml',
    'yml',
    'toml',
    'css',
    'html',
    'xml',
    'sh',
    'sql',
  ];
  if (textExts.includes(ext)) return <FileText size={14} className="text-gray-400 shrink-0" />;
  return <File size={14} className="text-gray-400 shrink-0" />;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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

  // Refs for keyboard handler to avoid stale closures
  const filteredRef = useRef<MentionFile[]>([]);
  const selectedIndexRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Determine the directory to list based on the query
  const rootPath = browsePath ?? currentFolder ?? null;

  const loadEntries = useCallback(async (path: string) => {
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
          // Directories first, then alphabetically
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

  useEffect(() => {
    if (!rootPath) {
      setEntries([]);
      return;
    }
    void loadEntries(rootPath);
  }, [rootPath, loadEntries]);

  // Filter by query
  const filtered = entries
    .filter((e) => {
      if (!query) return true;
      return e.name.toLowerCase().includes(query.toLowerCase());
    })
    .slice(0, MAX_RESULTS);

  // Keep refs in sync for keyboard handler
  filteredRef.current = filtered;
  selectedIndexRef.current = selectedIndex;

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query]);

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

  // Keyboard navigation — uses refs to avoid stale closures
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

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
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
          Select a project folder first to browse files.
        </p>
      </div>
    );
  }

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
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Files — type to filter
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

      {isLoading ? (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 size={14} className="animate-spin" />
          <span>Loading...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-3 py-4 text-sm text-gray-400 dark:text-gray-500">No files found</div>
      ) : (
        filtered.map((entry, i) => (
          <button
            key={entry.path}
            role="option"
            aria-selected={i === selectedIndex}
            className={cn(
              'w-full text-left px-3 py-2 flex items-center gap-2 transition-colors text-sm',
              i === selectedIndex
                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-charcoal-800',
            )}
            onClick={() => handleEntryActivate(entry)}
            onMouseEnter={() => setSelectedIndex(i)}
          >
            {getFileIcon(entry)}
            <span className="font-medium truncate flex-1">{entry.name}</span>
            {!entry.isDir && entry.size > 0 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                {formatSize(entry.size)}
              </span>
            )}
            {entry.isDir && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">/</span>
            )}
          </button>
        ))
      )}
    </div>
  );
};

export default FileMentionPicker;
