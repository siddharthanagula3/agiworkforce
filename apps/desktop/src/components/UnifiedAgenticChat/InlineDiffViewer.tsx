import { useState } from 'react';
import { Check, X, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { invoke } from '@tauri-apps/api/core';

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  lineNumber?: number;
}

interface CodeDiff {
  filePath: string;
  language?: string;
  oldContent: string;
  newContent: string;
  diffLines: DiffLine[];
}

interface InlineDiffViewerProps {
  diff: CodeDiff;
  diffId?: string;
  onRevert?: (filePath: string) => Promise<void>;
}

/**
 * Parse old and new content into diff lines
 * This is a simple line-by-line diff for demonstration
 * In production, you might want to use a library like diff or diff-match-patch
 */
function generateDiffLines(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const diffLines: DiffLine[] = [];

  // Simple line-by-line comparison
  // In production, use a proper diff algorithm
  const maxLength = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLength; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      // Context line (unchanged)
      if (oldLine !== undefined) {
        diffLines.push({
          type: 'context',
          content: oldLine,
          lineNumber: i + 1,
        });
      }
    } else {
      // Line changed
      if (oldLine !== undefined) {
        diffLines.push({
          type: 'remove',
          content: oldLine,
          lineNumber: i + 1,
        });
      }
      if (newLine !== undefined) {
        diffLines.push({
          type: 'add',
          content: newLine,
          lineNumber: i + 1,
        });
      }
    }
  }

  return diffLines;
}

/**
 * InlineDiffViewer - Display code diffs inline in chat messages
 *
 * Shows file changes with syntax highlighting, line-by-line diffs,
 * and a revert button to undo changes.
 *
 * Similar to GitHub's inline diff view or Cursor's code changes display.
 */
export function InlineDiffViewer({ diff, diffId, onRevert }: InlineDiffViewerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isReverting, setIsReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);

  const diffLines = diff.diffLines.length > 0
    ? diff.diffLines
    : generateDiffLines(diff.oldContent, diff.newContent);

  const addedLines = diffLines.filter((l) => l.type === 'add').length;
  const removedLines = diffLines.filter((l) => l.type === 'remove').length;

  const handleRevert = async () => {
    if (!onRevert) return;

    setIsReverting(true);
    setRevertError(null);

    try {
      await onRevert(diff.filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to revert changes';
      setRevertError(message);
      setTimeout(() => setRevertError(null), 5000);
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="my-3 rounded-lg border border-border overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-mono text-xs">{diff.filePath}</span>
        </button>

        <div className="flex items-center gap-2">
          {diff.language && (
            <Badge variant="outline" className="text-xs">
              {diff.language}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
          >
            +{addedLines}
          </Badge>
          <Badge
            variant="outline"
            className="text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
          >
            -{removedLines}
          </Badge>

          {onRevert && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRevert}
              disabled={isReverting}
              className="h-7 gap-1.5 text-xs"
            >
              {isReverting ? (
                <>
                  <RotateCcw className="h-3 w-3 animate-spin" />
                  <span>Reverting...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-3 w-3" />
                  <span>Revert</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {revertError && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2 text-sm text-destructive">
          <X className="h-4 w-4" />
          <span>{revertError}</span>
        </div>
      )}

      {/* Diff Content */}
      {isExpanded && (
        <div className="overflow-x-auto">
          <div className="font-mono text-xs">
            {diffLines.map((line, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-start px-4 py-0.5',
                  line.type === 'add' && 'bg-green-50 dark:bg-green-950/20',
                  line.type === 'remove' && 'bg-red-50 dark:bg-red-950/20',
                  line.type === 'context' && 'bg-background',
                )}
              >
                {/* Line indicator */}
                <div className="flex-shrink-0 w-12 text-muted-foreground select-none">
                  {line.type === 'add' && (
                    <span className="text-green-600 dark:text-green-400">+</span>
                  )}
                  {line.type === 'remove' && (
                    <span className="text-red-600 dark:text-red-400">-</span>
                  )}
                  {line.type === 'context' && <span className="text-muted-foreground"> </span>}
                  {line.lineNumber && (
                    <span className="ml-1 text-xs">{line.lineNumber}</span>
                  )}
                </div>

                {/* Line content */}
                <pre
                  className={cn(
                    'flex-1 whitespace-pre-wrap break-all',
                    line.type === 'add' && 'text-green-700 dark:text-green-300',
                    line.type === 'remove' && 'text-red-700 dark:text-red-300',
                    line.type === 'context' && 'text-foreground',
                  )}
                >
                  {line.content}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsed summary */}
      {!isExpanded && (
        <div className="px-4 py-2 text-xs text-muted-foreground">
          {addedLines + removedLines} lines changed
        </div>
      )}
    </div>
  );
}
