/**
 * E2B universal execution tools, the model-agnostic tool schemas + the router that
 * runs them through the E2B sandbox. These tools REPLACE provider-native code
 * execution: any model (GPT/Claude/Gemini/…) that wants to run code or touch the
 * filesystem calls these, and the agentic loop executes them in the SAME E2B sandbox.
 *
 * Pure logic (no `server-only`), unit tested against a mocked {@link E2BExecutor}.
 */
import type { E2BExecutor, ExecutionResult } from './types';
import { codeExecutionUnavailableMessage, type E2BUnavailableCause } from './unavailability';
import { MAX_EXECUTION_OUTPUT_BYTES } from './types';

export const EXECUTE_CODE_TOOL = 'execute_code';
export const WRITE_FILE_TOOL = 'write_file';
export const CREATE_FOLDER_TOOL = 'create_folder';
export const READ_FILE_TOOL = 'read_file';
export const LIST_FILES_TOOL = 'list_files';
export const EDIT_FILE_TOOL = 'edit_file';

const EXECUTION_TOOLS = new Set<string>([
  EXECUTE_CODE_TOOL,
  WRITE_FILE_TOOL,
  CREATE_FOLDER_TOOL,
  READ_FILE_TOOL,
  LIST_FILES_TOOL,
  EDIT_FILE_TOOL,
]);

const MAX_READ_FILE_BYTES = 200_000;

const PATH_TOOLS = new Set<string>([
  WRITE_FILE_TOOL,
  CREATE_FOLDER_TOOL,
  READ_FILE_TOOL,
  LIST_FILES_TOOL,
  EDIT_FILE_TOOL,
]);

/**
 * Confinement runs here rather than in each caller: every path-taking execution
 * tool reaches the sandbox through routeExecutionTool, and a caller that forgot
 * to normalize was how edit_file, read_file and list_files ended up able to
 * address anything outside the workspace.
 */
export function confineWorkspacePath(raw: string, workspaceRoot?: string): string | null {
  const path = raw.trim();
  if (!path || path.includes('\0')) return null;
  if (path.startsWith('/') || path.startsWith('~')) return null;
  const segments = path.split('/');
  if (segments.some((segment) => segment === '..')) return null;
  if (!workspaceRoot) return path;
  return `${workspaceRoot.replace(/\/+$/, '')}/${path}`;
}

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
    {
      type: 'function',
      function: {
        name: LIST_FILES_TOOL,
        description:
          'List the files already present in the sandbox workspace. Call this before ' +
          'assuming a file exists or inventing a path.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Workspace-relative folder to list. Defaults to the workspace root.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: READ_FILE_TOOL,
        description:
          'Read a UTF-8 text file from the sandbox workspace. Read a file before editing ' +
          'it so the replacement matches what is actually on disk.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path.' },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: EDIT_FILE_TOOL,
        description:
          'Replace an exact substring in a sandbox workspace file, leaving the rest ' +
          'untouched. Prefer this over rewriting a whole file. The edit fails if ' +
          'old_text is absent or appears more than once, so include enough surrounding ' +
          'context to make it unique.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path.' },
            old_text: { type: 'string', description: 'Exact text to replace.' },
            new_text: { type: 'string', description: 'Replacement text.' },
          },
          required: ['path', 'old_text', 'new_text'],
        },
      },
    },
  ];
}

function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split('\n').length;
}

async function readWorkspaceText(
  executor: E2BExecutor,
  path: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!executor.readFileBytes) {
    return { ok: false, error: 'Reading files is unavailable in this sandbox.' };
  }
  const bytes = await executor.readFileBytes(path);
  if (!bytes) return { ok: false, error: `No such file in the workspace: ${path}` };
  if (bytes.byteLength > MAX_READ_FILE_BYTES) {
    return {
      ok: false,
      error: `${path} is ${bytes.byteLength} bytes, over the ${MAX_READ_FILE_BYTES}-byte read limit.`,
    };
  }
  return { ok: true, text: Buffer.from(bytes).toString('utf8') };
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
 * output and the error string, an executor error can carry model-influenced content
 * (e.g. a runtime error `value`), so it must be bounded too. Exported so other tool
 * result paths (generic MCP tool output in tool-loop.ts) can share the same bound.
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
  rawArgs: Record<string, unknown>,
  workspaceRoot?: string,
  unavailableCause?: E2BUnavailableCause | null,
): Promise<ExecutionResult> {
  if (!executor) {
    return {
      ok: false,
      output: '',
      error: codeExecutionUnavailableMessage(unavailableCause ?? null),
      unavailable: true,
    };
  }
  if (!isExecutionTool(name)) {
    return { ok: false, output: '', error: `Not an execution tool: ${name}` };
  }
  let args = rawArgs;
  if (PATH_TOOLS.has(name)) {
    const raw = typeof rawArgs['path'] === 'string' ? rawArgs['path'] : '';
    const requested = raw || (name === LIST_FILES_TOOL ? '.' : '');
    const confined = confineWorkspacePath(requested, workspaceRoot);
    if (!confined) {
      return {
        ok: false,
        output: '',
        error: `Refused "${raw}": paths must be workspace-relative and may not traverse upward.`,
      };
    }
    args = { ...rawArgs, path: confined };
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
      case LIST_FILES_TOOL: {
        if (!executor.listFiles) {
          return { ok: false, output: '', error: 'Listing files is unavailable in this sandbox.' };
        }
        const dir = typeof args['path'] === 'string' ? args['path'] : '.';
        const entries = await executor.listFiles(dir);
        if (!entries) {
          return { ok: false, output: '', error: `No such folder in the workspace: ${dir}` };
        }
        result = {
          ok: true,
          output: entries.length
            ? entries.map((e) => `${e.path} (${e.byteSize} bytes)`).join('\n')
            : `${dir} is empty.`,
        };
        break;
      }
      case READ_FILE_TOOL: {
        const path = typeof args['path'] === 'string' ? args['path'] : '';
        const read = await readWorkspaceText(executor, path);
        if (!read.ok) return { ok: false, output: '', error: read.error };
        result = { ok: true, output: read.text };
        break;
      }
      case EDIT_FILE_TOOL: {
        const path = typeof args['path'] === 'string' ? args['path'] : '';
        const oldText = typeof args['old_text'] === 'string' ? args['old_text'] : '';
        const newText = typeof args['new_text'] === 'string' ? args['new_text'] : '';
        if (!oldText) {
          return { ok: false, output: '', error: 'old_text must not be empty.' };
        }
        const read = await readWorkspaceText(executor, path);
        if (!read.ok) return { ok: false, output: '', error: read.error };
        const first = read.text.indexOf(oldText);
        if (first === -1) {
          return { ok: false, output: '', error: `old_text was not found in ${path}.` };
        }
        if (read.text.indexOf(oldText, first + oldText.length) !== -1) {
          return {
            ok: false,
            output: '',
            error: `old_text appears more than once in ${path}. Include more surrounding context so it matches exactly one place.`,
          };
        }
        const updated =
          read.text.slice(0, first) + newText + read.text.slice(first + oldText.length);
        const write = await executor.writeFile({ path, content: updated });
        if (!write.ok) return write;
        result = {
          ok: true,
          output: `Edited ${path}  +${countLines(newText)} -${countLines(oldText)}`,
        };
        break;
      }
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
