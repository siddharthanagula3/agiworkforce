/**
 * InlineDirectoryList Component
 *
 * Renders directory/file listing results from filesystem tools
 */

import React, { useState, useMemo } from 'react';
import {
  Folder,
  File,
  FileText,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Loader2,
} from 'lucide-react';
import type { ToolResultProps } from './index';

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  path: string;
  size?: number;
}

export interface DirectoryListData {
  entries?: DirectoryEntry[];
  path?: string;
  count?: number;
  returned?: number;
  has_more?: boolean;
  source?: string;
  success?: boolean;
  error?: string;
}

export const InlineDirectoryList: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(true);

  const data = result?.data as DirectoryListData | undefined;

  // Hooks must be called unconditionally - call them before any conditional returns
  // Get entries - wrap in useMemo to keep stable references.
  const entries: DirectoryEntry[] = useMemo(() => data?.entries || [], [data]);

  // Separate directories and files - useMemo always called at top level
  const { directories, files }: { directories: DirectoryEntry[]; files: DirectoryEntry[] } =
    useMemo(() => {
      const dirs: DirectoryEntry[] = [];
      const fls: DirectoryEntry[] = [];
      entries.forEach((entry) => {
        if (entry.type === 'directory') {
          dirs.push(entry);
        } else {
          fls.push(entry);
        }
      });
      // Sort: directories first, then files, both alphabetically
      dirs.sort((a, b) => a.name.localeCompare(b.name));
      fls.sort((a, b) => a.name.localeCompare(b.name));
      return { directories: dirs, files: fls };
    }, [entries]);

  const path = data?.path || '';

  // Show running state
  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
        <span className="text-sm text-muted-foreground">Listing directory...</span>
      </div>
    );
  }

  // Show error state if status indicates failure
  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <div className="text-red-400">⚠</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-300 font-medium">Directory listing failed</p>
            {result?.error && <p className="text-xs text-muted-foreground mt-1">{result.error}</p>}
          </div>
        </div>
      </div>
    );
  }

  // Handle missing data case - after hooks are called
  if (!data) {
    return null;
  }

  // Handle error state - after hooks are called
  if (!data.success || data.error) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <div className="text-red-400">⚠</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mt-1">{data.error || 'Operation failed'}</p>
          </div>
        </div>
      </div>
    );
  }

  const formatSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (entries.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <p className="text-xs text-muted-foreground">No files found</p>
      </div>
    );
  }

  return (
    <div className="inline-directory-list mt-3 rounded-lg border border-border/50 overflow-hidden bg-surface-elevated">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 bg-surface-overlay/30 border-b border-border/30 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-amber-400" />
          )}
          <span className="text-xs font-medium text-muted-foreground truncate">
            {path || 'Directory listing'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {directories.length} dirs, {files.length} files
          </span>
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="p-2 max-h-64 overflow-auto bg-surface-base/30">
          {/* Directories */}
          {directories.map((dir) => (
            <div
              key={dir.path}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-overlay/50 text-sm"
            >
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span className="text-amber-300 truncate font-mono text-xs">{dir.name}</span>
              <span className="text-xs text-muted-foreground ml-auto shrink-0">dir</span>
            </div>
          ))}

          {/* Files */}
          {files.map((file) => {
            // Determine icon based on extension
            const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';
            const isTextFile = [
              'txt',
              'md',
              'json',
              'js',
              'ts',
              'tsx',
              'jsx',
              'py',
              'rs',
              'go',
              'html',
              'css',
            ].includes(ext || '');

            return (
              <div
                key={file.path}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-overlay/50 text-sm"
              >
                {isTextFile ? (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                ) : (
                  <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="text-foreground truncate font-mono text-xs">{file.name}</span>
                {file.size !== undefined && file.size > 0 && (
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {formatSize(file.size)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
