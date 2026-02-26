/**
 * Git operations hook for AGI Workforce.
 *
 * Provides a convenient interface to Git operations via Tauri commands.
 * Handles loading states, error handling, and automatic status refresh.
 *
 * @module useGit
 */

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

/**
 * Git repository status.
 */
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicts: string[];
}

/**
 * Git commit information.
 */
export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

/**
 * Git branch information.
 */
export interface GitBranch {
  name: string;
  is_current: boolean;
  last_commit: string;
}

/**
 * Git diff information for a file.
 */
export interface GitDiff {
  file_path: string;
  additions: number;
  deletions: number;
  diff_content: string;
}

/**
 * Hook state and operations for Git.
 */
export interface UseGitReturn {
  /** Current repository status */
  status: GitStatus | null;
  /** Whether a Git operation is in progress */
  loading: boolean;
  /** Last error message */
  error: string | null;
  /** Repository path being managed */
  repoPath: string | null;

  /** Set the repository path */
  setRepoPath: (path: string) => void;
  /** Refresh the repository status */
  refreshStatus: () => Promise<void>;
  /** Stage files */
  stage: (files: string[]) => Promise<void>;
  /** Unstage files (reset) */
  unstage: (files: string[]) => Promise<void>;
  /** Stage all changes */
  stageAll: () => Promise<void>;
  /** Unstage all changes */
  unstageAll: () => Promise<void>;
  /** Discard changes in working directory */
  discardChanges: (files: string[]) => Promise<void>;
  /** Create a commit */
  commit: (message: string) => Promise<string>;
  /** Push to remote */
  push: (remote?: string, branch?: string, force?: boolean) => Promise<void>;
  /** Pull from remote */
  pull: (remote?: string, branch?: string) => Promise<void>;
  /** Get diff for a file */
  getDiff: (filePath?: string, staged?: boolean) => Promise<GitDiff[]>;
  /** List branches */
  listBranches: () => Promise<GitBranch[]>;
  /** Checkout a branch */
  checkout: (branchName: string) => Promise<void>;
  /** Create and checkout a new branch */
  createBranch: (branchName: string) => Promise<void>;
  /** Get commit log */
  getLog: (limit?: number) => Promise<GitCommit[]>;
  /** Stash changes */
  stash: (message?: string) => Promise<void>;
  /** Pop stash */
  stashPop: () => Promise<void>;
}

/**
 * Hook for managing Git operations.
 *
 * @param initialPath - Optional initial repository path
 * @returns Git operations and state
 *
 * @example
 * ```tsx
 * const { status, stage, commit, push, refreshStatus } = useGit('/path/to/repo');
 *
 * // Stage files
 * await stage(['src/file.ts']);
 *
 * // Commit changes
 * await commit('feat: add new feature');
 *
 * // Push to remote
 * await push();
 * ```
 */
