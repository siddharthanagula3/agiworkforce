/**
 * E2B universal execution layer — core types.
 *
 * Unified execution architecture (P3): every model is an intelligence engine that
 * emits JSON tool calls; E2B is the single, model-agnostic secure execution backend.
 * When a model emits an execution tool call (run code, write a file, create a
 * folder), the agentic loop runs it in an E2B sandbox and feeds the result back.
 *
 * This file is pure types/logic (no `server-only`) so the routing logic is unit
 * testable against a mocked executor. See ./runtime.ts for the gated factory.
 */

/** Result of a single platform-executed (E2B) tool call. */
export interface ExecutionResult {
  /** True if the operation succeeded. */
  ok: boolean;
  /** Combined stdout/stderr, or a file-op confirmation. Capped before returning. */
  output: string;
  /** Present (human-readable) when `ok` is false. */
  error?: string;
  /**
   * Base64-encoded PNG rich results from `runCode` (matplotlib charts etc. —
   * E2B returns them as `execution.results[].png`). These are NOT files on the
   * sandbox disk, so the end-of-turn file harvest can't see them; the tool loop
   * persists them through the shared generated-file pipeline instead.
   */
  pngResults?: string[];
}

/**
 * The platform-executed sandbox backend. Implemented by E2B in production; mocked in
 * tests. Each method runs INSIDE the isolated sandbox with the session's resource
 * limits (CPU/mem/wall-clock/network) enforced by E2B at session creation.
 */
export interface SandboxFileEntry {
  /** Absolute path inside the sandbox. */
  path: string;
  name: string;
  isDir: boolean;
  byteSize: number;
}

export interface E2BExecutor {
  /** Run code in the sandbox (e.g. python/node) and return its output. */
  runCode(input: { language: string; code: string }): Promise<ExecutionResult>;
  /** Write a file inside the sandbox workspace. */
  writeFile(input: { path: string; content: string }): Promise<ExecutionResult>;
  /** Create a folder inside the sandbox workspace. */
  createFolder(input: { path: string }): Promise<ExecutionResult>;
  /**
   * List directory entries (non-recursive). Optional: used by the generated-file
   * harvest (lib/e2b/generated-files.ts); mocks that never harvest may omit it.
   * Returns null on failure (best-effort — harvesting must never break the turn).
   */
  listFiles?(path: string): Promise<SandboxFileEntry[] | null>;
  /** Read a file's raw bytes. Optional, same contract as `listFiles`. */
  readFileBytes?(path: string): Promise<Uint8Array | null>;
  /**
   * Pause a conversation-scoped sandbox at turn end using this executor's OWN
   * live sandbox handle (no Redis re-lookup), so a stale/absent session mapping
   * cannot leave the just-created sandbox running (billing) until its timeout.
   * No-op for ephemeral sessions (they kill on dispose). Optional so simple
   * mocks may omit it.
   */
  pause?(): Promise<void>;
  /** Release the sandbox session. */
  dispose(): Promise<void>;
}

/**
 * Max bytes of execution output returned to the model. Caps memory/context blow-up
 * from a runaway tool. Also reused by the generic MCP tool-result path (tool-loop.ts).
 */
export const MAX_EXECUTION_OUTPUT_BYTES = 100_000;
