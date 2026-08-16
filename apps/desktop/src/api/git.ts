
import { invoke, isTauri } from '../lib/tauri-mock';

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicts: string[];
}

export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
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

export interface ConflictHunk {
  ours: string;
  theirs: string;
  base: string;
  start_line: number;
  end_line: number;
}

export interface GitConflictDetails {
  file_path: string;
  full_content: string;
  hunks: ConflictHunk[];
  conflict_count: number;
}

export interface ConflictResolutionRequest {
  hunkIndex: number;
  strategy: 'keep_ours' | 'keep_theirs' | 'keep_both' | 'manual' | 'llm_suggested';
  manualContent?: string;
}

interface ConflictResolutionWire {
  hunk_index: number;
  strategy: string;
  manual_content: string | null;
}

export interface ResolutionResult {
  file_path: string;
  success: boolean;
  resolved_content: string | null;
  error: string | null;
  conflicts_resolved: number;
  conflicts_remaining: number;
}

export interface BranchDiffSummary {
  commits_ahead: number;
  commits_behind: number;
  files_changed: number;
  insertions: number;
  deletions: number;
  commit_messages: string[];
}

export interface GeneratedPrContent {
  title: string;
  body: string;
}

export interface PrCreationConfig {
  base_branch: string;
  head_branch: string;
  title?: string;
  body?: string;
  auto_generate?: boolean;
}

export interface PrCreationResult {
  success: boolean;
  title: string;
  body: string;
  base_branch: string;
  head_branch: string;
  error?: string;
}

export interface PrReadinessResult {
  ready: boolean;
  issues: string[];
  commits_ahead: number;
  has_remote: boolean;
  remote_up_to_date: boolean;
}

export async function gitInit(path: string): Promise<string> {
  if (!isTauri) return 'Mock: git init';
  try {
    return await invoke<string>('git_init', { path });
  } catch (err) {
    throw new Error(`git init failed: ${err}`);
  }
}

export async function gitStatus(path: string): Promise<GitStatus> {
  if (!isTauri) {
    return {
      branch: 'main',
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
    };
  }
  try {
    return await invoke<GitStatus>('git_status', { path });
  } catch (err) {
    throw new Error(`git status failed: ${err}`);
  }
}

export async function gitAdd(path: string, files: string[]): Promise<string> {
  if (!isTauri) return 'Mock: git add';
  try {
    return await invoke<string>('git_add', { path, files });
  } catch (err) {
    throw new Error(`git add failed: ${err}`);
  }
}

export async function gitCommit(path: string, message: string): Promise<string> {
  if (!isTauri) return 'mock-commit-hash';
  try {
    return await invoke<string>('git_commit', { path, message });
  } catch (err) {
    throw new Error(`git commit failed: ${err}`);
  }
}

/** Push to a remote. Triggers confirmation dialog for safety. */
export async function gitPush(
  path: string,
  remote?: string | null,
  branch?: string | null,
  force?: boolean,
): Promise<string> {
  if (!isTauri) return 'Mock: push successful';
  try {
    return await invoke<string>('git_push', {
      path,
      remote: remote ?? null,
      branch: branch ?? null,
      force: force ?? false,
    });
  } catch (err) {
    throw new Error(`git push failed: ${err}`);
  }
}

export async function gitPull(
  path: string,
  remote?: string | null,
  branch?: string | null,
): Promise<string> {
  if (!isTauri) return 'Mock: pull successful';
  try {
    return await invoke<string>('git_pull', {
      path,
      remote: remote ?? null,
      branch: branch ?? null,
    });
  } catch (err) {
    throw new Error(`git pull failed: ${err}`);
  }
}

export async function gitFetch(path: string, remote?: string | null): Promise<string> {
  if (!isTauri) return 'Mock: fetch successful';
  try {
    return await invoke<string>('git_fetch', {
      path,
      remote: remote ?? null,
    });
  } catch (err) {
    throw new Error(`git fetch failed: ${err}`);
  }
}

