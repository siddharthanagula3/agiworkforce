import {
  normalizeInlineToolData,
  normalizeToolNameForUi,
  toolNameToArtifactType,
  toolNameToTitle,
} from './chatToolUtils';

export interface ThinkingContentPlan {
  clear: boolean;
  append?: string;
}

export function buildThinkingContentPlan(
  eventType: 'start' | 'delta' | 'complete',
  content: string,
): ThinkingContentPlan {
  if (eventType === 'start') {
    return { clear: true };
  }

  if (eventType === 'delta') {
    return content ? { clear: false, append: content } : { clear: false };
  }

  return content ? { clear: true, append: content } : { clear: true };
}

export function parseToolArguments(argumentsText: string): Record<string, unknown> {
  try {
    return argumentsText ? (JSON.parse(argumentsText) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function buildRunningToolArtifactPatch(
  toolName: string,
  argumentsText: string,
): Record<string, unknown> {
  const normalizedToolName = normalizeToolNameForUi(toolName);
  const parsedArguments = parseToolArguments(argumentsText);

  return {
    toolName: normalizedToolName,
    type: toolNameToArtifactType(normalizedToolName),
    title: toolNameToTitle(normalizedToolName),
    status: 'running',
    content: '',
    ...(parsedArguments['prompt'] ? { prompt: parsedArguments['prompt'] } : {}),
    ...(parsedArguments['output_path'] ? { filePath: parsedArguments['output_path'] } : {}),
    ...(parsedArguments['file_path'] ? { filePath: parsedArguments['file_path'] } : {}),
  };
}

export function parseToolResultData(
  result: string,
  resultData?: Record<string, unknown>,
): Record<string, unknown> {
  if (resultData) {
    return resultData;
  }

  try {
    const parsed = JSON.parse(result);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to raw result
  }

  return result ? { raw_result: result } : {};
}

export function buildTerminalToolArtifactPatch(input: {
  toolName: string;
  success: boolean;
  result: string;
  resultData?: Record<string, unknown>;
}): Record<string, unknown> {
  const normalizedToolName = normalizeToolNameForUi(input.toolName);
  const parsedData = parseToolResultData(input.result, input.resultData);
  const normalizedData = normalizeInlineToolData(normalizedToolName, parsedData);

  return {
    toolName: normalizedToolName,
    type: toolNameToArtifactType(normalizedToolName),
    title: toolNameToTitle(normalizedToolName),
    status: input.success ? 'completed' : 'failed',
    success: input.success,
    error: input.success ? undefined : input.result,
    content: input.result || '',
    ...normalizedData,
  };
}
