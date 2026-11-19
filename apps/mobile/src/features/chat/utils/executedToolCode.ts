import { CHAT_CODE_RUN_TOOL_NAME } from '@agiworkforce/cloud-contracts';

const CODE_EXECUTION_TOOLS: ReadonlySet<string> = new Set([
  'code_execution',
  CHAT_CODE_RUN_TOOL_NAME,
  'code_interpreter',
]);

const DEFAULT_CODE_LANGUAGE = 'python';

export interface ExecutedToolCode {
  language: string;
  code: string;
}

export function parseToolArguments(input: unknown): Record<string, unknown> | undefined {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input !== 'string' || input.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function executedToolCode(name: string, input: unknown): ExecutedToolCode | undefined {
  if (!CODE_EXECUTION_TOOLS.has(name)) return undefined;
  const parameters = parseToolArguments(input);
  const code = parameters?.['code'];
  if (typeof code !== 'string' || code.trim() === '') return undefined;
  const language = parameters?.['language'];
  return {
    language: typeof language === 'string' && language.trim() ? language : DEFAULT_CODE_LANGUAGE,
    code,
  };
}

export function canRunCodeAgain(name: string): boolean {
  return name === CHAT_CODE_RUN_TOOL_NAME;
}
