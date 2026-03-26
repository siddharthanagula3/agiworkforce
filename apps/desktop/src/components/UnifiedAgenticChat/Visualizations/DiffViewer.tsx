import React, { useEffect, useRef, useState } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { Copy, Maximize2, Minimize2, Undo2 } from 'lucide-react';
import { useConfirm } from '../../ui/ConfirmDialog';

export interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  language?: string;
  fileName?: string;
  filePath?: string;
  viewMode?: 'split' | 'unified';
  showLineNumbers?: boolean;
  highlightChanges?: boolean;
  enableRevert?: boolean;
  onRevert?: () => void;
  className?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  oldContent,
  newContent,
  fileName,
  filePath,
  viewMode = 'split',
  showLineNumbers = true,
  highlightChanges = true,
  enableRevert = false,
  onRevert,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentViewMode, setCurrentViewMode] = useState<'split' | 'unified'>(viewMode);
  const [copied, setCopied] = useState<'old' | 'new' | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleCopy = async (content: string, type: 'old' | 'new') => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(type);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy content:', err);
    }
  };

  const handleRevert = async () => {
    if (!enableRevert || !onRevert) return;

    const confirmed = await confirm({
      title: 'Revert changes?',
      description: `Are you sure you want to revert "${fileName || filePath}" to its previous state? This action cannot be undone.`,
      confirmText: 'Revert',
      variant: 'destructive',
    });

    if (!confirmed) return;

    setIsReverting(true);
    try {
      await onRevert();
    } catch (err) {
      console.error('Failed to revert file:', err);
    } finally {
      setIsReverting(false);
    }
  };

  const oldLines = oldContent.split('\n').length;
  const newLines = newContent.split('\n').length;
  const linesAdded = newLines - oldLines;
  const linesRemoved = oldLines - newLines;

  const styles = {
    variables: {
      dark: {
        diffViewerBackground: '#1e1e1e',
        diffViewerColor: '#d4d4d4',
        addedBackground: '#044B53',
        addedColor: '#d4d4d4',
        removedBackground: '#5A1E1E',
        removedColor: '#d4d4d4',
        wordAddedBackground: '#055d67',
        wordRemovedBackground: '#7d2727',
        addedGutterBackground: '#033b42',
        removedGutterBackground: '#4a1616',
        gutterBackground: '#2d2d2d',
        gutterBackgroundDark: '#262626',
        highlightBackground: '#3d3d3d',
        highlightGutterBackground: '#2d2d2d',
        codeFoldGutterBackground: '#262626',
        codeFoldBackground: '#2d2d2d',
        emptyLineBackground: '#1e1e1e',
        gutterColor: '#858585',
        addedGutterColor: '#4dbb5f',
        removedGutterColor: '#f85149',
        codeFoldContentColor: '#858585',
        diffViewerTitleBackground: '#2d2d2d',
        diffViewerTitleColor: '#d4d4d4',
        diffViewerTitleBorderColor: '#3d3d3d',
      },
    },
  };

  return (
    <>
      {confirmDialog}
      <div className={`diff-viewer rounded-lg overflow-hidden border border-border ${className}`}>
        {}
        <div className="flex items-center justify-between bg-muted px-4 py-2 border-b border-border">
          <div className="flex items-center gap-3">
            {fileName && <span className="text-sm font-medium text-foreground">{fileName}</span>}
            <div className="flex items-center gap-2 text-xs">
              {linesAdded > 0 && (
                <span className="text-green-600 dark:text-green-400">+{linesAdded}</span>
              )}
              {linesRemoved > 0 && (
                <span className="text-red-600 dark:text-red-400">-{linesRemoved}</span>
              )}
              {linesAdded === 0 && linesRemoved === 0 && (
                <span className="text-muted-foreground">No changes</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {}
            {enableRevert && onRevert && (
              <button
                type="button"
                onClick={handleRevert}
                disabled={isReverting}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Revert to previous version"
              >
                <Undo2 size={12} />
                {isReverting ? 'Reverting...' : 'Revert'}
              </button>
            )}

            {}
            <div className="flex items-center gap-1 bg-accent rounded p-1">
              <button
                type="button"
                onClick={() => setCurrentViewMode('split')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  currentViewMode === 'split'
                    ? 'bg-card text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Split
              </button>
              <button
                type="button"
                onClick={() => setCurrentViewMode('unified')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  currentViewMode === 'unified'
                    ? 'bg-card text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Unified
              </button>
            </div>

            {}
            <button
              type="button"
              onClick={() => handleCopy(oldContent, 'old')}
              className="p-1.5 hover:bg-accent rounded transition-colors"
              title="Copy old content"
            >
              <Copy
                size={14}
                className={copied === 'old' ? 'text-green-500' : 'text-muted-foreground'}
              />
            </button>
            <button
              type="button"
              onClick={() => handleCopy(newContent, 'new')}
              className="p-1.5 hover:bg-accent rounded transition-colors"
              title="Copy new content"
            >
              <Copy
                size={14}
                className={copied === 'new' ? 'text-green-500' : 'text-muted-foreground'}
              />
            </button>

            {}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 hover:bg-accent rounded transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <Minimize2 size={14} className="text-muted-foreground" />
              ) : (
                <Maximize2 size={14} className="text-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        {}
        <div className={`overflow-auto ${isExpanded ? 'max-h-[80vh]' : 'max-h-96'}`}>
          <ReactDiffViewer
            oldValue={oldContent}
            newValue={newContent}
            splitView={currentViewMode === 'split'}
            showDiffOnly={false}
            compareMethod={DiffMethod.WORDS}
            styles={styles}
            useDarkTheme={true}
            leftTitle={currentViewMode === 'split' ? 'Old' : undefined}
            rightTitle={currentViewMode === 'split' ? 'New' : undefined}
            hideLineNumbers={!showLineNumbers}
            disableWordDiff={!highlightChanges}
          />
        </div>
      </div>
    </>
  );
};

export default DiffViewer;
