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
  add(input: { path: string; all?: boolean }): Promise<CommandExecutionResult>;
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
