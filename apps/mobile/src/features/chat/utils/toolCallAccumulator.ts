/**
 * Tool-call accumulator — turns the server's tool-call SSE deltas into the
 * `ToolCall[]` that MessageBubble/ToolCallTimeline renders.
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

/**
 * Seed a fresh accumulator from previously-finalized tool calls — used when a
 * tool-approval resume continuation starts a NEW SSE stream that must extend
 * the SAME timeline (approved/rejected cards) rather than dropping them. Each
 * tool's own `id` is already the accumulator's stable key (`id:${toolCallId}`
 * for MCP tools, `name:${name}` for server tools), so re-registering the
 * lookup maps from it reproduces exactly what the original stream built.
 */
export function seedToolCallAccumulator(existing: ToolCall[]): ToolCallAccumulator {
  const acc = createToolCallAccumulator();
  for (const tool of existing) {
    const key = tool.id;
    acc.byKey.set(key, { ...tool });
    acc.order.push(key);
    if (tool.toolCallId) acc.idToKey.set(tool.toolCallId, key);
    if (tool.name) acc.nameToKey.set(tool.name, key);
  }
  return acc;
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
    // A status update means the tool progressed past the approval gate
    // (approved → executing) — it is no longer awaiting a decision.
    t.requiresApproval = false;
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

    // Code execution: show the program's stdout/stderr as the Response — not
    // the raw JSON envelope. A non-zero return code marks the step failed.
    if (delta.x_code_result) {
      const inner = (
        delta.x_code_result as {
          content?: { stdout?: string; stderr?: string; return_code?: number };
        }
      ).content;
      if (inner && (typeof inner.stdout === 'string' || typeof inner.stderr === 'string')) {
        const text = [inner.stdout, inner.stderr]
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
          .join('\n');
        if (text) t.output = text;
        if (typeof inner.return_code === 'number' && inner.return_code !== 0) {
          t.status = 'failed';
        }
      }
    }

    // Preserve the structured per-result {url, title} list (not just the
    // stringified blob) so the UI can render real favicon/title/domain cards —
    // mirrors apps/web's useChatStream.ts parsing of the same wire shape.
    if (delta.x_search_results) {
      const content = (delta.x_search_results as { content?: unknown }).content;
      if (Array.isArray(content)) {
        const results = (content as Record<string, unknown>[])
          .filter((r) => r['type'] === 'web_search_result' && typeof r['url'] === 'string')
          .map((r) => ({
            url: r['url'] as string,
            title: (r['title'] as string) || (r['url'] as string),
            // Only a real plaintext snippet — Anthropic's `encrypted_content`
            // is an opaque blob for provider-side citation reconstruction and
            // must never render as descriptive text.
            snippet: typeof r['snippet'] === 'string' ? r['snippet'] : undefined,
          }));
        if (results.length > 0) t.searchResults = results;
      }
    }

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
    // Terminal result (approved-and-executed or a server-issued denial) — the
    // call is no longer awaiting approval.
    t.requiresApproval = false;
    changed = true;
  }

  // 5. MCP approval request (manual mode): surface the pending tool with an
  //    approve/reject affordance (ToolCallTimeline renders it when
  //    `requiresApproval` is set). `resolveToolApproval` in chatExecutionStore
  //    drives the actual resume request once the user decides.
  const appr = delta.x_tool_approval_request;
  if (appr?.tool_call_id) {
    const key = acc.idToKey.get(appr.tool_call_id) ?? `id:${appr.tool_call_id}`;
    acc.idToKey.set(appr.tool_call_id, key);
    const t = ensure(acc, key, { name: appr.name });
    if (appr.name) t.name = appr.name;
    if (appr.args !== undefined && !t.input) t.input = safeStringify(appr.args);
    t.status = 'running';
    t.requiresApproval = true;
    t.toolCallId = appr.tool_call_id;
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
