/**
 * Git Panel component.
 *
 * A comprehensive Git interface combining status, diff viewing,
 * and commit functionality.
 *
 * @module GitPanel
 */

import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  GitCommit as GitCommitIcon,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { useGit } from '../../hooks/useGit';
import { Button } from '../ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { GitCommitDialog } from './GitCommitDialog';
import { GitDiffViewer } from './GitDiffViewer';
import { GitStatusPanel } from './GitStatusPanel';

interface GitPanelProps {
  /** Repository path */
  repoPath: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Git Panel component.
 *
 * Provides a complete Git interface with:
 * - Status view with staging controls
 * - Diff viewer for staged and unstaged changes
 * - Commit dialog
 * - Push/pull operations
 *
 * @param props - Component props
 * @returns The Git panel
 *
 * @example
 * ```tsx
 * <GitPanel repoPath="/path/to/repo" />
 * ```
 */
export function GitPanel({ repoPath, className }: GitPanelProps) {
  const { status, loading, setRepoPath, refreshStatus, push, pull } = useGit(repoPath);

  const [activeTab, setActiveTab] = useState<string>('changes');
  const [selectedFile, setSelectedFile] = useState<{ path: string; staged: boolean } | null>(null);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  // Update repo path when prop changes
  useEffect(() => {
    setRepoPath(repoPath);
  }, [repoPath, setRepoPath]);

  // Fetch status on mount
  useEffect(() => {
    if (repoPath) {
      refreshStatus();
    }
  }, [repoPath, refreshStatus]);

  const handleFileSelect = useCallback((filePath: string, staged: boolean) => {
    setSelectedFile({ path: filePath, staged });
    setActiveTab('diff');
  }, []);

  const handleCommitSuccess = useCallback(
    (_commitHash: string) => {
      refreshStatus();
      setSelectedFile(null);
    },
    [refreshStatus],
  );

  const handlePush = useCallback(async () => {
    setIsPushing(true);
    try {
      await push();
    } finally {
      setIsPushing(false);
    }
  }, [push]);

  const handlePull = useCallback(async () => {
    setIsPulling(true);
    try {
      await pull();
    } finally {
      setIsPulling(false);
    }
  }, [pull]);

  const hasStagedChanges = (status?.staged.length ?? 0) > 0;
  const hasUnpushedCommits = (status?.ahead ?? 0) > 0;
  const hasUnpulledCommits = (status?.behind ?? 0) > 0;
  const hasAnyChanges =
    (status?.staged.length ?? 0) > 0 ||
    (status?.unstaged.length ?? 0) > 0 ||
    (status?.untracked.length ?? 0) > 0;

  return (
    <div
      className={cn(
        'flex flex-col h-full border border-border rounded-lg bg-background',
        className,
      )}
      role="region"
      aria-label="Git panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          <span className="text-sm font-medium">Git</span>
          {status && (
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
              {status.branch}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePull}
            disabled={loading || isPulling}
            title={hasUnpulledCommits ? `Pull ${status?.behind} commits` : 'Pull'}
          >
            {isPulling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
            {hasUnpulledCommits && <span className="ml-1 text-xs">{status?.behind}</span>}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handlePush}
            disabled={loading || isPushing || !hasUnpushedCommits}
            title={hasUnpushedCommits ? `Push ${status?.ahead} commits` : 'Push'}
          >
            {isPushing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
            {hasUnpushedCommits && <span className="ml-1 text-xs">{status?.ahead}</span>}
          </Button>

          <div className="h-4 w-px bg-border mx-1" />

          <Button
            variant={hasStagedChanges ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCommitDialogOpen(true)}
            disabled={loading || !hasStagedChanges}
            title="Commit staged changes"
          >
            <GitCommitIcon className="h-4 w-4 mr-1" />
            Commit
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={refreshStatus}
            disabled={loading}
            title="Refresh"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-2">
          <TabsTrigger value="changes" className="gap-1">
            Changes
            {hasAnyChanges && (
              <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                {(status?.staged.length ?? 0) +
                  (status?.unstaged.length ?? 0) +
                  (status?.untracked.length ?? 0)}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="diff" className="gap-1">
            Diff
            {selectedFile && (
              <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                ({selectedFile.path.split('/').pop()})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="staged-diff">
            Staged
            {(status?.staged.length ?? 0) > 0 && (
              <span className="text-xs bg-green-500/20 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full ml-1">
                {status?.staged.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="changes" className="flex-1 m-0 min-h-0">
          <GitStatusPanel
            repoPath={repoPath}
            onFileSelect={handleFileSelect}
            className="h-full border-0 rounded-none"
          />
        </TabsContent>

        <TabsContent value="diff" className="flex-1 m-0 min-h-0">
          <GitDiffViewer
            repoPath={repoPath}
            filePath={selectedFile?.path}
            staged={selectedFile?.staged ?? false}
            className="h-full border-0 rounded-none"
          />
        </TabsContent>

        <TabsContent value="staged-diff" className="flex-1 m-0 min-h-0">
          <GitDiffViewer
            repoPath={repoPath}
            staged={true}
            className="h-full border-0 rounded-none"
          />
        </TabsContent>
      </Tabs>

      {/* Commit Dialog */}
      <GitCommitDialog
        open={commitDialogOpen}
        onOpenChange={setCommitDialogOpen}
        repoPath={repoPath}
        onCommitSuccess={handleCommitSuccess}
      />
    </div>
  );
}
