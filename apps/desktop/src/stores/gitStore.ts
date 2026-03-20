import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import {
  gitInit,
  gitStatus,
  gitAdd,
  gitCommit,
  gitPush,
  gitPull,
  gitFetch,
  gitDiff,
  gitLog,
  gitClone,
  gitListBranches,
  gitCreateBranch,
  gitCheckout,
  gitCheckoutNewBranch,
  gitDeleteBranch,
  gitMerge,
  gitCurrentBranch,
  gitDefaultBranch,
  gitStash,
  gitStashPop,
  gitReset,
  gitCheckoutFiles,
  gitListRemotes,
  gitAddRemote,
  gitHasConflicts,
  gitListConflicts,
  gitGetConflictDetails,
  gitResolveConflict,
  gitMarkResolved,
  gitGetConflictSuggestionPrompt,
  gitAbortMerge,
  gitCompleteMerge,
  gitGetBranchDiffSummary,
  gitGeneratePrDescription,
  gitCreatePr,
  gitCheckPrReadiness,
  type GitStatus,
  type GitCommit,
  type GitBranch,
  type GitDiff,
  type GitConflictDetails,
  type ConflictResolutionRequest,
  type ResolutionResult,
  type BranchDiffSummary,
  type GeneratedPrContent,
  type PrCreationConfig,
  type PrCreationResult,
  type PrReadinessResult,
} from '../api/git';

// ============================================================================
// Re-export types from API for consumers that import from the store
// ============================================================================

export type {
  GitStatus,
  GitCommit,
  GitBranch,
  GitDiff,
  GitConflictDetails,
  ConflictResolutionRequest,
  ResolutionResult,
  BranchDiffSummary,
  GeneratedPrContent,
  PrCreationConfig,
  PrCreationResult,
  PrReadinessResult,
};

// Re-export ConflictHunk for consumers
export type { ConflictHunk } from '../api/git';

// ============================================================================
// Store
// ============================================================================

interface GitState {
  /** Current repository path */
  repoPath: string | null;
  /** Current status */
  status: GitStatus | null;
  /** Loading flag */
  loading: boolean;
  /** Last error */
  error: string | null;

  // --- Core git operations ---

  /** Set the active repository path */
  setRepoPath: (path: string) => void;

  /** Initialize a new git repository */
  init: (path: string) => Promise<string>;

  /** Clone a remote repository */
  clone: (url: string, destination: string) => Promise<string>;

  /** Get repository status */
  getStatus: (path?: string) => Promise<GitStatus>;

  /** Stage files */
  add: (files: string[], path?: string) => Promise<string>;

  /** Create a commit */
  commit: (message: string, path?: string) => Promise<string>;

  /** Push to remote */
  push: (
    remote?: string,
    branch?: string,
    force?: boolean,
    path?: string,
  ) => Promise<string>;

  /** Pull from remote */
  pull: (remote?: string, branch?: string, path?: string) => Promise<string>;

  /** Fetch from remote */
  fetch: (remote?: string, path?: string) => Promise<string>;

  /** Get diff */
  diff: (
    filePath?: string,
    staged?: boolean,
    path?: string,
  ) => Promise<GitDiff[]>;

  /** Get commit log */
  log: (limit?: number, path?: string) => Promise<GitCommit[]>;

  // --- Branch operations ---

  /** List branches */
  listBranches: (path?: string) => Promise<GitBranch[]>;

  /** Create a new branch */
  createBranch: (branchName: string, path?: string) => Promise<string>;

  /** Switch to a branch */
  checkout: (branchName: string, path?: string) => Promise<string>;

  /** Create and switch to a new branch */
  checkoutNewBranch: (branchName: string, path?: string) => Promise<string>;

  /** Delete a branch */
  deleteBranch: (
    branchName: string,
    force?: boolean,
    path?: string,
  ) => Promise<string>;

  /** Merge a branch */
  merge: (branchName: string, path?: string) => Promise<string>;

  /** Get current branch name */
  currentBranch: (path?: string) => Promise<string>;

  /** Get default branch name */
  defaultBranch: (path?: string) => Promise<string>;

  // --- Stash operations ---

  /** Stash changes */
  stash: (message?: string, path?: string) => Promise<string>;

  /** Pop stash */
  stashPop: (path?: string) => Promise<string>;

  // --- Reset ---

  /** Reset to a commit */
  reset: (
    commitHash: string,
    mode: 'soft' | 'mixed' | 'hard',
    path?: string,
    files?: string[],
  ) => Promise<string>;

  /** Discard working-tree changes for specific files */
  checkoutFiles: (files: string[], path?: string) => Promise<string>;

  // --- Remote operations ---

  /** List remotes */
  listRemotes: (path?: string) => Promise<[string, string][]>;

  /** Add a remote */
  addRemote: (name: string, url: string, path?: string) => Promise<string>;

  // --- Conflict resolution ---

  /** Check if repo has conflicts */
  hasConflicts: (path?: string) => Promise<boolean>;

