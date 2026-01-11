import { useState, useEffect } from 'react';
import { useEditingStore } from '../../stores/editingStore';
import { cn } from '../../lib/utils';
import { FileTreeWithChanges } from './FileTreeWithChanges';
import { EnhancedDiffViewer } from './EnhancedDiffViewer';
import { LivePreview } from './LivePreview';
import { ChangeSummary } from './ChangeSummary';
import { ConflictResolver } from './ConflictResolver';
import { Button } from '../ui/Button';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs';
import {
  Undo,
  Redo,
  Eye,
  Code,
  FileText,
  LayoutGrid,
  Maximize2,
} from 'lucide-react';
import { Card } from '../ui/Card';

interface VisualEditorProps {
  rootPath: string;
  className?: string;
}

export function VisualEditor({ rootPath, className }: VisualEditorProps) {
  const {
    selectedFile,
    setSelectedFile,
    canUndo,
    canRedo,
    undo,
    redo,
    pendingChanges,
    conflicts,
  } = useEditingStore();

  const [layout, setLayout] = useState<'split' | 'full'>('split');
  const [activeView, setActiveView] = useState<'diff' | 'preview'>('diff');

  const selectedDiff = selectedFile ? pendingChanges.get(selectedFile) : null;
  const hasConflicts = selectedFile ? (conflicts.get(selectedFile)?.length || 0) > 0 : false;

  const handleFileSelect = (path: string) => {
    setSelectedFile(path);
  };

  useEffect(() => {
    // Auto-select first file if none selected
    if (!selectedFile && pendingChanges.size > 0) {
      const firstFile = Array.from(pendingChanges.keys())[0];
      if (firstFile) {
        setSelectedFile(firstFile);
      }
    }
  }, [pendingChanges, selectedFile, setSelectedFile]);

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Visual Editor</h2>
          {selectedFile && (
            <span className="text-sm text-muted-foreground">
              {selectedFile.split(/[/\\]/).pop()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <div className="flex gap-1 mr-2">
            <Button
              variant="ghost"
              size="sm"
              title="Undo (Cmd+Z)"
              onClick={undo}
              disabled={!canUndo()}
            >
              <Undo className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Redo (Cmd+Shift+Z)"
              onClick={redo}
              disabled={!canRedo()}
            >
              <Redo className="h-4 w-4" />
            </Button>
          </div>

          {/* View Mode */}
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)}>
            <TabsList>
              <TabsTrigger value="diff" className="gap-1">
                <Code className="h-4 w-4" />
                Diff
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-1">
                <Eye className="h-4 w-4" />
                Preview
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Layout Toggle */}
          <Button
            variant="ghost"
            size="sm"
            title={layout === 'split' ? 'Full width' : 'Split view'}
            onClick={() => setLayout(layout === 'split' ? 'full' : 'split')}
          >
            {layout === 'split' ? (
              <Maximize2 className="h-4 w-4" />
            ) : (
              <LayoutGrid className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* File Tree Sidebar */}
        <div className={cn(
          'w-64 border-r border-border',
          layout === 'full' && 'hidden'
        )}>
          <FileTreeWithChanges
            rootPath={rootPath}
            onFileSelect={handleFileSelect}
            selectedFile={selectedFile || undefined}
          />
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedFile && selectedDiff ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Conflict Warning */}
              {hasConflicts && (
                <div className="p-3 bg-amber-500/10 border-b border-amber-500/30">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      This file has merge conflicts that need to be resolved
                    </span>
                  </div>
                </div>
              )}

              {/* Main View */}
              <div className="flex-1 min-h-0">
                {activeView === 'diff' ? (
                  <EnhancedDiffViewer filePath={selectedFile} />
                ) : (
                  <LivePreview filePath={selectedFile} />
                )}
              </div>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Right Sidebar */}
        <div className={cn(
          'w-80 border-l border-border flex flex-col gap-4 p-4 overflow-y-auto',
          layout === 'full' && 'hidden'
        )}>
          {/* Change Summary */}
          <ChangeSummary />

          {/* Conflict Resolver */}
          {selectedFile && hasConflicts && (
            <ConflictResolver filePath={selectedFile} />
          )}

          {/* Instructions */}
          <Card className="p-4 space-y-2">
            <h4 className="text-sm font-semibold">Keyboard Shortcuts</h4>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Accept changes</span>
                <kbd className="px-1 py-0.5 bg-muted rounded">Cmd+S</kbd>
              </div>
              <div className="flex justify-between">
                <span>Undo</span>
                <kbd className="px-1 py-0.5 bg-muted rounded">Cmd+Z</kbd>
              </div>
              <div className="flex justify-between">
                <span>Redo</span>
                <kbd className="px-1 py-0.5 bg-muted rounded">Cmd+Shift+Z</kbd>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/10 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>{pendingChanges.size} file{pendingChanges.size !== 1 ? 's' : ''} with changes</span>
          {selectedFile && (
            <>
              <span>•</span>
              <span>{selectedFile}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span>{activeView === 'diff' ? 'Diff View' : 'Preview Mode'}</span>
          <span>•</span>
          <span>{layout === 'split' ? 'Split Layout' : 'Full Width'}</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
      <FileText className="h-16 w-16 text-muted-foreground/50" />
      <div className="text-center space-y-2 max-w-md">
        <h3 className="text-lg font-semibold">No File Selected</h3>
        <p className="text-sm text-muted-foreground">
          Select a file from the tree on the left to view and edit its changes.
          You can accept or reject individual hunks, preview changes, and resolve conflicts.
        </p>
      </div>
    </div>
  );
}
