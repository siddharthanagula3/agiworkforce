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
}

/**
 * The platform-executed sandbox backend. Implemented by E2B in production; mocked in
 * tests. Each method runs INSIDE the isolated sandbox with the session's resource
 * limits (CPU/mem/wall-clock/network) enforced by E2B at session creation.
 */
export interface E2BExecutor {
  /** Run code in the sandbox (e.g. python/node) and return its output. */
  runCode(input: { language: string; code: string }): Promise<ExecutionResult>;
  /** Write a file inside the sandbox workspace. */
  writeFile(input: { path: string; content: string }): Promise<ExecutionResult>;
  /** Create a folder inside the sandbox workspace. */
  createFolder(input: { path: string }): Promise<ExecutionResult>;
  /** Release the sandbox session. */
  dispose(): Promise<void>;
}

/**
 * Max bytes of execution output returned to the model. Caps memory/context blow-up
 * from a runaway tool. Also reused by the generic MCP tool-result path (tool-loop.ts).
 */
export const MAX_EXECUTION_OUTPUT_BYTES = 100_000;
