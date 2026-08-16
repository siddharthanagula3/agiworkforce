
export interface ExecutionResult {
  ok: boolean;
  output: string;
  error?: string;
  pngResults?: string[];
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

export interface E2BExecutor {
  runCode(input: { language: string; code: string }): Promise<ExecutionResult>;
  writeFile(input: { path: string; content: string }): Promise<ExecutionResult>;
  createFolder(input: { path: string }): Promise<ExecutionResult>;
  runCommand?(input: {
    command: string;
    cwd?: string;
    timeoutMs?: number;
  }): Promise<CommandExecutionResult>;
  listFiles?(path: string): Promise<SandboxFileEntry[] | null>;
  readFileBytes?(path: string): Promise<Uint8Array | null>;
  pause?(): Promise<void>;
  dispose(): Promise<void>;
}

export const MAX_EXECUTION_OUTPUT_BYTES = 100_000;
