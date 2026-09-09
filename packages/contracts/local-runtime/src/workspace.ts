export interface WorkspaceRoot {
  id: string;
  /** Absolute, symlink-resolved path. */
  path: string;
  name: string;
  grantedAtMs: number;
  lastOpenedAtMs: number;
  /** Set when the root is inside a git repository. */
  gitRoot?: string;
}

export interface WorkspaceGitState {
  root: string;
  branch: string | null;
  detachedHead: boolean;
  headSha: string | null;
  upstream: string | null;
  remotes: string[];
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  operation: 'none' | 'merge' | 'rebase' | 'cherry-pick' | 'bisect';
  worktree: string;
}

export interface WorkspaceSnapshot {
  root: WorkspaceRoot;
  git: WorkspaceGitState | null;
}

export const WORKSPACE_COMMANDS = [
  'workspace_pick_root',
  'workspace_list_roots',
  'workspace_revoke_root',
  'workspace_snapshot',
  'workspace_reveal',
] as const;

export type WorkspaceCommand = (typeof WORKSPACE_COMMANDS)[number];
