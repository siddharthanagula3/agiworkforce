import type { CodeExecutionResult } from '@agiworkforce/unified-chat/code-execution-result';

const CODE_EXECUTION_RESULT_ERROR = 'code_execution_tool_result_error';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function codeExecutionResultFromDelta(block: unknown): CodeExecutionResult | undefined {
  if (!isRecord(block)) return undefined;
  const result = block['content'];
  if (!isRecord(result) || result['type'] === CODE_EXECUTION_RESULT_ERROR) return undefined;
  return {
    stdout: typeof result['stdout'] === 'string' ? result['stdout'] : '',
    stderr: typeof result['stderr'] === 'string' ? result['stderr'] : '',
    returnCode: typeof result['return_code'] === 'number' ? result['return_code'] : 0,
  };
}
