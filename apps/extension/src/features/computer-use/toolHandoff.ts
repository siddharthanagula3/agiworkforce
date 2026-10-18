import type { ToolDefinition } from './browserToolDefinitions';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export function readCompleteToolCalls(
  calls: unknown,
  ids: unknown,
  tools: readonly ToolDefinition[],
): ToolCall[] | null {
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(ids).size !== ids.length ||
    !Array.isArray(calls) ||
    calls.length !== ids.length
  )
    return null;
  const parsed: ToolCall[] = [];
  for (const [index, raw] of calls.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const call = raw as Record<string, unknown>;
    const fn = call['function'];
    if (
      call['index'] !== index ||
      call['type'] !== 'function' ||
      call['id'] !== ids[index] ||
      !fn ||
      typeof fn !== 'object' ||
      Array.isArray(fn)
    )
      return null;
    const { name, arguments: args } = fn as Record<string, unknown>;
    if (
      typeof name !== 'string' ||
      typeof args !== 'string' ||
      !tools.some((tool) => tool.function.name === name)
    )
      return null;
    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(args);
    } catch {
      return null;
    }
    if (!parsedArgs || typeof parsedArgs !== 'object' || Array.isArray(parsedArgs)) return null;
    parsed.push({
      id: ids[index] as string,
      type: 'function',
      function: { name, arguments: args },
    });
  }
  return parsed;
}

/**
 * The gateway hands a caller-declared tool back in one complete snapshot: the
 * marker names every call id and the delta carries each call whole. Anything
 * else is refused, so a partial or unknown call never reaches an executor.
 */
export function readToolHandoff(
  marker: unknown,
  calls: unknown,
  finishReason: unknown,
  tools: readonly ToolDefinition[],
): ToolCall[] | null {
  if (
    !marker ||
    typeof marker !== 'object' ||
    Array.isArray(marker) ||
    finishReason !== 'tool_calls'
  ) {
    return null;
  }
  return readCompleteToolCalls(calls, (marker as Record<string, unknown>)['tool_call_ids'], tools);
}