export function useGit(initialPath?: string): UseGitReturn {
  const [repoPath, setRepoPath] = useState<string | null>(initialPath ?? null);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((err: unknown, operation: string) => {
    const message = err instanceof Error ? err.message : String(err);
    setError(message);
    toast.error(`Git ${operation} failed: ${message}`);
    throw err;
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!repoPath) {
      setError('No repository path set');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await invoke<GitStatus>('git_status', { path: repoPath });
      setStatus(result);
    } catch (err) {
      handleError(err, 'status');
    } finally {
      setLoading(false);
    }
  }, [repoPath, handleError]);

  const stage = useCallback(
    async (files: string[]) => {
      if (!repoPath) {
        throw new Error('No repository path set');
      }

      setLoading(true);
      setError(null);

      try {
        await invoke('git_add', { path: repoPath, files });
        toast.success(`Staged ${files.length} file${files.length !== 1 ? 's' : ''}`);
        await refreshStatus();
      } catch (err) {
        handleError(err, 'stage');
      } finally {
        setLoading(false);
      }
    },
    [repoPath, refreshStatus, handleError],
  );

  const unstage = useCallback(
    async (files: string[]) => {
      if (!repoPath) {
        throw new Error('No repository path set');
      }

      setLoading(true);
      setError(null);

      try {
        // Use git reset to unstage all files (git reset doesn't support per-file unstaging directly)
        await invoke('git_reset', {
          path: repoPath,
          commit: 'HEAD',
          mode: 'mixed',
        });
        toast.success(`Unstaged ${files.length} file${files.length !== 1 ? 's' : ''}`);
        await refreshStatus();
      } catch (err) {
        handleError(err, 'unstage');
      } finally {
        setLoading(false);
      }
    },
    [repoPath, refreshStatus, handleError],
  );

  const stageAll = useCallback(async () => {
    if (!repoPath) {
      throw new Error('No repository path set');
    }

    setLoading(true);
    setError(null);

    try {
      await invoke('git_add', { path: repoPath, files: ['.'] });
      toast.success('Staged all changes');
      await refreshStatus();
    } catch (err) {
      handleError(err, 'stage all');
    } finally {
      setLoading(false);
    }
  }, [repoPath, refreshStatus, handleError]);

  const unstageAll = useCallback(async () => {
    if (!repoPath) {
      throw new Error('No repository path set');
    }

    setLoading(true);
    setError(null);

    try {
      await invoke('git_reset', {
        path: repoPath,
        commit: 'HEAD',
        mode: 'mixed',
      });
      toast.success('Unstaged all changes');
      await refreshStatus();
    } catch (err) {
      handleError(err, 'unstage all');
    } finally {
      setLoading(false);
    }
  }, [repoPath, refreshStatus, handleError]);

  const discardChanges = useCallback(
    async (files: string[]) => {
      if (!repoPath) {
        throw new Error('No repository path set');
      }

      setLoading(true);
      setError(null);

      try {
        // Use git reset --hard to discard all changes (resets entire working tree)
        await invoke('git_reset', {
          path: repoPath,
          commit: 'HEAD',
          mode: 'hard',
        });
        toast.success(`Discarded changes in ${files.length} file${files.length !== 1 ? 's' : ''}`);
        await refreshStatus();
      } catch (err) {
        handleError(err, 'discard');
      } finally {
        setLoading(false);
      }
    },
    [repoPath, refreshStatus, handleError],
  );

  const commit = useCallback(
    async (message: string): Promise<string> => {
      if (!repoPath) {
        throw new Error('No repository path set');
      }

      if (!message.trim()) {
        throw new Error('Commit message cannot be empty');
      }

      setLoading(true);
      setError(null);

      try {
        const commitHash = await invoke<string>('git_commit', {
          path: repoPath,
          message,
        });
        toast.success('Commit created successfully');
        await refreshStatus();
        return commitHash;
      } catch (err) {
        handleError(err, 'commit');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [repoPath, refreshStatus, handleError],
  );

  const push = useCallback(
    async (remote?: string, branch?: string, force?: boolean) => {
      if (!repoPath) {
        throw new Error('No repository path set');
      }

      setLoading(true);
      setError(null);

      try {
        await invoke('git_push', {
          path: repoPath,
          remote: remote ?? null,
          branch: branch ?? null,
          force: force ?? false,
        });
        toast.success('Pushed successfully');
        await refreshStatus();
      } catch (err) {
        handleError(err, 'push');
      } finally {
        setLoading(false);
      }
    },
    [repoPath, refreshStatus, handleError],
  );

  const pull = useCallback(
    async (remote?: string, branch?: string) => {
      if (!repoPath) {
        throw new Error('No repository path set');
      }

      setLoading(true);
      setError(null);

      try {
        await invoke('git_pull', {
          path: repoPath,
          remote: remote ?? null,
          branch: branch ?? null,
        });
        toast.success('Pulled successfully');
        await refreshStatus();
      } catch (err) {
        handleError(err, 'pull');
      } finally {
        setLoading(false);
      }
    },
    [repoPath, refreshStatus, handleError],
  );

  const getDiff = useCallback(
    async (filePath?: string, staged?: boolean): Promise<GitDiff[]> => {
      if (!repoPath) {
        throw new Error('No repository path set');
      }

      setLoading(true);
      setError(null);

      try {
        const diffs = await invoke<GitDiff[]>('git_diff', {
          path: repoPath,
          file_path: filePath ?? null,
          staged: staged ?? false,
        });
        return diffs;
      } catch (err) {
        handleError(err, 'diff');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [repoPath, handleError],
  );

  const listBranches = useCallback(async (): Promise<GitBranch[]> => {
    if (!repoPath) {
      throw new Error('No repository path set');
    }

    setLoading(true);
    setError(null);

    try {
      const branches = await invoke<GitBranch[]>('git_list_branches', {
        path: repoPath,
      });
      return branches;
    } catch (err) {
      handleError(err, 'list branches');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [repoPath, handleError]);

  const checkout = useCallback(
    async (branchName: string) => {
      if (!repoPath) {
        throw new Error('No repository path set');
      }

      setLoading(true);
      setError(null);

      try {
        await invoke('git_checkout', {
          path: repoPath,
          branch_name: branchName,
        });
        toast.success(`Switched to branch '${branchName}'`);
        await refreshStatus();
      } catch (err) {
        handleError(err, 'checkout');
      } finally {
        setLoading(false);
      }
    },
    [repoPath, refreshStatus, handleError],
  );

  const createBranch = useCallback(
    async (branchName: string) => {
      if (!repoPath) {
        throw new Error('No repository path set');
      }

      setLoading(true);
      setError(null);

      try {
        await invoke('git_checkout_new_branch', {
          path: repoPath,
          branch_name: branchName,
        });
        toast.success(`Created and switched to branch '${branchName}'`);
        await refreshStatus();
      } catch (err) {
        handleError(err, 'create branch');
      } finally {
        setLoading(false);
      }
    },
    [repoPath, refreshStatus, handleError],
  );

  const getLog = useCallback(
    async (limit?: number): Promise<GitCommit[]> => {
      if (!repoPath) {
        throw new Error('No repository path set');
      }

      setLoading(true);
      setError(null);

      try {
        const commits = await invoke<GitCommit[]>('git_log', {
          path: repoPath,
          limit: limit ?? 50,
        });
        return commits;
      } catch (err) {
        handleError(err, 'log');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [repoPath, handleError],
  );

  const stash = useCallback(
    async (message?: string) => {
      if (!repoPath) {
        throw new Error('No repository path set');
      }

      setLoading(true);
      setError(null);

      try {
        await invoke('git_stash', {
          path: repoPath,
          message: message ?? null,
        });
        toast.success('Changes stashed');
        await refreshStatus();
      } catch (err) {
        handleError(err, 'stash');
      } finally {
        setLoading(false);
      }
    },
    [repoPath, refreshStatus, handleError],
  );

  const stashPop = useCallback(async () => {
    if (!repoPath) {
      throw new Error('No repository path set');
    }

    setLoading(true);
    setError(null);

    try {
      await invoke('git_stash_pop', { path: repoPath });
      toast.success('Stash applied');
      await refreshStatus();
    } catch (err) {
      handleError(err, 'stash pop');
    } finally {
      setLoading(false);
    }
  }, [repoPath, refreshStatus, handleError]);

  return {
    status,
    loading,
    error,
    repoPath,
    setRepoPath,
    refreshStatus,
    stage,
    unstage,
    stageAll,
    unstageAll,
    discardChanges,
    commit,
    push,
    pull,
    getDiff,
    listBranches,
    checkout,
    createBranch,
    getLog,
    stash,
    stashPop,
  };
}
