import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { invoke } from '../lib/tauri-mock';

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicts: string[];
}

export interface GitBranch {
  name: string;
  is_current: boolean;
  last_commit: string;
}

export interface GitDiff {
  file_path: string;
  additions: number;
  deletions: number;
  diff_content: string;
}

export interface UseGitReturn {
  status: GitStatus | null;
  branches: GitBranch[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  stage: (files: string[]) => Promise<boolean>;
  unstage: (files: string[]) => Promise<boolean>;
  discard: (files: string[]) => Promise<boolean>;
  commit: (message: string) => Promise<boolean>;
  checkout: (branchName: string) => Promise<boolean>;
  createBranch: (branchName: string) => Promise<boolean>;
  deleteBranch: (branchName: string) => Promise<boolean>;
  fetch: () => Promise<boolean>;
  pull: () => Promise<boolean>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const plural = (count: number) => `${count} file${count === 1 ? '' : 's'}`;

export function useGit(repoPath: string | null): UseGitReturn {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentPath = useRef(repoPath);

  useEffect(() => {
    currentPath.current = repoPath;
  }, [repoPath]);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      const [nextStatus, nextBranches] = await Promise.all([
        invoke<GitStatus>('git_status', { path: repoPath }),
        invoke<GitBranch[]>('git_list_branches', { path: repoPath }),
      ]);
      if (currentPath.current !== repoPath) return;
      setStatus(nextStatus);
      setBranches(nextBranches);
      setError(null);
    } catch (cause) {
      if (currentPath.current !== repoPath) return;
      setStatus(null);
      setBranches([]);
      setError(messageOf(cause));
    } finally {
      if (currentPath.current === repoPath) setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (
      operation: string,
      task: (path: string) => Promise<unknown>,
      done?: string | ((result: unknown) => string),
    ) => {
      if (!repoPath) return false;
      setLoading(true);
      try {
        const result = await task(repoPath);
        if (done) toast.success(typeof done === 'string' ? done : done(result));
        return true;
      } catch (cause) {
        toast.error(`Could not ${operation}: ${messageOf(cause)}`);
        return false;
      } finally {
        await refresh();
      }
    },
    [refresh, repoPath],
  );

  const stage = useCallback(
    (files: string[]) =>
      run('stage', (path) => invoke('git_add', { path, files }), `Staged ${plural(files.length)}`),
    [run],
  );

  const unstage = useCallback(
    (files: string[]) =>
      run(
        'unstage',
        (path) => invoke('git_reset', { path, commit: 'HEAD', mode: 'mixed', files }),
        `Unstaged ${plural(files.length)}`,
      ),
    [run],
  );

  const discard = useCallback(
    (files: string[]) =>
      run(
        'discard changes',
        (path) => invoke('git_checkout_files', { path, files }),
        `Discarded changes in ${plural(files.length)}`,
      ),
    [run],
  );

  const commit = useCallback(
    (message: string) =>
      run('commit', (path) => invoke('git_commit', { path, message }), 'Committed'),
    [run],
  );

  const checkout = useCallback(
    (branchName: string) =>
      run(
        'switch branch',
        (path) => invoke('git_checkout', { path, branchName }),
        `Switched to ${branchName}`,
      ),
    [run],
  );

  const createBranch = useCallback(
    (branchName: string) =>
      run(
        'create branch',
        (path) => invoke('git_checkout_new_branch', { path, branchName }),
        `Created and switched to ${branchName}`,
      ),
    [run],
  );

  const deleteBranch = useCallback(
    (branchName: string) =>
      run(
        'delete branch',
        (path) => invoke('git_delete_branch', { path, branchName }),
        `Deleted ${branchName}`,
      ),
    [run],
  );

  const fetch = useCallback(
    () => run('fetch', (path) => invoke('git_fetch', { path }), 'Fetched from the remote'),
    [run],
  );

  const pull = useCallback(
    () =>
      run(
        'pull',
        (path) => invoke<string>('git_pull', { path }),
        (result) => (typeof result === 'string' && result ? result : 'Pull successful'),
      ),
    [run],
  );

  return {
    status,
    branches,
    loading,
    error,
    refresh,
    stage,
    unstage,
    discard,
    commit,
    checkout,
    createBranch,
    deleteBranch,
    fetch,
    pull,
  };
}