  /** List conflicted files */
  listConflicts: (path?: string) => Promise<string[]>;

  /** Get conflict details for a file */
  getConflictDetails: (
    filePath: string,
    path?: string,
  ) => Promise<GitConflictDetails>;

  /** Resolve conflicts in a file */
  resolveConflict: (
    filePath: string,
    resolutions: ConflictResolutionRequest[],
    path?: string,
  ) => Promise<ResolutionResult>;

  /** Mark a file as resolved */
  markResolved: (filePath: string, path?: string) => Promise<string>;

  /** Get AI conflict suggestion prompt */
  getConflictSuggestionPrompt: (
    filePath: string,
    hunkIndex: number,
    path?: string,
  ) => Promise<string>;

  /** Abort an in-progress merge */
  abortMerge: (path?: string) => Promise<string>;

  /** Complete a merge after resolving conflicts */
  completeMerge: (message?: string, path?: string) => Promise<string>;

  // --- PR operations ---

  /** Get branch diff summary for PR preview */
  getBranchDiffSummary: (
    baseBranch: string,
    headBranch: string,
    path?: string,
  ) => Promise<BranchDiffSummary>;

  /** Generate PR description using AI */
  generatePrDescription: (
    baseBranch: string,
    headBranch: string,
    path?: string,
  ) => Promise<GeneratedPrContent>;

  /** Create a pull request */
  createPr: (
    config: PrCreationConfig,
    path?: string,
  ) => Promise<PrCreationResult>;

  /** Check if branch is ready for PR */
  checkPrReadiness: (
    baseBranch: string,
    headBranch: string,
    path?: string,
  ) => Promise<PrReadinessResult>;

  /** Reset store state */
  resetStore: () => void;
}

