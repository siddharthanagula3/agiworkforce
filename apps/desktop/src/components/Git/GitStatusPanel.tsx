/**
 * Git Status Panel component.
 *
 * Displays the current Git repository status including staged, unstaged,
 * and untracked files. Provides controls for staging/unstaging files.
 *
 * @module GitStatusPanel
 */

import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  FileMinus,
  FilePlus,
  FileQuestion,
  GitBranch,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { useGit } from '../../hooks/useGit';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { ScrollArea } from '../ui/ScrollArea';

interface GitStatusPanelProps {
  /** Repository path to display status for */
  repoPath: string;
  /** Callback when a file is selected for diff viewing */
  onFileSelect?: (filePath: string, staged: boolean) => void;
  /** Additional CSS classes */
  className?: string;
}

type FileCategory = 'staged' | 'unstaged' | 'untracked' | 'conflicts';

interface FileItem {
  path: string;
  category: FileCategory;
  selected: boolean;
}

/**
 * Git Status Panel component.
 *
 * @param props - Component props
 * @returns The Git status panel
 *
 * @example
 * ```tsx
 * <GitStatusPanel
 *   repoPath="/path/to/repo"
 *   onFileSelect={(path, staged) => console.log(path, staged)}
 * />
 * ```
 */
export function GitStatusPanel({ repoPath, onFileSelect, className }: GitStatusPanelProps) {
  const {
    status,
    loading,
    error,
    setRepoPath,
    refreshStatus,
    stage,
    unstage,
    stageAll,
    unstageAll,
  } = useGit(repoPath);

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<FileCategory>>(
    new Set(['staged', 'unstaged', 'untracked', 'conflicts']),
  );

  // Update repo path when prop changes
  useEffect(() => {
    setRepoPath(repoPath);
  }, [repoPath, setRepoPath]);

  // Fetch status on mount and when repo path changes
  useEffect(() => {
    if (repoPath) {
      refreshStatus();
    }
  }, [repoPath, refreshStatus]);

  // Build file items from status
  const fileItems = useMemo((): FileItem[] => {
    if (!status) return [];

    const items: FileItem[] = [];

    status.conflicts.forEach((path) => {
      items.push({ path, category: 'conflicts', selected: selectedFiles.has(`conflicts:${path}`) });
    });

    status.staged.forEach((path) => {
      items.push({ path, category: 'staged', selected: selectedFiles.has(`staged:${path}`) });
    });

    status.unstaged.forEach((path) => {
      items.push({ path, category: 'unstaged', selected: selectedFiles.has(`unstaged:${path}`) });
    });

    status.untracked.forEach((path) => {
      items.push({ path, category: 'untracked', selected: selectedFiles.has(`untracked:${path}`) });
    });

    return items;
  }, [status, selectedFiles]);

  const getFilesByCategory = useCallback(
    (category: FileCategory): FileItem[] => {
      return fileItems.filter((item) => item.category === category);
    },
    [fileItems],
  );

  const toggleSection = useCallback((category: FileCategory) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const toggleFileSelection = useCallback((category: FileCategory, path: string) => {
    const key = `${category}:${path}`;
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectAllInCategory = useCallback(
    (category: FileCategory) => {
      const files = getFilesByCategory(category);
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        files.forEach((file) => {
          next.add(`${category}:${file.path}`);
        });
        return next;
      });
    },
    [getFilesByCategory],
  );

  const deselectAllInCategory = useCallback((category: FileCategory) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      for (const key of prev) {
        if (key.startsWith(`${category}:`)) {
          next.delete(key);
        }
      }
      return next;
    });
  }, []);

  const getSelectedFilesForCategory = useCallback(
    (category: FileCategory): string[] => {
      const paths: string[] = [];
      selectedFiles.forEach((key) => {
        if (key.startsWith(`${category}:`)) {
          paths.push(key.substring(category.length + 1));
        }
      });
      return paths;
    },
    [selectedFiles],
  );

  const handleStageSelected = useCallback(async () => {
    const unstagedFiles = getSelectedFilesForCategory('unstaged');
    const untrackedFiles = getSelectedFilesForCategory('untracked');
    const files = [...unstagedFiles, ...untrackedFiles];

    if (files.length > 0) {
      await stage(files);
      setSelectedFiles(new Set());
    }
  }, [getSelectedFilesForCategory, stage]);

  const handleUnstageSelected = useCallback(async () => {
    const stagedFiles = getSelectedFilesForCategory('staged');

    if (stagedFiles.length > 0) {
      await unstage(stagedFiles);
      setSelectedFiles(new Set());
    }
  }, [getSelectedFilesForCategory, unstage]);

  const handleStageAll = useCallback(async () => {
    await stageAll();
    setSelectedFiles(new Set());
  }, [stageAll]);

  const handleUnstageAll = useCallback(async () => {
    await unstageAll();
    setSelectedFiles(new Set());
  }, [unstageAll]);

  const handleFileClick = useCallback(
    (path: string, category: FileCategory) => {
      onFileSelect?.(path, category === 'staged');
    },
    [onFileSelect],
  );

  const getFileIcon = useCallback((category: FileCategory) => {
    switch (category) {
      case 'staged':
        return <Check className="h-3 w-3 text-green-500" />;
      case 'unstaged':
        return <FileMinus className="h-3 w-3 text-amber-500" />;
      case 'untracked':
        return <FileQuestion className="h-3 w-3 text-blue-500" />;
      case 'conflicts':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return <File className="h-3 w-3" />;
    }
  }, []);

  const getCategoryLabel = useCallback((category: FileCategory): string => {
    switch (category) {
      case 'staged':
        return 'Staged Changes';
      case 'unstaged':
        return 'Changed';
      case 'untracked':
        return 'Untracked';
      case 'conflicts':
        return 'Merge Conflicts';
      default:
        return category;
    }
  }, []);

  const getCategoryIcon = useCallback((category: FileCategory) => {
    switch (category) {
      case 'staged':
        return <FilePlus className="h-4 w-4 text-green-500" />;
      case 'unstaged':
        return <FileMinus className="h-4 w-4 text-amber-500" />;
      case 'untracked':
        return <FileQuestion className="h-4 w-4 text-blue-500" />;
      case 'conflicts':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <File className="h-4 w-4" />;
    }
  }, []);

  const hasSelectedFiles = selectedFiles.size > 0;
  const hasUnstagedOrUntracked =
    (status?.unstaged.length ?? 0) > 0 || (status?.untracked.length ?? 0) > 0;
  const hasStagedFiles = (status?.staged.length ?? 0) > 0;

  const renderSection = useCallback(
    (category: FileCategory) => {
      const files = getFilesByCategory(category);
      if (files.length === 0) return null;

      const isExpanded = expandedSections.has(category);
      const allSelected = files.every((f) => f.selected);
      const someSelected = files.some((f) => f.selected) && !allSelected;

      return (
        <div key={category} className="border-b border-border last:border-b-0">
          {/* Section Header */}
          <div
            className="flex items-center gap-2 px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50"
            onClick={() => toggleSection(category)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            {getCategoryIcon(category)}
            <span className="text-sm font-medium flex-1">{getCategoryLabel(category)}</span>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {files.length}
            </span>
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => {
                if (checked) {
                  selectAllInCategory(category);
                } else {
                  deselectAllInCategory(category);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className={cn(someSelected && 'data-[state=unchecked]:bg-primary/30')}
              aria-label={`Select all ${getCategoryLabel(category)}`}
            />
          </div>

          {/* File List */}
          {isExpanded && (
            <div className="py-1">
              {files.map((file) => (
                <div
                  key={file.path}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 cursor-pointer',
                    'hover:bg-muted/30 transition-colors',
                    file.selected && 'bg-primary/10',
                  )}
                  onClick={() => handleFileClick(file.path, category)}
                >
                  <Checkbox
                    checked={file.selected}
                    onCheckedChange={() => toggleFileSelection(category, file.path)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${file.path}`}
                  />
                  {getFileIcon(category)}
                  <span className="text-sm font-mono truncate flex-1" title={file.path}>
                    {file.path}
                  </span>
                  {/* Quick actions */}
                  {category === 'staged' && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        unstage([file.path]);
                      }}
                      title="Unstage"
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  )}
                  {(category === 'unstaged' || category === 'untracked') && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        stage([file.path]);
                      }}
                      title="Stage"
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    },
    [
      getFilesByCategory,
      expandedSections,
      toggleSection,
      getCategoryIcon,
      getCategoryLabel,
      selectAllInCategory,
      deselectAllInCategory,
      handleFileClick,
      toggleFileSelection,
      getFileIcon,
      stage,
      unstage,
    ],
  );

  if (error && !status) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="flex items-center justify-center h-full p-4 text-center">
          <div className="space-y-2">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={refreshStatus}>
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
      aria-label="Git status panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{status?.branch ?? 'Loading...'}</span>
          {status && (status.ahead > 0 || status.behind > 0) && (
            <span className="text-xs text-muted-foreground">
              {status.ahead > 0 && <span className="text-green-500">+{status.ahead}</span>}
              {status.ahead > 0 && status.behind > 0 && ' / '}
              {status.behind > 0 && <span className="text-amber-500">-{status.behind}</span>}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshStatus}
          disabled={loading}
          title="Refresh status"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/10">
        <Button
          variant="outline"
          size="xs"
          onClick={handleStageAll}
          disabled={loading || !hasUnstagedOrUntracked}
          title="Stage all changes"
        >
          <Plus className="h-3 w-3 mr-1" />
          Stage All
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={handleUnstageAll}
          disabled={loading || !hasStagedFiles}
          title="Unstage all changes"
        >
          <Minus className="h-3 w-3 mr-1" />
          Unstage All
        </Button>
        {hasSelectedFiles && (
          <>
            <div className="h-4 w-px bg-border" />
            <Button
              variant="default"
              size="xs"
              onClick={handleStageSelected}
              disabled={loading}
              title="Stage selected"
            >
              <Plus className="h-3 w-3 mr-1" />
              Stage Selected
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={handleUnstageSelected}
              disabled={loading}
              title="Unstage selected"
            >
              <Minus className="h-3 w-3 mr-1" />
              Unstage Selected
            </Button>
          </>
        )}
      </div>

      {/* File List */}
      <ScrollArea className="flex-1">
        {loading && !status ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : status &&
          status.staged.length === 0 &&
          status.unstaged.length === 0 &&
          status.untracked.length === 0 &&
          status.conflicts.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <div className="text-center space-y-1">
              <Check className="h-8 w-8 mx-auto text-green-500" />
              <p className="text-sm">Working tree clean</p>
            </div>
          </div>
        ) : (
          <>
            {renderSection('conflicts')}
            {renderSection('staged')}
            {renderSection('unstaged')}
            {renderSection('untracked')}
          </>
        )}
      </ScrollArea>

      {/* Footer */}
      {status && (
        <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground border-t border-border bg-muted/10">
          <span>
            {status.staged.length} staged, {status.unstaged.length + status.untracked.length}{' '}
            changes
          </span>
          {status.conflicts.length > 0 && (
            <span className="text-red-500">{status.conflicts.length} conflicts</span>
          )}
        </div>
      )}
    </div>
  );
}
