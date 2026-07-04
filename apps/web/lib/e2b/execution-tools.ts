/**
 * E2B universal execution tools — the model-agnostic tool schemas + the router that
 * runs them through the E2B sandbox. These tools REPLACE provider-native code
 * execution: any model (GPT/Claude/Gemini/…) that wants to run code or touch the
 * filesystem calls these, and the agentic loop executes them in the SAME E2B sandbox.
 *
 * Pure logic (no `server-only`) — unit tested against a mocked {@link E2BExecutor}.
 */
import type { E2BExecutor, ExecutionResult } from './types';
import { MAX_EXECUTION_OUTPUT_BYTES } from './types';

export const EXECUTE_CODE_TOOL = 'execute_code';
export const WRITE_FILE_TOOL = 'write_file';
export const CREATE_FOLDER_TOOL = 'create_folder';

const EXECUTION_TOOLS = new Set<string>([EXECUTE_CODE_TOOL, WRITE_FILE_TOOL, CREATE_FOLDER_TOOL]);

/** True if `name` is one of the universal E2B execution tools. */
export function isExecutionTool(name: string): boolean {
  return EXECUTION_TOOLS.has(name);
}

/**
 * Function-calling tool definitions offered to the model ONLY when E2B execution is
 * enabled (see ./gate.ts). When disabled, these are never offered and the existing
 * provider-native code tools remain (today's behavior) — see the design doc.
 */
export function e2bExecutionToolDefs(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return [
    {
      type: 'function',
      function: {
        name: EXECUTE_CODE_TOOL,
        description:
          'Execute code in a secure sandbox and return its stdout/stderr. Use for ' +
          'computation, data processing, and running scripts. Runs in an isolated E2B ' +
          'environment with resource limits.',
        parameters: {
          type: 'object',
          properties: {
            language: { type: 'string', description: 'Language, e.g. "python" or "node".' },
            code: { type: 'string', description: 'The source code to execute.' },
          },
          required: ['language', 'code'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: WRITE_FILE_TOOL,
        description: 'Write a file in the sandbox workspace.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path.' },
            content: { type: 'string', description: 'File contents.' },
          },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: CREATE_FOLDER_TOOL,
        description: 'Create a folder in the sandbox workspace.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative folder path.' },
          },
          required: ['path'],
        },
      },
    },
  ];
}

/**
 * Whether the given provider routes to E2B (platform-executed sandbox) under the §8
 * cost-optimized cut-over plan, when `e2bCutoverEnabled()` is on.
 *
 * - FREE-NATIVE tier (Anthropic + Google): always use their own provider-native sandboxes
 *   (free compute, no E2B credit spend). NOT routed to E2B.
 * - E2B-CREDIT tier (OpenAI + everyone else — DeepSeek, Kimi, GLM, MiniMax, etc.):
 *   routed to E2B (avoids OpenAI's per-session interpreter fees; provides a sandbox for
 *   providers that have no native code execution at all).
 *
 * Called only when `e2bCutoverEnabled()` is true. Has no side-effects.
 */
export function providerRoutesToE2B(provider: string): boolean {
  const p = provider.toLowerCase();
  return p !== 'anthropic' && p !== 'google';
}

/** Providers that expose a NATIVE (provider-executed) code interpreter today. */
const NATIVE_CODE_EXECUTION_PROVIDERS = new Set(['anthropic', 'google', 'openai']);

/**
 * Code-execution router. Returns the tools to attach when `code_execution` is
 * requested. Providers with a NATIVE (provider-executed) interpreter use it; providers
 * without one fail-closed (no tool).
 *
 * This function is the FALLBACK path used when the E2B cut-over does not apply to the
 * current request (see request-processor.ts's `code_execution` branch): free-native
 * providers (Anthropic/Google) always use it, and everyone else falls back to it when
 * `AGI_E2B_EXECUTION` is off, the request isn't streaming, or it's a free-trial request.
 * The reachable, approval-gated E2B execution loop (route.ts `hasE2BTools` → 'auto' mode
 * → `runToolLoop` → `routeExecutionTool`) is the path taken when the cut-over conditions
 * in request-processor.ts are met — see that file and the design doc for the full gating.
 *
 * Effect: when the cut-over doesn't apply, this is byte-for-byte the pre-P3 behavior.
 */
