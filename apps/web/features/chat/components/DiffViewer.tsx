'use client';

import { useState, useMemo, useCallback } from 'react';
import { Copy, Check, FileCode } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiffViewerProps {
  oldCode: string;
  newCode: string;
  language?: string;
  fileName?: string;
  className?: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

// ─── Diff computation ─────────────────────────────────────────────────────────

/**
 * Simple line-by-line diff using longest common subsequence (LCS).
 * Produces a unified diff output marking additions, deletions, and unchanged lines.
 */
function computeDiff(oldCode: string, newCode: string): DiffLine[] {
  const oldLines = oldCode.split('\n');
  const newLines = newCode.split('\n');

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({
        type: 'unchanged',
        content: oldLines[i - 1]!,
        oldLineNo: i,
        newLineNo: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.unshift({
        type: 'added',
        content: newLines[j - 1]!,
        oldLineNo: null,
        newLineNo: j,
      });
      j--;
    } else {
      result.unshift({
        type: 'removed',
        content: oldLines[i - 1]!,
        oldLineNo: i,
        newLineNo: null,
      });
      i--;
    }
  }

  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiffViewer({ oldCode, newCode, language, fileName, className }: DiffViewerProps) {
  const [copied, setCopied] = useState(false);

  const diffLines = useMemo(() => computeDiff(oldCode, newCode), [oldCode, newCode]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.type === 'added') added++;
      if (line.type === 'removed') removed++;
    }
    return { added, removed };
  }, [diffLines]);

  const handleCopyNew = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(newCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in non-secure contexts
    }
  }, [newCode]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700/50',
        'bg-white dark:bg-zinc-950',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
          {fileName && (
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
              {fileName}
            </span>
          )}
          {language && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              {language}
            </span>
          )}
          <div className="flex items-center gap-1.5 text-xs ml-2">
            {stats.added > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                +{stats.added}
              </span>
            )}
            {stats.removed > 0 && (
              <span className="text-red-600 dark:text-red-400 font-medium">-{stats.removed}</span>
            )}
            {stats.added === 0 && stats.removed === 0 && (
              <span className="text-zinc-400">No changes</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyNew}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            copied
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700',
          )}
          title="Copy new version"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy new
            </>
          )}
        </button>
      </div>

      {/* Diff body */}
      <div className="overflow-x-auto max-h-[32rem]">
        <table className="w-full text-[13px] leading-5 font-mono border-collapse">
          <tbody>
            {diffLines.map((line, idx) => (
              <tr
                key={idx}
                className={cn(
                  line.type === 'added' && 'bg-emerald-50 dark:bg-emerald-950/40',
                  line.type === 'removed' && 'bg-red-50 dark:bg-red-950/40',
                  line.type === 'unchanged' && 'bg-white dark:bg-zinc-950',
                )}
              >
                {/* Old line number */}
                <td
                  className={cn(
                    'w-12 shrink-0 select-none text-right pr-2 pl-3 text-zinc-400 dark:text-zinc-600',
                    'border-r border-zinc-100 dark:border-zinc-800',
                    line.type === 'added' && 'bg-emerald-100/50 dark:bg-emerald-950/30',
                    line.type === 'removed' && 'bg-red-100/50 dark:bg-red-950/30',
                  )}
                >
                  {line.oldLineNo ?? ''}
                </td>
                {/* New line number */}
                <td
                  className={cn(
                    'w-12 shrink-0 select-none text-right pr-2 pl-2 text-zinc-400 dark:text-zinc-600',
                    'border-r border-zinc-100 dark:border-zinc-800',
                    line.type === 'added' && 'bg-emerald-100/50 dark:bg-emerald-950/30',
                    line.type === 'removed' && 'bg-red-100/50 dark:bg-red-950/30',
                  )}
                >
                  {line.newLineNo ?? ''}
                </td>
                {/* Diff marker */}
                <td
                  className={cn(
                    'w-6 shrink-0 select-none text-center',
                    line.type === 'added' && 'text-emerald-600 dark:text-emerald-400',
                    line.type === 'removed' && 'text-red-600 dark:text-red-400',
                    line.type === 'unchanged' && 'text-zinc-300 dark:text-zinc-700',
                  )}
                >
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </td>
                {/* Content */}
                <td className="px-3 whitespace-pre-wrap break-all">
                  <span
                    className={cn(
                      line.type === 'added' && 'text-emerald-900 dark:text-emerald-200',
                      line.type === 'removed' && 'text-red-900 dark:text-red-200',
                      line.type === 'unchanged' && 'text-zinc-700 dark:text-zinc-300',
                    )}
                  >
                    {line.content}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DiffViewer;
