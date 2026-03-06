/**
 * Git Diff Viewer component.
 *
 * Displays file diffs with syntax highlighting for additions and deletions.
 * Supports both staged and unstaged diffs.
 *
 * @module GitDiffViewer
 */

import { invoke } from '../../lib/tauri-mock';
import { AlertCircle, FileCode, Loader2, Minus, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import type { GitDiff } from '../../hooks/useGit';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';

interface GitDiffViewerProps {
  /** Repository path */
  repoPath: string;
  /** File path to show diff for (optional, shows all if not provided) */
  filePath?: string;
  /** Whether to show staged diff */
  staged?: boolean;
  /** Additional CSS classes */
  className?: string;
}

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  lineNumber?: number;
}

/**
 * Parse diff content into structured lines.
 */
function parseDiffContent(diffContent: string): DiffLine[] {
  const lines: DiffLine[] = [];
  const rawLines = diffContent.split('\n');

  let lineNumber = 0;

  for (const line of rawLines) {
    if (line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('index ')) {
      lines.push({ type: 'header', content: line });
      // Extract starting line number from hunk header
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (match?.[1]) {
        lineNumber = parseInt(match[1], 10) - 1;
      }
    } else if (line.startsWith('+')) {
      lineNumber++;
      lines.push({ type: 'add', content: line.substring(1), lineNumber });
    } else if (line.startsWith('-')) {
      lines.push({ type: 'remove', content: line.substring(1) });
    } else if (line.startsWith(' ')) {
      lineNumber++;
      lines.push({ type: 'context', content: line.substring(1), lineNumber });
    } else if (line.length > 0) {
      lines.push({ type: 'context', content: line });
    }
  }

  return lines;
}

/**
 * Git Diff Viewer component.
 *
 * @param props - Component props
 * @returns The Git diff viewer
 *
 * @example
 * ```tsx
 * <GitDiffViewer
 *   repoPath="/path/to/repo"
 *   filePath="src/file.ts"
 *   staged={false}
 * />
 * ```
 */
export function GitDiffViewer({
  repoPath,
  filePath,
  staged = false,
  className,
}: GitDiffViewerProps) {
  const [diffs, setDiffs] = useState<GitDiff[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiff = useCallback(async () => {
    if (!repoPath) {
      setError('No repository path provided');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await invoke<GitDiff[]>('git_diff', {
        path: repoPath,
        file_path: filePath ?? null,
        staged,
      });
      setDiffs(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [repoPath, filePath, staged]);

  // Fetch diff on mount and when parameters change
  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  // Parse all diffs
  const parsedDiffs = useMemo(() => {
    return diffs.map((diff) => ({
      ...diff,
      lines: parseDiffContent(diff.diff_content),
    }));
  }, [diffs]);

  // Calculate total stats
  const totalStats = useMemo(() => {
    return diffs.reduce(
      (acc, diff) => ({
        additions: acc.additions + diff.additions,
        deletions: acc.deletions + diff.deletions,
      }),
      { additions: 0, deletions: 0 },
    );
  }, [diffs]);

  if (error) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="flex items-center justify-center h-full p-4 text-center">
          <div className="space-y-2">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchDiff}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full border border-border rounded-lg bg-background',
        className,
      )}
      role="region"
      aria-label="Git diff viewer"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {staged ? 'Staged Changes' : 'Unstaged Changes'}
          </span>
          {!loading && diffs.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-green-500">
                <Plus className="h-3 w-3" />
                {totalStats.additions}
              </span>
              <span className="flex items-center gap-1 text-red-500">
                <Minus className="h-3 w-3" />
                {totalStats.deletions}
              </span>
              <span className="text-muted-foreground">
                ({diffs.length} file{diffs.length !== 1 ? 's' : ''})
              </span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchDiff}
          disabled={loading}
          title="Refresh diff"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : diffs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <div className="text-center space-y-1">
              <FileCode className="h-8 w-8 mx-auto opacity-50" />
              <p className="text-sm">No {staged ? 'staged' : 'unstaged'} changes</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {parsedDiffs.map((diff, diffIndex) => (
              <div key={diffIndex} className="pb-4">
                {/* File Header */}
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 sticky top-0 z-10">
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-mono font-medium truncate flex-1">
                    {diff.file_path}
                  </span>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    <span className="text-green-500">+{diff.additions}</span>
                    <span className="text-red-500">-{diff.deletions}</span>
                  </div>
                </div>

                {/* Diff Content */}
                <div className="font-mono text-xs">
                  {diff.lines.map((line, lineIndex) => (
                    <div
                      key={lineIndex}
                      className={cn(
                        'flex',
                        line.type === 'add' && 'bg-green-500/10',
                        line.type === 'remove' && 'bg-red-500/10',
                        line.type === 'header' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                      )}
                    >
                      {/* Line Number */}
                      <div
                        className={cn(
                          'w-12 shrink-0 text-right px-2 py-0.5 select-none',
                          'text-muted-foreground border-r border-border/50',
                          line.type === 'header' && 'bg-blue-500/5',
                        )}
                      >
                        {line.type !== 'header' && line.type !== 'remove' && line.lineNumber}
                      </div>

                      {/* Change Indicator */}
                      <div
                        className={cn(
                          'w-6 shrink-0 text-center py-0.5 select-none',
                          line.type === 'add' && 'text-green-600 dark:text-green-400',
                          line.type === 'remove' && 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {line.type === 'add' && '+'}
                        {line.type === 'remove' && '-'}
                      </div>

                      {/* Line Content */}
                      <div className="flex-1 py-0.5 pr-4 overflow-x-auto whitespace-pre">
                        {line.content || ' '}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      {diffs.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground border-t border-border bg-muted/10">
          <span>
            {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
          </span>
          <span>{totalStats.additions + totalStats.deletions} total changes</span>
        </div>
      )}
    </div>
  );
}
