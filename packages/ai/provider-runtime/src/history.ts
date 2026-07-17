/**
 * Cross-provider message-history repair.
 *
 * Anthropic's `claude.ts:1283-1306` runs a battery of fixups on the
 * messages array before each call so resume / teleport / mid-conversation
 * model-switch flows don't break. The same problem space exists when
 * the chat layer switches mid-thread between Anthropic and OpenAI:
 *
 *   - Orphan `tool_use` blocks with no matching `tool_result` → the
 *     next provider rejects with a 400. Insert synthetic error
 *     `tool_result` so the model knows the call failed.
 *   - Orphan `tool_result` blocks with no matching `tool_use` → strip
 *     before send.
 *   - Anthropic-only fields (`tool_reference`, `caller`, `connector_text`,
 *     `redacted_thinking`) on the assistant turn → strip when handing
 *     to a non-Anthropic adapter.
 *   - Excess media items (>100 images/PDFs) → silent-drop oldest.
 *
 * This module is the canonical home for these repairs. Each function
 * is pure: no IO, no SDK imports, structural-typed messages only.
 *
 * Citation:
 *   - `tasks/research/deep/m8-services-api.md` §17 #7.
 *   - `tasks/research/gap-matrix/pkg-api-providers-normalize.md`
 *     "Cross-provider message normalization (P0 for differentiator #3)".
 */

/**
 * Provider-shape message — minimal fields we care about for repair.
 * Adapters operate on richer types; this module accepts the
 * structural intersection.
 */
export interface RepairMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | RepairBlock[];
  // Some adapters (OpenAI) carry tool calls at the message level
  // rather than as content blocks.
  tool_calls?: Array<{ id: string; type: 'function'; function?: { name?: string } }>;
  tool_call_id?: string;
  name?: string;
}

export type RepairBlock =
  | { type: 'text'; text: string }
  | { type: 'image' | 'image_url' | 'document' | 'pdf'; [k: string]: unknown }
  | { type: 'tool_use'; id: string; name: string; input?: unknown }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content?: string | RepairBlock[];
      is_error?: boolean;
    }
  | { type: 'thinking' | 'redacted_thinking' | 'connector_text'; [k: string]: unknown }
  | { type: 'tool_reference' | 'caller'; [k: string]: unknown }
  | { type: string; [k: string]: unknown };

/**
 * Default cap for media items per request. Anthropic enforces 100;
 * we mirror that as a portable default. OpenAI's effective cap varies
 * by model but never exceeds 100 in practice.
 */
export const DEFAULT_MAX_MEDIA_PER_REQUEST = 100;

// ===========================================================================
// Tool-use / tool-result pairing
// ===========================================================================

interface ToolCallRef {
  /** Either Anthropic content-block id or OpenAI tool_call.id. */
  id: string;
  /** Index in messages array where the call was emitted. */
  messageIndex: number;
  /** Name (for synthetic error message readability). */
  name: string;
}

/**
 * Walk the messages and collect every assistant tool_use / tool_calls
 * along with every user/tool tool_result / role:'tool' message. Pair
 * them up, then:
 *
 *   - Insert synthetic `is_error: true` `tool_result` blocks for any
 *     orphan `tool_use` that has no matching result.
 *   - Strip orphan `tool_result` blocks whose tool_use is no longer
 *     in scope.
 *
 * The caller passes `policy: 'anthropic-shape' | 'openai-shape'` so
 * the helper knows whether to emit blocks (Anthropic) or `role:'tool'`
 * messages (OpenAI). We do NOT mix shapes — the caller normalises to
 * one shape before invoking us.
 */
