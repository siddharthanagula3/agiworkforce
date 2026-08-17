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

export function isExecutionTool(name: string): boolean {
  return EXECUTION_TOOLS.has(name);
}

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
          'computation, data processing, and running scripts. Runs in an isolated ' +
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

export function providerRoutesToE2B(provider: string): boolean {
  return provider.trim().length > 0;
}

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
    // `container` is a required parameter of the Responses API code_interpreter
    // tool; omitting it makes the whole request fail with
    // "Missing required parameter: 'tools[0].container'", so the toggle would
    // be lit and the turn would die rather than run code. 'auto' lets OpenAI
    // create or reuse the container for the response.
    return [{ type: 'code_interpreter', container: { type: 'auto' } }];
  }
  return [];
}

export interface TurnCodeExecutionInput {
  provider: string;
  stream: boolean | undefined;
  e2bEnabled: boolean;
  toolsCapable: boolean;
  codeExecutionCapable: boolean;
}

export interface TurnCodeExecution {
  tools: unknown[];
  unavailable: boolean;
}

/**
 * Resolve the execution tools for one turn the user asked to run code on, and
 * report when that request resolved to nothing. `unavailable` is what stops the
 * turn from silently dropping the capability: the caller must disclose it
 * (see `buildCapabilityPreamble`) rather than run a turn where "Run code" is lit
 * and no tool exists.
 */
export function resolveTurnCodeExecutionTools(input: TurnCodeExecutionInput): TurnCodeExecution {
  const provider = input.provider.toLowerCase();
  if (input.e2bEnabled && providerRoutesToE2B(provider) && input.stream === true) {
    const tools: unknown[] = input.toolsCapable ? e2bExecutionToolDefs() : [];
    return { tools, unavailable: tools.length === 0 };
  }
  if (!input.codeExecutionCapable) return { tools: [], unavailable: true };
  const tools = resolveCodeExecutionTools(provider);
  return { tools, unavailable: tools.length === 0 };
}

/**
 * Cap a string returned to the model (memory/context guard). Used for BOTH the success
 * output and the error string — an executor error can carry model-influenced content
 * (e.g. a runtime error `value`), so it must be bounded too. Exported so other tool
 * result paths (generic MCP tool output in tool-loop.ts) can share the same bound —
 * see design doc §4.3 (MCP tool output is unbounded, a memory-exhaustion risk).
 */
export function redactSandboxVendor(text: string): string {
  return text
    .replace(/\bE2B_API_KEY\b/gi, 'the sandbox credential')
    .replace(/\b[\w.-]*\.e2b\.(?:dev|app|io)\b/gi, 'the sandbox host')
    .replace(/\be2b[\w-]*\b/gi, 'sandbox')
    .replace(/\bsandbox(?:\s+sandbox)+\b/gi, 'sandbox');
}

export function capOutput(output: string): string {
  if (Buffer.byteLength(output, 'utf8') <= MAX_EXECUTION_OUTPUT_BYTES) return output;
  const buf = Buffer.from(output, 'utf8').subarray(0, MAX_EXECUTION_OUTPUT_BYTES);
  return `${buf.toString('utf8')}\n[output truncated at ${MAX_EXECUTION_OUTPUT_BYTES} bytes]`;
}

export async function routeExecutionTool(
  executor: E2BExecutor | null,
  name: string,
  args: Record<string, unknown>,
): Promise<ExecutionResult> {
  if (!executor) {
    return {
      ok: false,
      output: '',
      error: 'Code execution is unavailable for this request.',
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
      output: capOutput(redactSandboxVendor(result.output)),
      error: result.error ? capOutput(redactSandboxVendor(result.error)) : result.error,
    };
  } catch (err) {
    return {
      ok: false,
      output: '',
      error: capOutput(
        redactSandboxVendor(
          `Execution failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      ),
    };
  }
}