export async function gitDiff(
  path: string,
  filePath?: string | null,
  staged?: boolean,
): Promise<GitDiff[]> {
  if (!isTauri) return [];
  try {
    return await invoke<GitDiff[]>('git_diff', {
      path,
      filePath: filePath ?? null,
      staged: staged ?? false,
    });
  } catch (err) {
    throw new Error(`git diff failed: ${err}`);
  }
}

export async function gitLog(path: string, limit?: number): Promise<GitCommit[]> {
  if (!isTauri) return [];
  try {
    return await invoke<GitCommit[]>('git_log', {
      path,
      limit: limit ?? 50,
    });
  } catch (err) {
    throw new Error(`git log failed: ${err}`);
  }
}

export async function gitClone(url: string, destination: string): Promise<string> {
  if (!isTauri) return 'Mock: clone successful';
  try {
    return await invoke<string>('git_clone', { url, destination });
  } catch (err) {
    throw new Error(`git clone failed: ${err}`);
  }
}

export async function gitListBranches(path: string): Promise<GitBranch[]> {
  if (!isTauri) return [];
  try {
    return await invoke<GitBranch[]>('git_list_branches', { path });
  } catch (err) {
    throw new Error(`git list branches failed: ${err}`);
  }
}

export async function gitCreateBranch(path: string, branchName: string): Promise<string> {
  if (!isTauri) return `Mock: branch '${branchName}' created`;
  try {
    return await invoke<string>('git_create_branch', { path, branchName });
  } catch (err) {
    throw new Error(`git create branch failed: ${err}`);
  }
}

export async function gitCheckout(path: string, branchName: string): Promise<string> {
  if (!isTauri) return `Mock: switched to '${branchName}'`;
  try {
    return await invoke<string>('git_checkout', { path, branchName });
  } catch (err) {
    throw new Error(`git checkout failed: ${err}`);
  }
}

export async function gitCheckoutNewBranch(path: string, branchName: string): Promise<string> {
  if (!isTauri) return `Mock: switched to new branch '${branchName}'`;
  try {
    return await invoke<string>('git_checkout_new_branch', { path, branchName });
  } catch (err) {
    throw new Error(`git checkout new branch failed: ${err}`);
  }
}

export async function gitDeleteBranch(
  path: string,
  branchName: string,
  force?: boolean,
): Promise<string> {
  if (!isTauri) return `Mock: branch '${branchName}' deleted`;
  try {
    return await invoke<string>('git_delete_branch', {
      path,
      branchName,
      force: force ?? false,
    });
  } catch (err) {
    throw new Error(`git delete branch failed: ${err}`);
  }
}

export async function gitMerge(path: string, branchName: string): Promise<string> {
  if (!isTauri) return 'Mock: merge successful';
  try {
    return await invoke<string>('git_merge', { path, branchName });
  } catch (err) {
    throw new Error(`git merge failed: ${err}`);
  }
}

export async function gitCurrentBranch(path: string): Promise<string> {
  if (!isTauri) return 'main';
  try {
    return await invoke<string>('git_current_branch', { path });
  } catch (err) {
    throw new Error(`git current branch failed: ${err}`);
  }
}

export async function gitDefaultBranch(path: string): Promise<string> {
  if (!isTauri) return 'main';
  try {
    return await invoke<string>('git_default_branch', { path });
  } catch (err) {
    throw new Error(`git default branch failed: ${err}`);
  }
}

export async function gitStash(path: string, message?: string | null): Promise<string> {
  if (!isTauri) return 'Mock: stash successful';
  try {
    return await invoke<string>('git_stash', {
      path,
      message: message ?? null,
    });
  } catch (err) {
    throw new Error(`git stash failed: ${err}`);
  }
}

export async function gitStashPop(path: string): Promise<string> {
  if (!isTauri) return 'Mock: stash pop successful';
  try {
    return await invoke<string>('git_stash_pop', { path });
  } catch (err) {
    throw new Error(`git stash pop failed: ${err}`);
  }
}

/**
 * Reset the repository to a commit.
 * If `files` is provided, resets only those files (like `git reset HEAD -- <files>`).
 * Triggers confirmation dialog for safety.
 */
