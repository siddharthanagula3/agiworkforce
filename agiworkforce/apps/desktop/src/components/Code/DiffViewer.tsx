import { useState, useEffect } from 'react';
import { DiffEditor, type DiffOnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { X, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface DiffViewerProps {
  originalValue: string;
  modifiedValue: string;
  originalLabel?: string;
  modifiedLabel?: string;
  language?: string;
  readOnly?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onClose?: () => void;
  className?: string;
}

export function DiffViewer({
  originalValue,
  modifiedValue,
  originalLabel = 'Original',
  modifiedLabel = 'Modified',
  language = 'typescript',
  readOnly = true,
  onAccept,
  onReject,
  onClose,
  className,
}: DiffViewerProps) {
  const { theme } = useTheme();
  const [diffStats, setDiffStats] = useState<{
    additions: number;
    deletions: number;
    changes: number;
  } | null>(null);

  useEffect(() => {
    // Calculate basic diff stats
    const originalLines = originalValue.split('\n');
    const modifiedLines = modifiedValue.split('\n');

    let additions = 0;
    let deletions = 0;

    // Simple line-based diff calculation
    const maxLength = Math.max(originalLines.length, modifiedLines.length);
    for (let i = 0; i < maxLength; i++) {
      const origLine = originalLines[i];
      const modLine = modifiedLines[i];

      if (origLine === undefined && modLine !== undefined) {
        additions++;
      } else if (origLine !== undefined && modLine === undefined) {
        deletions++;
      } else if (origLine !== modLine) {
        // Count as both addition and deletion
        deletions++;
        additions++;
      }
    }

    setDiffStats({
      additions,
      deletions,
      changes: additions + deletions,
    });
  }, [originalValue, modifiedValue]);

  const handleEditorDidMount: DiffOnMount = (editor, monaco) => {
    // Configure editor options
    editor.getModifiedEditor().updateOptions({
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontLigatures: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      readOnly,
      renderSideBySide: true,
    });

    editor.getOriginalEditor().updateOptions({
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontLigatures: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      readOnly: true,
    });
  };

  const handleAccept = () => {
    onAccept?.();
    toast.success('Changes accepted');
  };

  const handleReject = () => {
    onReject?.();
    toast.info('Changes rejected');
  };

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'light';

  return (
    <div className={cn('flex flex-col h-full border border-border rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Diff Viewer</span>

          {diffStats && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-500">
                +{diffStats.additions} addition{diffStats.additions !== 1 ? 's' : ''}
              </span>
              <span className="text-red-500">
                -{diffStats.deletions} deletion{diffStats.deletions !== 1 ? 's' : ''}
              </span>
              <span className="text-muted-foreground">
                {diffStats.changes} change{diffStats.changes !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {onAccept && (
            <Button
              variant="default"
              size="sm"
              onClick={handleAccept}
              title="Accept changes"
            >
              <Check className="h-4 w-4 mr-1" />
              Accept
            </Button>
          )}

          {onReject && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReject}
              title="Reject changes"
            >
              <X className="h-4 w-4 mr-1" />
              Reject
            </Button>
          )}

          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              title="Close diff viewer"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Labels */}
      <div className="flex border-b border-border bg-muted/10">
        <div className="flex-1 px-3 py-2 border-r border-border">
          <div className="flex items-center gap-2">
            <ArrowLeft className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{originalLabel}</span>
          </div>
        </div>
        <div className="flex-1 px-3 py-2">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{modifiedLabel}</span>
          </div>
        </div>
      </div>

      {/* Diff Editor */}
      <div className="flex-1 relative">
        <DiffEditor
          height="100%"
          language={language}
          original={originalValue}
          modified={modifiedValue}
          theme={monacoTheme}
          onMount={handleEditorDidMount}
          options={{
            renderSideBySide: true,
            ignoreTrimWhitespace: false,
            renderIndicators: true,
            originalEditable: false,
            readOnly,
          }}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground bg-muted/10 border-t border-border">
        <div className="flex items-center gap-3">
          <span>Language: {language}</span>
          <span>
            Original: {originalValue.split('\n').length} lines
          </span>
          <span>
            Modified: {modifiedValue.split('\n').length} lines
          </span>
        </div>
        <div className="flex items-center gap-3">
          {readOnly && <span className="text-amber-500">Read-only</span>}
          <span>Side-by-side view</span>
        </div>
      </div>
    </div>
  );
}
