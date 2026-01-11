import { useState, useEffect } from 'react';
import { DiffEditor, type DiffOnMount } from '@monaco-editor/react';
import { useEditingStore } from '../../stores/editingStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
  Check,
  X,
  ChevronDown,
  ChevronRight,
  ArrowLeftRight,
  Eye,
  Code,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../ui/Badge';

interface EnhancedDiffViewerProps {
  filePath: string;
  className?: string;
}

export function EnhancedDiffViewer({ filePath, className }: EnhancedDiffViewerProps) {
  const {
    pendingChanges,
    acceptChange,
    rejectChange,
    acceptHunk,
    rejectHunk,
    inlineMode,
    toggleInlineMode,
  } = useEditingStore();

  const diff = pendingChanges.get(filePath);
  const [expandedHunks, setExpandedHunks] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<'diff' | 'inline'>('diff');

  useEffect(() => {
    setViewMode(inlineMode ? 'inline' : 'diff');
  }, [inlineMode]);

  if (!diff) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <p className="text-sm text-muted-foreground">No diff to display</p>
      </div>
    );
  }

  const handleEditorDidMount: DiffOnMount = (editor) => {
    editor.updateOptions({
      renderSideBySide: viewMode === 'diff',
      ignoreTrimWhitespace: false,
      renderIndicators: true,
      originalEditable: false,
    });

    const sharedOptions = {
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontLigatures: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
    };

    editor.getModifiedEditor().updateOptions({
      ...sharedOptions,
      readOnly: true,
    });

    editor.getOriginalEditor().updateOptions({
      ...sharedOptions,
      readOnly: true,
    });
  };

  const handleAccept = async () => {
    try {
      await acceptChange(filePath);
      toast.success('Changes accepted and applied');
    } catch (error) {
      toast.error('Failed to accept changes');
      console.error(error);
    }
  };

  const handleReject = () => {
    rejectChange(filePath);
    toast.info('Changes rejected');
  };

  const toggleHunk = (index: number) => {
    setExpandedHunks(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleAcceptHunk = (index: number) => {
    acceptHunk(filePath, index);
    toast.success(`Hunk ${index + 1} accepted`);
  };

  const handleRejectHunk = (index: number) => {
    rejectHunk(filePath, index);
    toast.info(`Hunk ${index + 1} rejected`);
  };

  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  return (
    <div className={cn('flex flex-col h-full border border-border rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">{fileName}</span>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-500 flex items-center gap-1">
              <span className="font-mono">+{diff.stats.additions}</span>
            </span>
            <span className="text-red-500 flex items-center gap-1">
              <span className="font-mono">-{diff.stats.deletions}</span>
            </span>
            <Badge variant="outline" className="text-xs">
              {diff.hunks.length} hunk{diff.hunks.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            title={viewMode === 'diff' ? 'Switch to inline view' : 'Switch to side-by-side view'}
            onClick={() => {
              const newMode = viewMode === 'diff' ? 'inline' : 'diff';
              setViewMode(newMode);
              toggleInlineMode();
            }}
          >
            {viewMode === 'diff' ? (
              <ArrowLeftRight className="h-4 w-4" />
            ) : (
              <Code className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="default"
            size="sm"
            title="Accept all changes in this file"
            onClick={handleAccept}
          >
            <Check className="h-4 w-4 mr-1" />
            Accept
          </Button>

          <Button
            variant="ghost"
            size="sm"
            title="Reject all changes in this file"
            onClick={handleReject}
          >
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>
        </div>
      </div>

      {/* Diff Editor */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Hunk Controls */}
        {diff.hunks.length > 1 && (
          <div className="border-b border-border bg-muted/10">
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Eye className="h-3 w-3" />
                <span>Change Hunks</span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {diff.hunks.map((hunk, index) => {
                  const isExpanded = expandedHunks.has(index);
                  const hunkAdditions = hunk.changes.filter(c => c.type === 'add').length;
                  const hunkDeletions = hunk.changes.filter(c => c.type === 'delete').length;

                  return (
                    <div
                      key={index}
                      className="border border-border/50 rounded-md overflow-hidden"
                    >
                      <div
                        className="flex items-center justify-between p-2 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => toggleHunk(index)}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="text-xs font-mono">
                            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                          </span>
                          <span className="text-xs text-green-500">+{hunkAdditions}</span>
                          <span className="text-xs text-red-500">-{hunkDeletions}</span>
                          {hunk.accepted && (
                            <Badge variant="default" className="text-xs h-4">Accepted</Badge>
                          )}
                          {hunk.rejected && (
                            <Badge variant="destructive" className="text-xs h-4">Rejected</Badge>
                          )}
                        </div>

                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2"
                            title="Accept this hunk"
                            onClick={() => handleAcceptHunk(index)}
                            disabled={hunk.accepted}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2"
                            title="Reject this hunk"
                            onClick={() => handleRejectHunk(index)}
                            disabled={hunk.rejected}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-2 bg-muted/5 border-t border-border/50">
                          <div className="space-y-px font-mono text-xs">
                            {hunk.changes.slice(0, 10).map((change, changeIndex) => (
                              <div
                                key={changeIndex}
                                className={cn(
                                  'px-2 py-0.5',
                                  change.type === 'add' && 'bg-green-500/10 text-green-700 dark:text-green-400',
                                  change.type === 'delete' && 'bg-red-500/10 text-red-700 dark:text-red-400',
                                  change.type === 'context' && 'text-muted-foreground'
                                )}
                              >
                                <span className="select-none mr-2">
                                  {change.type === 'add' ? '+' : change.type === 'delete' ? '-' : ' '}
                                </span>
                                {change.content}
                              </div>
                            ))}
                            {hunk.changes.length > 10 && (
                              <div className="px-2 py-1 text-muted-foreground">
                                ... {hunk.changes.length - 10} more lines
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Monaco Diff Editor */}
        <div className="flex-1 relative">
          <DiffEditor
            height="100%"
            language={diff.language}
            original={diff.originalContent}
            modified={diff.modifiedContent}
            theme="vs-dark"
            onMount={handleEditorDidMount}
            options={{
              renderSideBySide: viewMode === 'diff',
            }}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground bg-muted/10 border-t border-border">
        <div className="flex items-center gap-3">
          <span>Language: {diff.language}</span>
          <span>Original: {diff.originalContent.split('\n').length} lines</span>
          <span>Modified: {diff.modifiedContent.split('\n').length} lines</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Status: {diff.status}</span>
          <span>{viewMode === 'diff' ? 'Side-by-side' : 'Inline'} view</span>
        </div>
      </div>
    </div>
  );
}