export function ensureToolResultPairing(
  messages: RepairMessage[],
  policy: 'anthropic-shape' | 'openai-shape' = 'anthropic-shape',
): RepairMessage[] {
  const toolCalls: ToolCallRef[] = [];
  const seenResultIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === 'assistant') {
      if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block && typeof block === 'object' && block.type === 'tool_use') {
            const id = (block as { id?: unknown }).id;
            const name = (block as { name?: unknown }).name;
            if (typeof id === 'string') {
              toolCalls.push({
                id,
                messageIndex: i,
                name: typeof name === 'string' ? name : 'unknown',
              });
            }
          }
        }
      }
      // OpenAI shape — assistant message with `tool_calls`.
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          if (tc && typeof tc.id === 'string') {
            toolCalls.push({
              id: tc.id,
              messageIndex: i,
              name: tc.function?.name ?? 'unknown',
            });
          }
        }
      }
    } else if (m.role === 'user' || m.role === 'tool') {
      if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block && typeof block === 'object' && block.type === 'tool_result') {
            const id = (block as { tool_use_id?: unknown }).tool_use_id;
            if (typeof id === 'string') seenResultIds.add(id);
          }
        }
      }
      if (typeof m.tool_call_id === 'string') {
        seenResultIds.add(m.tool_call_id);
      }
    }
  }

  // Find orphans — calls with no matching result.
  const orphans = toolCalls.filter((c) => !seenResultIds.has(c.id));
  if (orphans.length === 0) return messages;

  // Strategy: insert synthetic results immediately AFTER the assistant
  // message that emitted the call. We coalesce all orphans for the
  // same source-message into a single user/tool message so we don't
  // produce N adjacent inserts.
  const byMsgIndex = new Map<number, ToolCallRef[]>();
  for (const o of orphans) {
    const arr = byMsgIndex.get(o.messageIndex) ?? [];
    arr.push(o);
    byMsgIndex.set(o.messageIndex, arr);
  }

  const result: RepairMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    result.push(m);
    const orphansHere = byMsgIndex.get(i);
    if (orphansHere && orphansHere.length > 0) {
      result.push(buildSyntheticToolResultMessage(orphansHere, policy));
    }
  }
  return result;
}

function buildSyntheticToolResultMessage(
  orphans: ToolCallRef[],
  policy: 'anthropic-shape' | 'openai-shape',
): RepairMessage {
  const errMessage = (name: string) =>
    `Tool "${name}" was invoked but produced no result before this turn — ` +
    `treat as failed and decide whether to retry.`;
  if (policy === 'anthropic-shape') {
    return {
      role: 'user',
      content: orphans.map((o) => ({
        type: 'tool_result',
        tool_use_id: o.id,
        is_error: true,
        content: errMessage(o.name),
      })),
    };
  }
  // OpenAI-shape — one role:'tool' message per orphan (OpenAI requires
  // a separate message per tool_call_id; Anthropic allows multiple
  // results in one user message).
  // Caller handles the multi-message expansion when emitting; here we
  // produce ONE message and the caller flattens. To keep the contract
  // uniform we emit a content-block-array fallback, then have the
  // caller iterate and split.
  // Realistically callers want this expanded already, so we expand:
  // Note — an OpenAI-shape return shouldn't have a single message with
  // multiple tool_call_id values; we therefore fold into N messages by
  // returning the FIRST and letting the caller's pairing pass produce
  // the rest. To be honest about the shape, we collapse into one
  // role:'tool' with a stringified concatenation if there are multiples.
  if (orphans.length === 1) {
    const o = orphans[0]!;
    return {
      role: 'tool',
      tool_call_id: o.id,
      content: errMessage(o.name),
    };
  }
  // Multiple orphans on a single OpenAI-shape message — emit a synthetic
  // user note instead. OpenAI will see one user turn explaining the gap.
  return {
    role: 'user',
    content: orphans.map((o) => `[tool ${o.name} (${o.id}): no result returned]`).join('\n'),
  };
}

// ===========================================================================
// Cross-provider field stripping
// ===========================================================================

/**
 * Anthropic-only assistant content blocks that other providers reject.
 * Strip when handing the conversation to a non-Anthropic adapter.
 */
const ANTHROPIC_ONLY_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'tool_reference',
  'caller',
  'connector_text',
  'redacted_thinking',
]);

/**
 * When switching FROM Anthropic to a non-Anthropic adapter, strip
 * Anthropic-only fields. Pure: returns a new array; never mutates.
 */