export async function gitReset(
  path: string,
  commit: string,
  mode: 'soft' | 'mixed' | 'hard',
  files?: string[] | null,
): Promise<string> {
  if (!isTauri) return 'Mock: reset successful';
  try {
    return await invoke<string>('git_reset', {
      path,
      commit,
      mode,
      files: files ?? null,
    });
  } catch (err) {
    throw new Error(`git reset failed: ${err}`);
  }
}

/**
 * Discard working-tree changes for specific files
 * (like `git checkout -- <files>`).
 * Triggers confirmation dialog for safety.
 */
export async function gitCheckoutFiles(path: string, files: string[]): Promise<string> {
  if (!isTauri) return `Mock: discarded changes in ${files.length} file(s)`;
  try {
    return await invoke<string>('git_checkout_files', { path, files });
  } catch (err) {
    throw new Error(`git checkout files failed: ${err}`);
  }
}

export async function gitListRemotes(path: string): Promise<[string, string][]> {
  if (!isTauri) return [];
  try {
    return await invoke<[string, string][]>('git_list_remotes', { path });
  } catch (err) {
    throw new Error(`git list remotes failed: ${err}`);
  }
}

export async function gitAddRemote(path: string, name: string, url: string): Promise<string> {
  if (!isTauri) return `Mock: remote '${name}' added`;
  try {
    return await invoke<string>('git_add_remote', { path, name, url });
  } catch (err) {
    throw new Error(`git add remote failed: ${err}`);
  }
}

export async function gitHasConflicts(path: string): Promise<boolean> {
  if (!isTauri) return false;
  try {
    return await invoke<boolean>('git_has_conflicts', { path });
  } catch (err) {
    throw new Error(`git has conflicts check failed: ${err}`);
  }
}

export async function gitListConflicts(path: string): Promise<string[]> {
  if (!isTauri) return [];
  try {
    return await invoke<string[]>('git_list_conflicts', { path });
  } catch (err) {
    throw new Error(`git list conflicts failed: ${err}`);
  }
}

export async function gitGetConflictDetails(
  path: string,
  filePath: string,
): Promise<GitConflictDetails> {
  if (!isTauri) {
    return {
      file_path: filePath,
      full_content: '',
      hunks: [],
      conflict_count: 0,
    };
  }
  try {
    return await invoke<GitConflictDetails>('git_get_conflict_details', {
      path,
      filePath,
    });
  } catch (err) {
    throw new Error(`git get conflict details failed: ${err}`);
  }
}

export async function gitResolveConflict(
  path: string,
  filePath: string,
  resolutions: ConflictResolutionRequest[],
): Promise<ResolutionResult> {
  if (!isTauri) {
    return {
      file_path: filePath,
      success: true,
      resolved_content: null,
      error: null,
      conflicts_resolved: resolutions.length,
      conflicts_remaining: 0,
    };
  }
  try {
    const wireResolutions: ConflictResolutionWire[] = resolutions.map((r) => ({
      hunk_index: r.hunkIndex,
      strategy: r.strategy,
      manual_content: r.manualContent ?? null,
    }));
    return await invoke<ResolutionResult>('git_resolve_conflict', {
      path,
      filePath,
      resolutions: wireResolutions,
    });
  } catch (err) {
    throw new Error(`git resolve conflict failed: ${err}`);
  }
}

export async function gitMarkResolved(path: string, filePath: string): Promise<string> {
  if (!isTauri) return `Mock: marked ${filePath} as resolved`;
  try {
    return await invoke<string>('git_mark_resolved', { path, filePath });
  } catch (err) {
    throw new Error(`git mark resolved failed: ${err}`);
  }
}

export async function gitGetConflictSuggestionPrompt(
  path: string,
  filePath: string,
  hunkIndex: number,
): Promise<string> {
  if (!isTauri) return '';
  try {
    return await invoke<string>('git_get_conflict_suggestion_prompt', {
      path,
      filePath,
      hunkIndex,
    });
  } catch (err) {
    throw new Error(`git get conflict suggestion prompt failed: ${err}`);
  }
}

