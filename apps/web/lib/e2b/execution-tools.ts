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

/** Providers that expose a NATIVE (provider-executed) code interpreter today. */
const NATIVE_CODE_EXECUTION_PROVIDERS = new Set(['anthropic', 'google', 'openai']);

/**
 * Conditional code-execution router (the founder's hybrid cut-over). Returns the tools
 * to attach when `code_execution` is requested:
 *  - E2B configured  → the UNIVERSAL E2B execution tools, for EVERY model/provider.
 *  - E2B not configured → graceful fallback to PROVIDER-NATIVE execution, ONLY for the
 *    providers that support it (today's exact behavior, byte-for-byte).
 *  - E2B not configured + provider has no native execution (deepseek/kimi/glm/minimax/…)
 *    → FAIL-CLOSED: no execution tool (the model cannot run code until E2B is keyed).
 *
 * Pure + exhaustively unit-tested so the live cut-over decision can't silently regress.
 */
export function resolveCodeExecutionTools(provider: string, e2bEnabled: boolean): unknown[] {
  if (e2bEnabled) {
    return e2bExecutionToolDefs();
  }
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
  return [];
}

/**
 * Whether a model can run code at all, given the deployment's E2B state: true if E2B is
 * configured (universal) OR the provider has native execution. Surfaces let the UI gray
 * out the code-execution affordance for models that can't (non-native, no E2B).
 */
export function modelSupportsCodeExecution(provider: string, e2bEnabled: boolean): boolean {
  return e2bEnabled || NATIVE_CODE_EXECUTION_PROVIDERS.has(provider.toLowerCase());
}

/** Cap output bytes returned to the model (memory/context guard). */
function capOutput(output: string): string {
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
    return { ...result, output: capOutput(result.output) };
  } catch (err) {
    return {
      ok: false,
      output: '',
      error: `Execution failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