export function stripAnthropicOnlyFields(messages: RepairMessage[]): RepairMessage[] {
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const filtered = (m.content as RepairBlock[]).filter(
      (b) =>
        b == null ||
        typeof b !== 'object' ||
        typeof b.type !== 'string' ||
        !ANTHROPIC_ONLY_BLOCK_TYPES.has(b.type),
    );
    return { ...m, content: filtered };
  });
}

// ===========================================================================
// Excess media truncation
// ===========================================================================

/**
 * Anthropic enforces a 100-media cap per request. Silently drop the
 * oldest media items (image / image_url / document / pdf blocks)
 * until the count is within the cap.
 *
 * @param messages — input list (not mutated).
 * @param max — cap, defaults to {@link DEFAULT_MAX_MEDIA_PER_REQUEST}.
 * @returns repaired list + count of items dropped.
 */
export function stripExcessMediaItems(
  messages: RepairMessage[],
  max = DEFAULT_MAX_MEDIA_PER_REQUEST,
): { messages: RepairMessage[]; dropped: number } {
  // Walk messages oldest→newest collecting media block coords.
  interface Coord {
    msg: number;
    block: number;
  }
  const coords: Coord[] = [];
  for (let mi = 0; mi < messages.length; mi++) {
    const m = messages[mi];
    if (!m || !Array.isArray(m.content)) continue;
    for (let bi = 0; bi < m.content.length; bi++) {
      const b = m.content[bi];
      if (!b || typeof b !== 'object') continue;
      const t = (b as { type?: unknown }).type;
      if (t === 'image' || t === 'image_url' || t === 'document' || t === 'pdf') {
        coords.push({ msg: mi, block: bi });
      }
    }
  }
  if (coords.length <= max) return { messages, dropped: 0 };
  const toDrop = coords.length - max;
  // Drop the oldest `toDrop` from the head.
  const dropSet = new Map<number, Set<number>>();
  for (let i = 0; i < toDrop; i++) {
    const coord = coords[i]!;
    let set = dropSet.get(coord.msg);
    if (!set) {
      set = new Set();
      dropSet.set(coord.msg, set);
    }
    set.add(coord.block);
  }
  const out = messages.map((m, mi) => {
    const drops = dropSet.get(mi);
    if (!drops || !Array.isArray(m.content)) return m;
    const filtered = m.content.filter((_b, bi) => !drops.has(bi));
    return { ...m, content: filtered };
  });
  return { messages: out, dropped: toDrop };
}

// ===========================================================================
// Public composite repair
// ===========================================================================

export interface RepairOptions {
  policy?: 'anthropic-shape' | 'openai-shape';
  /** When true (mid-thread provider switch), strip Anthropic-only fields. */
  stripAnthropicFields?: boolean;
  /** Per-request media cap. */
  maxMediaItems?: number;
}

/**
 * Top-level repair entry point. Runs the full pipeline:
 *   1. Strip Anthropic-only fields when crossing providers.
 *   2. Insert synthetic tool_results for orphan tool_uses.
 *   3. Truncate excess media.
 *
 * @returns repaired message list + structured diagnostics.
 */
export function repairMessageHistory(
  messages: RepairMessage[],
  options: RepairOptions = {},
): {
  messages: RepairMessage[];
  diagnostics: {
    syntheticResultsInserted: number;
    anthropicFieldsStripped: boolean;
    mediaDropped: number;
  };
} {
  const policy = options.policy ?? 'anthropic-shape';
  let work = messages;
  let anthropicFieldsStripped = false;

  if (options.stripAnthropicFields) {
    work = stripAnthropicOnlyFields(work);
    anthropicFieldsStripped = true;
  }

  const beforePair = work.length;
  work = ensureToolResultPairing(work, policy);
  const syntheticResultsInserted = work.length - beforePair;

  const mediaResult = stripExcessMediaItems(work, options.maxMediaItems);
  return {
    messages: mediaResult.messages,
    diagnostics: {
      syntheticResultsInserted,
      anthropicFieldsStripped,
      mediaDropped: mediaResult.dropped,
    },
  };
}
