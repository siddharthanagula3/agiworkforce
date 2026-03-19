'use client';

/**
 * InlineCodeDiff
 *
 * Renders a unified diff view for file operations (edit, write, create, delete).
 * Features:
 * - File path header with operation badge (Created/Modified/Deleted)
 * - Green additions, red deletions with line numbers
 * - Expand/collapse for long diffs
 * - Copy-to-clipboard
 * - Addition/deletion counts
 */

import { useState, useMemo } from 'react';
import { FileCode, Copy, Check, ChevronDown, ChevronUp, Plus, Minus, Loader2 } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import type { ToolResultProps } from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CodeDiffData {
  filePath?: string;
  file_path?: string;
  before?: string;
  after?: string;
  diff?: string;
  language?: string;
  operation?: 'create' | 'edit' | 'delete' | 'read';
  success?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_LINES_COLLAPSED = 20;

function parseDiffLines(diff: string): { line: string; type: 'add' | 'remove' | 'context' }[] {
  return diff.split('\n').map((line) => {
    if (line.startsWith('+')) return { line, type: 'add' as const };
    if (line.startsWith('-')) return { line, type: 'remove' as const };
    return { line, type: 'context' as const };
  });
}

function buildUnifiedDiff(before: string, after: string): string {
  const bLines = before.split('\n');
  const aLines = after.split('\n');
  const lines: string[] = [];

  const maxLen = Math.max(bLines.length, aLines.length);
  for (let i = 0; i < maxLen; i++) {
    const bLine = i < bLines.length ? bLines[i] : undefined;
    const aLine = i < aLines.length ? aLines[i] : undefined;

    if (bLine === aLine) {
      lines.push(` ${bLine ?? ''}`);
    } else {
      if (bLine !== undefined) lines.push(`-${bLine}`);
      if (aLine !== undefined) lines.push(`+${aLine}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Operation styling
// ---------------------------------------------------------------------------

function getOperationConfig(op: string) {
  switch (op) {
    case 'create':
      return { label: 'Created', color: 'text-emerald-600 dark:text-emerald-400' };
    case 'delete':
      return { label: 'Deleted', color: 'text-red-600 dark:text-red-400' };
    default:
      return { label: 'Modified', color: 'text-amber-600 dark:text-amber-400' };
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const InlineCodeDiff: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const data = result?.data as CodeDiffData | undefined;

  // Compute diff data unconditionally so useMemo is never called after an early return
  const filePath = data?.filePath || data?.file_path || 'unknown';
  const operation = data?.operation || 'edit';
  const before = data?.before || '';
  const after = data?.after || '';
  const rawDiff = data?.diff || '';
  const opConfig = getOperationConfig(operation);

  const diffText = rawDiff || (before || after ? buildUnifiedDiff(before, after) : '');
  const diffLines = useMemo(() => parseDiffLines(diffText), [diffText]);

  // Running state
  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg border border-border/50 bg-muted/20">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        <span className="text-sm text-muted-foreground">Processing code...</span>
      </div>
    );
  }

  // Error state
  if (status === 'error' || status === 'failed') {
    return (
      <div className="mt-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
        <p className="text-sm font-medium text-destructive">Code operation failed</p>
        {(result?.error || data?.error) && (
          <p className="text-xs text-muted-foreground mt-1">{result?.error || data?.error}</p>
        )}
      </div>
    );
  }

  if (!data) return null;

  // Count additions / deletions
  const additions = diffLines.filter((l) => l.type === 'add').length;
  const deletions = diffLines.filter((l) => l.type === 'remove').length;

  const visibleLines = expanded ? diffLines : diffLines.slice(0, MAX_LINES_COLLAPSED);
  const hasMore = diffLines.length > MAX_LINES_COLLAPSED;

  const handleCopy = () => {
    const text = diffText || after || before;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract filename from path
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
  const langBadge = data.language || fileName.split('.').pop() || '';

  return (
    <div className="mt-3 rounded-lg border border-border/50 overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn('text-xs font-mono font-semibold', opConfig.color)}>
            {opConfig.label}
          </span>
          <span className="text-xs font-mono text-muted-foreground truncate" title={filePath}>
            {fileName}
          </span>
          {langBadge && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {langBadge}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {additions > 0 && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
              <Plus className="h-3 w-3" />
              {additions}
            </span>
          )}
          {deletions > 0 && (
            <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-0.5">
              <Minus className="h-3 w-3" />
              {deletions}
            </span>
          )}

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Diff lines */}
      {diffLines.length > 0 ? (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <pre className="font-mono text-xs leading-relaxed">
            {visibleLines.map((entry, i) => {
              const lineNum = i + 1;
              return (
                <div
                  key={i}
                  className={cn(
                    'flex',
                    entry.type === 'add' &&
                      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                    entry.type === 'remove' && 'bg-red-500/10 text-red-700 dark:text-red-300',
                    entry.type === 'context' && 'text-muted-foreground',
                  )}
                >
                  <span className="w-10 shrink-0 text-right pr-2 select-none text-muted-foreground/40 border-r border-border/20">
                    {lineNum}
                  </span>
                  <span className="px-2 whitespace-pre-wrap break-words flex-1">
                    {entry.line || ' '}
                  </span>
                </div>
              );
            })}
          </pre>

          {hasMore && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full px-3 py-1.5 text-xs text-center text-muted-foreground hover:text-foreground border-t border-border/30 transition-colors"
            >
              Show {diffLines.length - MAX_LINES_COLLAPSED} more lines
            </button>
          )}
        </div>
      ) : (
        <div className="px-3 py-2 text-xs text-muted-foreground italic">No diff content</div>
      )}
    </div>
  );
};
