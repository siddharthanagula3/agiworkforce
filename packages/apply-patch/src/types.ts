/**
 * apply-patch types.
 *
 * Lifted from OpenClaw `src/agents/apply-patch.ts` (MIT, Peter Steinberger).
 * See THIRD_PARTY_LICENSES.md at repo root.
 *
 * Adaptation: a minimal `FSBridge` interface replaces OpenClaw's sandbox-
 * aware `SandboxFsBridge` + `boundary-file-read` + `fs-safe` stack. Callers
 * pass either the default `nodeFSBridge()` (real disk, optional workspace
 * root) or their own implementation backed by Tauri IPC, S3, etc.
 */

export interface AddFileHunk {
  kind: 'add';
  path: string;
  contents: string;
}

export interface DeleteFileHunk {
  kind: 'delete';
  path: string;
}

export interface UpdateFileChunk {
  changeContext?: string;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
}

export interface UpdateFileHunk {
  kind: 'update';
  path: string;
  movePath?: string;
  chunks: UpdateFileChunk[];
}

export type Hunk = AddFileHunk | DeleteFileHunk | UpdateFileHunk;

export interface ApplyPatchSummary {
  added: string[];
  modified: string[];
  deleted: string[];
}

export interface ApplyPatchResult {
  summary: ApplyPatchSummary;
  /** Human-readable changelog for streaming back to the model. */
  text: string;
}

export interface FSBridge {
  /** Read a file's contents as UTF-8 text. */
  readFile(path: string): Promise<string>;
  /** Write a file (creating parent directories as needed). */
  writeFile(path: string, contents: string): Promise<void>;
  /** Remove a file. Idempotent: should not throw if the file doesn't exist. */
  remove(path: string): Promise<void>;
  /** Create a directory and all missing parents. Idempotent. */
  mkdirp(path: string): Promise<void>;
  /** Test if a file exists. */
  exists(path: string): Promise<boolean>;
}

export interface ApplyPatchOptions {
  /**
   * Working directory for relative paths. Defaults to `process.cwd()`. The
   * default Node bridge resolves all hunk paths against this when relative.
   */
  cwd?: string;
  /**
   * Bridge for filesystem operations. Defaults to `nodeFSBridge({ cwd })`.
   * Pass a custom bridge to apply patches inside a sandbox, against a
   * remote machine, or to S3.
   */
  fs?: FSBridge;
  /**
   * Restrict patch paths to the workspace root (cwd). Default: true. Set
   * false to opt out — useful when the FS bridge already enforces its own
   * boundary.
   */
  workspaceOnly?: boolean;
  /** Optional cancellation. */
  signal?: AbortSignal;
}
