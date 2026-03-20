/**
 * CanvasPanel
 *
 * The main canvas panel that slides in from the right (~600px wide).
 * Shows the active artifact with a Code/Preview tab layout.
 *
 * Layout:
 * ┌─────────────────────────────┐
 * │ [Title input]  [Type] [Lang]│  ← header
 * ├─────────────────────────────┤
 * │  [Tab: Code] [Tab: Preview] │  ← tabs
 * ├─────────────────────────────┤
 * │   CodeEditor OR Preview     │  ← main content
 * ├─────────────────────────────┤
 * │ [Run ▶] [Copy] [Export] [X] │  ← toolbar
 * └─────────────────────────────┘
 */

import { Check, Code2, Copy, Download, Eye, FileText, Globe, Play, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  useCanvasStore,
  type CanvasArtifact,
  type CanvasArtifactType,
} from '../../stores/canvasStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';
import { ArtifactPreview } from './ArtifactPreview';
import { CodeEditor } from './CodeEditor';

type ActiveTab = 'code' | 'preview';

// ---------------------------------------------------------------------------
// Type icons
// ---------------------------------------------------------------------------
function TypeIcon({ type }: { type: CanvasArtifactType }) {
  switch (type) {
    case 'html':
      return <Globe className="h-3.5 w-3.5 text-orange-400" />;
    case 'markdown':
      return <FileText className="h-3.5 w-3.5 text-blue-400" />;
    case 'document':
      return <FileText className="h-3.5 w-3.5 text-purple-400" />;
    default:
      return <Code2 className="h-3.5 w-3.5 text-green-400" />;
  }
}

// ---------------------------------------------------------------------------
// CanvasPanel
// ---------------------------------------------------------------------------
interface CanvasPanelProps {
  artifact: CanvasArtifact;
  onClose: () => void;
  onFixBug?: (artifactId: string, errorMessage: string) => void;
}

export function CanvasPanel({ artifact, onClose, onFixBug }: CanvasPanelProps) {
  const { updateArtifact, executeArtifact, deleteArtifact } = useCanvasStore(
    useShallow((s) => ({
      updateArtifact: s.updateArtifact,
      executeArtifact: s.executeArtifact,
      deleteArtifact: s.deleteArtifact,
    })),
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('code');
  const [copied, setCopied] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRunning = artifact.executionState === 'running';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDirty) {
          setCloseDialogOpen(true);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, [onClose, isDirty]);

  const handleContentChange = useCallback(
    (value: string) => {
      updateArtifact(artifact.id, { content: value });
      setIsDirty(true);
    },
    [artifact.id, updateArtifact],
  );

  const handleTitleChange = useCallback(
    (value: string) => {
      updateArtifact(artifact.id, { title: value });
    },
    [artifact.id, updateArtifact],
  );

  const handleRun = useCallback(() => {
    void executeArtifact(artifact.id);
    setActiveTab('preview');
  }, [artifact.id, executeArtifact]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      toast.success('Copied to clipboard');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [artifact.content]);

  const handleExport = useCallback(() => {
    const ext =
      artifact.type === 'html'
        ? 'html'
        : artifact.type === 'markdown'
          ? 'md'
          : (artifact.language ?? 'txt');
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('File exported');
  }, [artifact]);

  const handleDelete = useCallback(() => {
    deleteArtifact(artifact.id);
    onClose();
  }, [artifact.id, deleteArtifact, onClose]);

  const handleFixBug = useCallback(
    (errorMessage: string) => {
      onFixBug?.(artifact.id, errorMessage);
    },
    [artifact.id, onFixBug],
  );

  // Only show preview tab for html, markdown, document, or code with execution output
  const canPreview =
    artifact.type === 'html' ||
    artifact.type === 'markdown' ||
    artifact.type === 'document' ||
    artifact.type === 'code';

  return (
    <div
      className="flex flex-col h-full bg-surface-base border-l border-white/10"
      role="region"
      aria-label="Canvas panel"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-surface-elevated">
        <TypeIcon type={artifact.type} />

        <input
          type="text"
          value={artifact.title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="flex-1 bg-transparent text-sm font-medium text-gray-100 outline-none placeholder:text-gray-500 min-w-0"
          placeholder="Untitled"
          aria-label="Artifact title"
        />

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-gray-500 uppercase tracking-wider">{artifact.type}</span>
          {artifact.language && (
            <span className="text-xs bg-white/5 text-gray-400 px-1.5 py-0.5 rounded font-mono">
              {artifact.language}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (isDirty) {
                setCloseDialogOpen(true);
              } else {
                onClose();
              }
            }}
            className="ml-1 p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
            aria-label="Close canvas panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-surface-base">
        <button
          type="button"
          onClick={() => setActiveTab('code')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'code'
              ? 'border-b-2 border-teal-500 text-teal-400'
              : 'text-gray-500 hover:text-gray-300',
          )}
        >
          <Code2 className="h-3.5 w-3.5" />
          Code
        </button>
        {canPreview && (
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'preview'
                ? 'border-b-2 border-teal-500 text-teal-400'
                : 'text-gray-500 hover:text-gray-300',
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
            {artifact.executionState === 'error' && (
              <span className="ml-1 h-2 w-2 rounded-full bg-red-500" />
            )}
            {artifact.executionState === 'success' && (
              <span className="ml-1 h-2 w-2 rounded-full bg-green-500" />
            )}
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'code' ? (
          <CodeEditor
            content={artifact.content}
            language={artifact.language}
            onChange={handleContentChange}
            onRun={handleRun}
            isRunning={isRunning}
            className="h-full rounded-none"
          />
        ) : (
          <ArtifactPreview artifact={artifact} onFixBug={handleFixBug} className="h-full" />
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10 bg-surface-elevated">
        {/* Run button */}
        {artifact.type === 'code' && (
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              isRunning
                ? 'bg-green-500/10 text-green-500 cursor-not-allowed'
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
            )}
          >
            <Play className={cn('h-3.5 w-3.5', isRunning && 'animate-pulse')} />
            {isRunning ? 'Running...' : 'Run'}
          </button>
        )}

        <div className="flex-1" />

        {/* Copy */}
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>

        {/* Export */}
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
          title="Export file"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={handleDelete}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete artifact"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close without saving?</AlertDialogTitle>
            <AlertDialogDescription>Your changes will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={onClose}>
              Close anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
