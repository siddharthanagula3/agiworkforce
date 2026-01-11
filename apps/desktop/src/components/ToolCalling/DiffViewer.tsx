/**
 * DiffViewer Component
 *
 * Display file diffs with syntax highlighting.
 * Shows additions, deletions, and context lines.
 */

import { useState } from 'react';
import { Copy, Check, FileCode, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import type { DiffData } from '../../types/toolCalling';

interface DiffViewerProps {
  data: DiffData;
  className?: string;
  maxHeight?: string;
  defaultExpanded?: boolean;
}

export function DiffViewer({
  data,
  className,
  maxHeight = '400px',
  defaultExpanded = true,
}: DiffViewerProps) {
  const [copied, setCopied] = useState(false);
  const [expandedHunks, setExpandedHunks] = useState<Set<number>>(
    new Set(defaultExpanded ? data.hunks.map((_, i) => i) : []),
  );

  const handleCopy = async () => {
    // Generate unified diff format
    const lines: string[] = [];

    if (data.file_path) {
      lines.push(`--- ${data.file_path}`);
      lines.push(`+++ ${data.file_path}`);
    }

    for (const hunk of data.hunks) {
      lines.push(
        `@@ -${hunk.old_start},${hunk.old_lines} +${hunk.new_start},${hunk.new_lines} @@`,
      );
      for (const line of hunk.lines) {
        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
        lines.push(`${prefix}${line.content}`);
      }
    }

    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleHunk = (index: number) => {
    setExpandedHunks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedHunks(new Set(data.hunks.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedHunks(new Set());
  };

  // Calculate diff stats
  const stats = data.hunks.reduce(
    (acc, hunk) => {
      for (const line of hunk.lines) {
        if (line.type === 'add') acc.additions++;
        if (line.type === 'remove') acc.deletions++;
      }
      return acc;
    },
    { additions: 0, deletions: 0 },
  );

  return (
    <div className={cn('border border-border rounded-lg bg-background overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-muted-foreground" />
          {data.file_path && (
            <span className="text-xs font-semibold font-mono">{data.file_path}</span>
          )}
          <span className="text-xs text-muted-foreground">
            <span className="text-green-600 dark:text-green-400">+{stats.additions}</span>
            {' / '}
            <span className="text-red-600 dark:text-red-400">-{stats.deletions}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={expandAll} className="h-7 text-xs">
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll} className="h-7 text-xs">
            Collapse All
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Diff Content */}
      <div className="overflow-auto font-mono text-xs" style={{ maxHeight }}>
        {data.hunks.map((hunk, hunkIndex) => {
          const isExpanded = expandedHunks.has(hunkIndex);
          return (
            <div key={hunkIndex} className="border-b border-border last:border-b-0">
              {/* Hunk Header */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 cursor-pointer hover:bg-muted/80 select-none"
                onClick={() => toggleHunk(hunkIndex)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">
                  @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
                </span>
              </div>

              {/* Hunk Lines */}
              {isExpanded && (
                <div>
                  {hunk.lines.map((line, lineIndex) => {
                    const bgColor =
                      line.type === 'add'
                        ? 'bg-green-50 dark:bg-green-950/30'
                        : line.type === 'remove'
                          ? 'bg-red-50 dark:bg-red-950/30'
                          : '';

                    const textColor =
                      line.type === 'add'
                        ? 'text-green-700 dark:text-green-300'
                        : line.type === 'remove'
                          ? 'text-red-700 dark:text-red-300'
                          : 'text-foreground';

                    const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

                    return (
                      <div
                        key={lineIndex}
                        className={cn('flex items-center px-3 py-0.5', bgColor)}
                      >
                        <span className={cn('w-6 text-muted-foreground select-none text-right mr-2', textColor)}>
                          {line.line_number ?? ''}
                        </span>
                        <span className={cn('w-4 select-none', textColor)}>{prefix}</span>
                        <span className={cn(textColor, 'whitespace-pre flex-1')}>{line.content}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {data.hunks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">No changes</div>
        )}
      </div>
    </div>
  );
}