export async function gitAbortMerge(path: string): Promise<string> {
  if (!isTauri) return 'Mock: merge aborted';
  try {
    return await invoke<string>('git_abort_merge', { path });
  } catch (err) {
    throw new Error(`git abort merge failed: ${err}`);
  }
}

export async function gitCompleteMerge(path: string, message?: string | null): Promise<string> {
  if (!isTauri) return 'mock-merge-commit-hash';
  try {
    return await invoke<string>('git_complete_merge', {
      path,
      message: message ?? null,
    });
  } catch (err) {
    throw new Error(`git complete merge failed: ${err}`);
  }
}

export async function gitGetBranchDiffSummary(
  path: string,
  baseBranch: string,
  headBranch: string,
): Promise<BranchDiffSummary> {
  if (!isTauri) {
    return {
      commits_ahead: 0,
      commits_behind: 0,
      files_changed: 0,
      insertions: 0,
      deletions: 0,
      commit_messages: [],
    };
  }
  try {
    return await invoke<BranchDiffSummary>('git_get_branch_diff_summary', {
      path,
      baseBranch,
      headBranch,
    });
  } catch (err) {
    throw new Error(`git get branch diff summary failed: ${err}`);
  }
}

export async function gitGeneratePrDescription(
  path: string,
  baseBranch: string,
  headBranch: string,
): Promise<GeneratedPrContent> {
  if (!isTauri) return { title: '', body: '' };
  try {
    return await invoke<GeneratedPrContent>('git_generate_pr_description', {
      path,
      baseBranch,
      headBranch,
    });
  } catch (err) {
    throw new Error(`git generate PR description failed: ${err}`);
  }
}

export async function gitCreatePr(
  path: string,
  config: PrCreationConfig,
): Promise<PrCreationResult> {
  if (!isTauri) {
    return {
      success: false,
      title: '',
      body: '',
      base_branch: config.base_branch,
      head_branch: config.head_branch,
      error: 'Not in Tauri environment',
    };
  }
  try {
    return await invoke<PrCreationResult>('git_create_pr', { path, config });
  } catch (err) {
    throw new Error(`git create PR failed: ${err}`);
  }
}

export async function gitCheckPrReadiness(
  path: string,
  baseBranch: string,
  headBranch: string,
): Promise<PrReadinessResult> {
  if (!isTauri) {
    return {
      ready: false,
      issues: ['Not in Tauri environment'],
      commits_ahead: 0,
      has_remote: false,
      remote_up_to_date: false,
    };
  }
  try {
    return await invoke<PrReadinessResult>('git_check_pr_readiness', {
      path,
      baseBranch,
      headBranch,
    });
  } catch (err) {
    throw new Error(`git check PR readiness failed: ${err}`);
  }
}

export const GitClient = {
  init: gitInit,
  status: gitStatus,
  add: gitAdd,
  commit: gitCommit,
  push: gitPush,
  pull: gitPull,
  fetch: gitFetch,
  diff: gitDiff,
  log: gitLog,
  clone: gitClone,

  listBranches: gitListBranches,
  createBranch: gitCreateBranch,
  checkout: gitCheckout,
  checkoutNewBranch: gitCheckoutNewBranch,
  deleteBranch: gitDeleteBranch,
  merge: gitMerge,
  currentBranch: gitCurrentBranch,
  defaultBranch: gitDefaultBranch,

  stash: gitStash,
  stashPop: gitStashPop,

  reset: gitReset,
  checkoutFiles: gitCheckoutFiles,

  listRemotes: gitListRemotes,
  addRemote: gitAddRemote,

  hasConflicts: gitHasConflicts,
  listConflicts: gitListConflicts,
  getConflictDetails: gitGetConflictDetails,
  resolveConflict: gitResolveConflict,
  markResolved: gitMarkResolved,
  getConflictSuggestionPrompt: gitGetConflictSuggestionPrompt,
  abortMerge: gitAbortMerge,
  completeMerge: gitCompleteMerge,

  getBranchDiffSummary: gitGetBranchDiffSummary,
  generatePrDescription: gitGeneratePrDescription,
  createPr: gitCreatePr,
  checkPrReadiness: gitCheckPrReadiness,
} as const;