export function resolveCodeExecutionTools(provider: string): unknown[] {
  const p = provider.toLowerCase();
  if (p === 'anthropic') {
    return [
      { type: 'code_execution_20260120', name: 'code_execution', allowed_callers: ['direct'] },
    ];
  }
  if (p === 'google') {
    return [{ code_execution: {} }];
  }
  if (p === 'openai') {
    return [{ type: 'code_interpreter' }];
  }
  // No native interpreter and no reachable E2B execution loop → fail-closed.
  return [];
}

/**
 * Whether a model can run code at all today: only providers with a native interpreter
 * (anthropic/google/openai), since the E2B execution path is not reachable in prod.
 * Surfaces use this to gray out the code-execution affordance for no-native providers.
 */
export function modelSupportsCodeExecution(provider: string): boolean {
  return NATIVE_CODE_EXECUTION_PROVIDERS.has(provider.toLowerCase());
}

/**
 * Cap a string returned to the model (memory/context guard). Used for BOTH the success
 * output and the error string — an executor error can carry model-influenced content
 * (e.g. a runtime error `value`), so it must be bounded too. Exported so other tool
 * result paths (generic MCP tool output in tool-loop.ts) can share the same bound —
 * see design doc §4.3 (MCP tool output is unbounded, a memory-exhaustion risk).
 */
export function capOutput(output: string): string {
  if (Buffer.byteLength(output, 'utf8') <= MAX_EXECUTION_OUTPUT_BYTES) return output;
  // Slice by bytes, not chars, to honor the byte cap with multibyte content.
  const buf = Buffer.from(output, 'utf8').subarray(0, MAX_EXECUTION_OUTPUT_BYTES);
  return `${buf.toString('utf8')}\n[output truncated at ${MAX_EXECUTION_OUTPUT_BYTES} bytes]`;
}

/**
 * Route a universal execution tool call to the E2B executor.
 *
 * FAIL-CLOSED (the load-bearing rule): if the executor is unavailable, return an
 * EXPLICIT error result to the model — never a silent no-op, and NEVER a fallback to
 * provider-native execution (that would silently re-introduce provider-hosted
 * execution, which the unified architecture bans). Output is always capped.
 */
export async function routeExecutionTool(
  executor: E2BExecutor | null,
  name: string,
  args: Record<string, unknown>,
): Promise<ExecutionResult> {
  if (!executor) {
    return {
      ok: false,
      output: '',
      error: 'Execution environment unavailable (E2B is not configured for this request).',
    };
  }
  if (!isExecutionTool(name)) {
    return { ok: false, output: '', error: `Not an execution tool: ${name}` };
  }
  try {
    let result: ExecutionResult;
    switch (name) {
      case EXECUTE_CODE_TOOL:
        result = await executor.runCode({
          language: typeof args['language'] === 'string' ? args['language'] : 'python',
          code: typeof args['code'] === 'string' ? args['code'] : '',
        });
        break;
      case WRITE_FILE_TOOL:
        result = await executor.writeFile({
          path: typeof args['path'] === 'string' ? args['path'] : '',
          content: typeof args['content'] === 'string' ? args['content'] : '',
        });
        break;
      case CREATE_FOLDER_TOOL:
        result = await executor.createFolder({
          path: typeof args['path'] === 'string' ? args['path'] : '',
        });
        break;
      default:
        return { ok: false, output: '', error: `Not an execution tool: ${name}` };
    }
    return {
      ...result,
      output: capOutput(result.output),
      error: result.error ? capOutput(result.error) : result.error,
    };
  } catch (err) {
    return {
      ok: false,
      output: '',
      error: capOutput(`Execution failed: ${err instanceof Error ? err.message : String(err)}`),
    };
  }
}