export const useGitStore = create<GitState>()(
  devtools(
    subscribeWithSelector((set, get) => {
      /** Resolve repo path: explicit arg > store repoPath */
      const resolvePath = (path?: string): string => {
        const resolved = path ?? get().repoPath;
        if (!resolved) {
          throw new Error('No repository path set. Call setRepoPath() first.');
        }
        return resolved;
      };

      /** Wrap an async operation with loading/error handling */
      const withLoading = async <T>(
        actionName: string,
        fn: () => Promise<T>,
      ): Promise<T> => {
        set({ loading: true, error: null }, undefined, `git/${actionName}`);
        try {
          const result = await fn();
          set({ loading: false }, undefined, `git/${actionName}/done`);
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          set(
            { loading: false, error: message },
            undefined,
            `git/${actionName}/error`,
          );
          throw err;
        }
      };

      return {
        repoPath: null,
        status: null,
        loading: false,
        error: null,

        // --- Core ---

        setRepoPath: (path: string) => {
          set({ repoPath: path, error: null }, undefined, 'git/setRepoPath');
        },

        init: (path: string) =>
          withLoading('init', () => gitInit(path)),

        clone: (url: string, destination: string) =>
          withLoading('clone', () => gitClone(url, destination)),

        getStatus: (path?: string) =>
          withLoading('getStatus', async () => {
            const resolved = resolvePath(path);
            const status = await gitStatus(resolved);
            set({ status }, undefined, 'git/getStatus/set');
            return status;
          }),

        add: (files: string[], path?: string) =>
          withLoading('add', () => gitAdd(resolvePath(path), files)),

        commit: (message: string, path?: string) =>
          withLoading('commit', () => gitCommit(resolvePath(path), message)),

        push: (
          remote?: string,
          branch?: string,
          force?: boolean,
          path?: string,
        ) =>
          withLoading('push', () =>
            gitPush(resolvePath(path), remote, branch, force),
          ),

        pull: (remote?: string, branch?: string, path?: string) =>
          withLoading('pull', () =>
            gitPull(resolvePath(path), remote, branch),
          ),

        fetch: (remote?: string, path?: string) =>
          withLoading('fetch', () => gitFetch(resolvePath(path), remote)),

        diff: (filePath?: string, staged?: boolean, path?: string) =>
          withLoading('diff', () =>
            gitDiff(resolvePath(path), filePath, staged),
          ),

        log: (limit?: number, path?: string) =>
          withLoading('log', () => gitLog(resolvePath(path), limit)),

        // --- Branches ---

        listBranches: (path?: string) =>
          withLoading('listBranches', () =>
            gitListBranches(resolvePath(path)),
          ),

        createBranch: (branchName: string, path?: string) =>
          withLoading('createBranch', () =>
            gitCreateBranch(resolvePath(path), branchName),
          ),

        checkout: (branchName: string, path?: string) =>
          withLoading('checkout', () =>
            gitCheckout(resolvePath(path), branchName),
          ),

        checkoutNewBranch: (branchName: string, path?: string) =>
          withLoading('checkoutNewBranch', () =>
            gitCheckoutNewBranch(resolvePath(path), branchName),
          ),

        deleteBranch: (branchName: string, force?: boolean, path?: string) =>
          withLoading('deleteBranch', () =>
            gitDeleteBranch(resolvePath(path), branchName, force),
          ),

        merge: (branchName: string, path?: string) =>
          withLoading('merge', () =>
            gitMerge(resolvePath(path), branchName),
          ),

        currentBranch: (path?: string) =>
          withLoading('currentBranch', () =>
            gitCurrentBranch(resolvePath(path)),
          ),

        defaultBranch: (path?: string) =>
          withLoading('defaultBranch', () =>
            gitDefaultBranch(resolvePath(path)),
          ),

        // --- Stash ---

        stash: (message?: string, path?: string) =>
          withLoading('stash', () =>
            gitStash(resolvePath(path), message),
          ),

        stashPop: (path?: string) =>
          withLoading('stashPop', () => gitStashPop(resolvePath(path))),

        // --- Reset ---

        reset: (
          commitHash: string,
          mode: 'soft' | 'mixed' | 'hard',
          path?: string,
          files?: string[],
        ) =>
          withLoading('reset', () =>
            gitReset(resolvePath(path), commitHash, mode, files),
          ),

        checkoutFiles: (files: string[], path?: string) =>
          withLoading('checkoutFiles', () =>
            gitCheckoutFiles(resolvePath(path), files),
          ),

        // --- Remotes ---

        listRemotes: (path?: string) =>
          withLoading('listRemotes', () =>
            gitListRemotes(resolvePath(path)),
          ),

        addRemote: (name: string, url: string, path?: string) =>
          withLoading('addRemote', () =>
            gitAddRemote(resolvePath(path), name, url),
          ),

        // --- Conflicts ---

        hasConflicts: (path?: string) =>
          withLoading('hasConflicts', () =>
            gitHasConflicts(resolvePath(path)),
          ),

        listConflicts: (path?: string) =>
          withLoading('listConflicts', () =>
            gitListConflicts(resolvePath(path)),
          ),

        getConflictDetails: (filePath: string, path?: string) =>
          withLoading('getConflictDetails', () =>
            gitGetConflictDetails(resolvePath(path), filePath),
          ),

        resolveConflict: (
          filePath: string,
          resolutions: ConflictResolutionRequest[],
          path?: string,
        ) =>
          withLoading('resolveConflict', () =>
            gitResolveConflict(resolvePath(path), filePath, resolutions),
          ),

        markResolved: (filePath: string, path?: string) =>
          withLoading('markResolved', () =>
            gitMarkResolved(resolvePath(path), filePath),
          ),

        getConflictSuggestionPrompt: (
          filePath: string,
          hunkIndex: number,
          path?: string,
        ) =>
          withLoading('getConflictSuggestionPrompt', () =>
            gitGetConflictSuggestionPrompt(resolvePath(path), filePath, hunkIndex),
          ),

        abortMerge: (path?: string) =>
          withLoading('abortMerge', () =>
            gitAbortMerge(resolvePath(path)),
          ),

        completeMerge: (message?: string, path?: string) =>
          withLoading('completeMerge', () =>
            gitCompleteMerge(resolvePath(path), message),
          ),

        // --- PR operations ---

        getBranchDiffSummary: (
          baseBranch: string,
          headBranch: string,
          path?: string,
        ) =>
          withLoading('getBranchDiffSummary', () =>
            gitGetBranchDiffSummary(resolvePath(path), baseBranch, headBranch),
          ),

        generatePrDescription: (
          baseBranch: string,
          headBranch: string,
          path?: string,
        ) =>
          withLoading('generatePrDescription', () =>
            gitGeneratePrDescription(resolvePath(path), baseBranch, headBranch),
          ),

        createPr: (config: PrCreationConfig, path?: string) =>
          withLoading('createPr', () =>
            gitCreatePr(resolvePath(path), config),
          ),

        checkPrReadiness: (
          baseBranch: string,
          headBranch: string,
          path?: string,
        ) =>
          withLoading('checkPrReadiness', () =>
            gitCheckPrReadiness(resolvePath(path), baseBranch, headBranch),
          ),

        // --- Reset store ---

        resetStore: () => {
          set(
            {
              repoPath: null,
              status: null,
              loading: false,
              error: null,
            },
            undefined,
            'git/resetStore',
          );
        },
      };
    }),
    { name: 'GitStore', enabled: import.meta.env.DEV },
  ),
);

// ============================================================================
// Selectors
// ============================================================================

export const selectGitStatus = (state: GitState) => state.status;
export const selectGitLoading = (state: GitState) => state.loading;
export const selectGitError = (state: GitState) => state.error;
export const selectGitRepoPath = (state: GitState) => state.repoPath;
export const selectGitBranch = (state: GitState) => state.status?.branch ?? null;
export const selectGitHasConflicts = (state: GitState) =>
  (state.status?.conflicts?.length ?? 0) > 0;
export const selectGitHasChanges = (state: GitState) =>
  (state.status?.staged?.length ?? 0) > 0 ||
  (state.status?.unstaged?.length ?? 0) > 0 ||
  (state.status?.untracked?.length ?? 0) > 0;
