import { messageKindForAgentEvent } from '@agiworkforce/types';
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
    // A tool that takes no input streams empty arguments; that is an empty object.
    const argumentsText = args.trim() === '' ? '{}' : args;
    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(argumentsText);
    } catch {
      return null;
    }
    if (!parsedArgs || typeof parsedArgs !== 'object' || Array.isArray(parsedArgs)) return null;
    parsed.push({
      id: ids[index] as string,
      type: 'function',
      function: { name, arguments: argumentsText },
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

/**
 * A durable run replays canonical events only. The gateway journals a caller
 * tool handoff as tool-use start, delta and end events per call, closed by a
 * stop with reason tool-use, so a reader that reattaches rebuilds the same
 * snapshot the live stream carried. Calls this turn did not offer are ignored.
 */
export function createToolUseJournal(tools: readonly ToolDefinition[]) {
  const pending = new Map<string, { name: string; args: string; ended: boolean }>();
  return {
    observe(event: { type: string }): ToolCall[] | null {
      const record = event as Record<string, unknown>;
      const toolUseId = record['toolUseId'];
      if (messageKindForAgentEvent(event.type) === 'tool_call') {
        if (event.type === 'tool-use-start') {
          if (typeof toolUseId !== 'string' || typeof record['name'] !== 'string') return null;
          pending.set(toolUseId, { name: record['name'], args: '', ended: false });
        } else if (event.type === 'tool-use-delta') {
          const entry = typeof toolUseId === 'string' ? pending.get(toolUseId) : undefined;
          if (entry && typeof record['deltaJson'] === 'string') entry.args += record['deltaJson'];
        } else if (event.type === 'tool-use-end') {
          const entry = typeof toolUseId === 'string' ? pending.get(toolUseId) : undefined;
          if (entry) entry.ended = true;
        }
        return null;
      }
      if (event.type !== 'stop') return null;
      const entries = [...pending.entries()].filter(
        ([, entry]) => entry.ended && tools.some((tool) => tool.function.name === entry.name),
      );
      pending.clear();
      if (record['reason'] !== 'tool-use' || entries.length === 0) return null;
      const calls = readCompleteToolCalls(
        entries.map(([id, entry], index) => ({
          index,
          id,
          type: 'function',
          function: { name: entry.name, arguments: entry.args },
        })),
        entries.map(([id]) => id),
        tools,
      );
      return calls;
    },
  };
}
