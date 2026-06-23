/**
 * Tool-call accumulator — turns the server's tool-call SSE deltas into the
 * `ToolCall[]` that MessageBubble/InlineToolCall renders.
 *
 * The tool-call data is already on the wire; this is the parse+accumulate layer
 * the mobile chat was missing. Two tool families arrive with different keys:
 *
 *  - SERVER tools (web_search, code execution): `x_tool_status` carries the name
 *    + status; argument chunks arrive as `tool_calls[{index, function.arguments}]`
 *    with NO id; the finished result arrives as a whole content block in
 *    `x_search_results` / `x_code_result` (carries `tool_use_id`). These all
 *    funnel into ONE entry keyed by tool name (status fires first, args + result
 *    follow on the same active tool).
 *  - MCP tools: `tool_calls[{index, id, function.name}]` establishes id+name,
 *    `x_tool_status` updates status, `x_tool_result{tool_call_id, content,
 *    is_error}` is terminal. Keyed by id.
 *
 * Kept pure + framework-free so it is unit-testable against recorded SSE
 * sequences without a running stream.
 */
import type { ToolCall } from '@/types/chat';
import type { StreamDelta } from '@/services/streaming';

export interface ToolCallAccumulator {
  byKey: Map<string, ToolCall>;
  order: string[];
  indexToKey: Map<number, string>;
  nameToKey: Map<string, string>;
  idToKey: Map<string, string>;
  lastKey: string | null;
}

export function createToolCallAccumulator(): ToolCallAccumulator {
  return {
    byKey: new Map(),
    order: [],
    indexToKey: new Map(),
    nameToKey: new Map(),
    idToKey: new Map(),
    lastKey: null,
  };
}

function mapStatus(status?: string): ToolCall['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'error') return 'failed';
  return 'running'; // executing / searching / fetching / running / unknown
}

function ensure(acc: ToolCallAccumulator, key: string, defaults: Partial<ToolCall>): ToolCall {
  let t = acc.byKey.get(key);
  if (!t) {
    t = { id: key, name: defaults.name ?? '', status: defaults.status ?? 'running' };
    acc.byKey.set(key, t);
    acc.order.push(key);
  }
  return t;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Apply one stream delta's tool fields to the accumulator (mutates `acc`).
 * Returns true if anything changed (so the caller can re-render only when needed).
 */
export function accumulateToolCallDelta(acc: ToolCallAccumulator, delta: StreamDelta): boolean {
  let changed = false;

  // 1. Lifecycle status (server_tool_use / mcp_tool_use): name + status (+ args in
  //    MCP running phase). If we already know this name (MCP tool_call established
  //    it first), reuse that entry instead of forking a name-keyed duplicate.
  const st = delta.x_tool_status;
  if (st?.name) {
    let key = acc.nameToKey.get(st.name);
    if (!key) {
      key = `name:${st.name}`;
      acc.nameToKey.set(st.name, key);
    }
    const t = ensure(acc, key, { name: st.name });
    t.name = st.name;
    t.status = mapStatus(st.status);
    if (st.args !== undefined && !t.input) t.input = safeStringify(st.args);
    acc.lastKey = key;
    changed = true;
  }

  // 2. tool_calls fragments: name (MCP) + streamed argument chunks (both families).
  for (const frag of delta.tool_calls ?? []) {
    let key: string;
    if (frag.id) {
      key = `id:${frag.id}`;
      acc.idToKey.set(frag.id, key);
      acc.indexToKey.set(frag.index, key);
    } else {
      // Server-tool args carry only an index and no id; route them to the active
      // tool (the one the preceding x_tool_status opened).
      key = acc.indexToKey.get(frag.index) ?? acc.lastKey ?? `idx:${frag.index}`;
      acc.indexToKey.set(frag.index, key);
    }
    const t = ensure(acc, key, {});
    if (frag.function?.name) {
      t.name = frag.function.name;
      acc.nameToKey.set(frag.function.name, key);
    }
    if (frag.function?.arguments) {
      t.input = (t.input ?? '') + frag.function.arguments;
    }
    acc.lastKey = key;
    changed = true;
  }

  // 3. Server-tool RESULT blocks (web_search / code execution) — terminal.
  const resultBlock = delta.x_search_results ?? delta.x_code_result;
  if (resultBlock !== undefined && resultBlock !== null) {
    const tuid =
      typeof resultBlock === 'object'
        ? (resultBlock as { tool_use_id?: string }).tool_use_id
        : undefined;
    const key =
      (tuid ? acc.idToKey.get(tuid) : undefined) ?? acc.lastKey ?? `result:${acc.order.length}`;
    const t = ensure(acc, key, { name: delta.x_search_results ? 'web_search' : 'code_execution' });
    t.output = safeStringify(resultBlock);
    t.status = 'completed';
    changed = true;
  }

  // 4. MCP tool result — id-keyed, terminal.
  const r = delta.x_tool_result;
  if (r?.tool_call_id) {
    const key = acc.idToKey.get(r.tool_call_id) ?? `id:${r.tool_call_id}`;
    acc.idToKey.set(r.tool_call_id, key);
    const t = ensure(acc, key, { name: r.name ?? '' });
    if (r.name) t.name = r.name;
    t.output = safeStringify(r.content);
    t.status = r.is_error ? 'failed' : 'completed';
    changed = true;
  }

  // 5. MCP approval request (manual mode): surface the pending tool so the step is
  //    at least visible. The full approve/deny flow is a separate, larger scope.
  const appr = delta.x_tool_approval_request;
  if (appr?.tool_call_id) {
    const key = acc.idToKey.get(appr.tool_call_id) ?? `id:${appr.tool_call_id}`;
    acc.idToKey.set(appr.tool_call_id, key);
    const t = ensure(acc, key, { name: appr.name });
    if (appr.name) t.name = appr.name;
    if (appr.args !== undefined && !t.input) t.input = safeStringify(appr.args);
    t.status = 'running';
    changed = true;
  }

  return changed;
}

/** Snapshot the accumulated tool calls in first-seen order (skips unnamed noise). */
export function toolCallList(acc: ToolCallAccumulator): ToolCall[] {
  return acc.order
    .map((k) => acc.byKey.get(k))
    .filter((t): t is ToolCall => t !== undefined && t.name.length > 0)
    .map((t) => ({ ...t }));
}
