import type { NotebookCellOutput } from '@agiworkforce/types';

export interface ExecutionResult {
  ok: boolean;
  output: string;
  error?: string;
  pngResults?: string[];
  outputs?: NotebookCellOutput[];
  /** The call never ran because the capability was not available for the turn. */
  unavailable?: boolean;
}

export interface SandboxFileEntry {
  path: string;
  name: string;
  isDir: boolean;
  byteSize: number;
}

export interface CommandExecutionResult extends ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface E2BGitExecutor {
  clone(input: {
    url: string;
    path: string;
    branch?: string;
    depth?: number;
    username?: string;
    password?: string;
    timeoutMs?: number;
  }): Promise<CommandExecutionResult>;
  /** Creates the branch and checks it out, so later commits land on it. */
  createBranch(input: { path: string; branch: string }): Promise<CommandExecutionResult>;
  /** Stages `files` when given, otherwise every change when `all` is set. */
  add(input: { path: string; all?: boolean; files?: string[] }): Promise<CommandExecutionResult>;
  /** Returns tracked files to their last committed contents, in the index and on disk. */
  restore(input: { path: string; files: string[] }): Promise<CommandExecutionResult>;
  /** Deletes files git tracks only in the index, such as a new file that was staged. */
  remove(input: { path: string; files: string[] }): Promise<CommandExecutionResult>;
  /** Deletes untracked files. */
  clean(input: { path: string; files: string[] }): Promise<CommandExecutionResult>;
  /** The branch currently checked out, which after a clone is what it cloned. */
  currentBranch(input: { path: string }): Promise<CommandExecutionResult>;
  /** Porcelain status of the working tree, including untracked files. */
  status(input: { path: string }): Promise<CommandExecutionResult>;
  /**
   * Unified diff of the working tree against `baseRef`, or against the last
   * commit when no base is given. Reads only: it stages nothing and commits
   * nothing, so untracked files are absent here and appear in `status`.
   */
  diff(input: { path: string; baseRef?: string }): Promise<CommandExecutionResult>;
  commit(input: {
    path: string;
    message: string;
    authorName?: string;
    authorEmail?: string;
  }): Promise<CommandExecutionResult>;
  push(input: {
    path: string;
    remote?: string;
    branch?: string;
    username?: string;
    password?: string;
    timeoutMs?: number;
  }): Promise<CommandExecutionResult>;
}

export interface E2BExecutor {
  runCode(input: { language: string; code: string }): Promise<ExecutionResult>;
  writeFile(input: {
    path: string;
    content: string;
    encoding?: 'utf8' | 'base64';
  }): Promise<ExecutionResult>;
  createFolder(input: { path: string }): Promise<ExecutionResult>;
  runCommand?(input: {
    command: string;
    cwd?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<CommandExecutionResult>;
  git?: E2BGitExecutor;
  listFiles?(path: string): Promise<SandboxFileEntry[] | null>;
  readFileBytes?(path: string): Promise<Uint8Array | null>;
  pause?(): Promise<void>;
  dispose(): Promise<void>;
}

export const MAX_EXECUTION_OUTPUT_BYTES = 100_000;
