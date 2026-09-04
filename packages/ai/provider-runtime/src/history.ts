export interface RepairMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | RepairBlock[];
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

export const DEFAULT_MAX_MEDIA_PER_REQUEST = 100;

interface ToolCallRef {
  id: string;
  messageIndex: number;
  name: string;
}

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

  const orphans = toolCalls.filter((c) => !seenResultIds.has(c.id));
  if (orphans.length === 0) return messages;

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
    `Tool "${name}" was invoked but produced no result before this turn, ` +
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
  if (orphans.length === 1) {
    const o = orphans[0]!;
    return {
      role: 'tool',
      tool_call_id: o.id,
      content: errMessage(o.name),
    };
  }
  return {
    role: 'user',
    content: orphans.map((o) => `[tool ${o.name} (${o.id}): no result returned]`).join('\n'),
  };
}

const ANTHROPIC_ONLY_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'tool_reference',
  'caller',
  'connector_text',
  'redacted_thinking',
]);

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

/**
 * Anthropic enforces a 100-media cap per request. Silently drop the
 * oldest media items (image / image_url / document / pdf blocks)
 * until the count is within the cap.
 *
 * @param messages, input list (not mutated).
 * @param max, cap, defaults to {@link DEFAULT_MAX_MEDIA_PER_REQUEST}.
 * @returns repaired list + count of items dropped.
 */
export function stripExcessMediaItems(
  messages: RepairMessage[],
  max = DEFAULT_MAX_MEDIA_PER_REQUEST,
): { messages: RepairMessage[]; dropped: number } {
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

export interface RepairOptions {
  policy?: 'anthropic-shape' | 'openai-shape';
  stripAnthropicFields?: boolean;
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
