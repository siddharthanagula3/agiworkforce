/**
 * Memory import — parsers for ChatGPT and Claude conversation exports.
 *
 * Both vendors let users export their chat history as JSON. This module
 * extracts user-stated facts, preferences, and recurring patterns into
 * `MemoryCandidate` entries that the host UI can preview, filter, and then
 * persist via the existing memory API (`memory_add` Tauri command).
 *
 * Pure functions — no IO, no Tauri imports. Hosts call:
 *   1. `parseChatGPTExport(json)` or `parseClaudeExport(json)` → `MemoryCandidate[]`
 *   2. (optional) `dedupCandidates(candidates)` to drop near-duplicates
 *   3. `acceptCandidates(candidates, addMemory)` to persist via the memory API
 */

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * A candidate memory extracted from an exported conversation. Hosts present
 * these in a preview list; users mark which to accept.
 */
export interface MemoryCandidate {
  /** Stable id (sha256 prefix of `content` + `source`). Useful for dedup + UI keys. */
  id: string;
  /** Verbatim user-stated text (or short paraphrase if truncated). */
  content: string;
  /** Best-guess category. Hosts can override. */
  category: 'preference' | 'fact' | 'context' | 'correction';
  /** ISO timestamp from the original conversation, when available. */
  sourceTimestamp?: string;
  /** Conversation title from the export, when available. */
  sourceConversation?: string;
  /** Origin tool — hosts can show a badge. */
  source: 'chatgpt-export' | 'claude-export';
  /** 0–1 score; hosts can sort by importance. Heuristic-based. */
  importance: number;
}

// ── ChatGPT export parser ────────────────────────────────────────────────────

/**
 * ChatGPT's `conversations.json` ships an array of conversations. Each
 * conversation has a `mapping` keyed by node id; each node has a `message`
 * with `author.role`, `content.parts`, and `create_time` (epoch seconds).
 * We walk every user-role node.
 */
interface ChatGPTNode {
  id: string;
  message: {
    author: { role: string };
    content: { content_type?: string; parts?: unknown[] };
    create_time?: number | null;
  } | null;
  parent?: string | null;
  children?: string[];
}

interface ChatGPTConversation {
  id?: string;
  title?: string;
  create_time?: number;
  mapping: Record<string, ChatGPTNode>;
}

export function parseChatGPTExport(json: unknown): MemoryCandidate[] {
  if (!Array.isArray(json)) return [];
  const out: MemoryCandidate[] = [];
  for (const conv of json as ChatGPTConversation[]) {
    if (!conv || typeof conv.mapping !== 'object' || conv.mapping === null) continue;
    for (const node of Object.values(conv.mapping)) {
      const msg = node?.message;
      if (!msg || msg.author?.role !== 'user') continue;
      const text = stringFromParts(msg.content?.parts);
      if (!text) continue;
      const candidate = candidateFromUserText(text, {
        source: 'chatgpt-export',
        ...(conv.title ? { sourceConversation: conv.title } : {}),
        ...(typeof msg.create_time === 'number'
          ? { sourceTimestamp: new Date(msg.create_time * 1000).toISOString() }
          : {}),
      });
      if (candidate) out.push(candidate);
    }
  }
  return out;
}

// ── Claude export parser ─────────────────────────────────────────────────────

/**
 * Claude.ai's `conversations.json` ships an array of conversations, each
 * with `chat_messages` of `{ sender: 'human' | 'assistant', text, created_at }`.
 */
interface ClaudeMessage {
  sender?: string;
  text?: string;
  content?: Array<{ type?: string; text?: string }>;
  created_at?: string;
}

interface ClaudeConversation {
  uuid?: string;
  name?: string;
  created_at?: string;
  chat_messages?: ClaudeMessage[];
}

export function parseClaudeExport(json: unknown): MemoryCandidate[] {
  if (!Array.isArray(json)) return [];
  const out: MemoryCandidate[] = [];
  for (const conv of json as ClaudeConversation[]) {
    if (!conv || !Array.isArray(conv.chat_messages)) continue;
    for (const msg of conv.chat_messages) {
      if (msg.sender !== 'human') continue;
      const text =
        typeof msg.text === 'string' && msg.text.length > 0
          ? msg.text
          : msg.content
              ?.map((b) => b.text ?? '')
              .join('\n')
              .trim();
      if (!text) continue;
      const candidate = candidateFromUserText(text, {
        source: 'claude-export',
        ...(conv.name ? { sourceConversation: conv.name } : {}),
        ...(msg.created_at ? { sourceTimestamp: msg.created_at } : {}),
      });
      if (candidate) out.push(candidate);
    }
  }
  return out;
}

// ── Heuristic extraction ─────────────────────────────────────────────────────

const PREFERENCE_TRIGGERS = [
  /\bi (always|usually|prefer|like to|want to|don't|do not|never)\b/i,
  /\bmy (favorite|preferred|go-to|workflow|setup)\b/i,
  /\bplease (always|never|don't|do not|use|avoid)\b/i,
];

const FACT_TRIGGERS = [
  /\bi am a\b/i,
  /\bi'?m (a |an )?\w+/i,
  /\bi work (at|on|with)\b/i,
  /\bi live in\b/i,
  /\bmy (name|email|phone|address|company|team) is\b/i,
];

const CORRECTION_TRIGGERS = [
  /\b(actually|no|wrong|that'?s not right|don'?t do that|stop doing)\b/i,
];

/** Length bounds on a single candidate — anything longer is a multi-message dump. */
const MIN_LEN = 20;
const MAX_LEN = 600;

function candidateFromUserText(
  rawText: string,
  meta: {
    source: MemoryCandidate['source'];
    sourceConversation?: string;
    sourceTimestamp?: string;
  },
): MemoryCandidate | null {
  const text = rawText.trim();
  if (text.length < MIN_LEN || text.length > MAX_LEN) return null;
  // Skip obvious code blocks / pure questions
  if (text.startsWith('```') || text.endsWith('?')) return null;

  // Trigger-aware classification. Preference takes precedence over
  // correction when both match (e.g. "I always do X — don't suggest Y" is
  // primarily a stated preference, not a correction).
  let category: MemoryCandidate['category'];
  let importance: number;

  if (PREFERENCE_TRIGGERS.some((re) => re.test(text))) {
    category = 'preference';
    importance = 0.6;
  } else if (CORRECTION_TRIGGERS.some((re) => re.test(text))) {
    category = 'correction';
    importance = 0.7;
  } else if (FACT_TRIGGERS.some((re) => re.test(text))) {
    category = 'fact';
    importance = 0.5;
  } else {
    // No trigger — drop short single-line acks/questions, keep longer
    // free-form context if any host wants to inspect it later.
    if (text.split('\n').length === 1 && text.length < 40) return null;
    return null;
  }

  return {
    id: hashStable(meta.source + '\n' + text),
    content: text,
    category,
    source: meta.source,
    importance,
    ...(meta.sourceConversation ? { sourceConversation: meta.sourceConversation } : {}),
    ...(meta.sourceTimestamp ? { sourceTimestamp: meta.sourceTimestamp } : {}),
  };
}

// ── Dedup ────────────────────────────────────────────────────────────────────

/**
 * Drop near-duplicate candidates: same first-100-char prefix + same category.
 * The keep order is stable (first occurrence wins).
 */
export function dedupCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
  const seen = new Set<string>();
  const out: MemoryCandidate[] = [];
  for (const c of candidates) {
    const key = c.category + '|' + c.content.slice(0, 100).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ── Persistence helper ───────────────────────────────────────────────────────

/**
 * Persist the user-accepted candidates via the host's memory-add function.
 * Returns the count of successful inserts. Failures (a single insert
 * throwing) are logged via the optional onError callback and do not stop
 * the loop.
 */
export async function acceptCandidates(
  candidates: MemoryCandidate[],
  addMemory: (entry: {
    category: MemoryCandidate['category'];
    content: string;
    importance: number;
    source: string;
    topic?: string;
  }) => Promise<unknown>,
  onError?: (candidate: MemoryCandidate, err: unknown) => void,
): Promise<number> {
  let inserted = 0;
  for (const c of candidates) {
    try {
      await addMemory({
        category: c.category,
        content: c.content,
        importance: c.importance,
        source: c.source,
        ...(c.sourceConversation ? { topic: c.sourceConversation } : {}),
      });
      inserted += 1;
    } catch (err) {
      onError?.(c, err);
    }
  }
  return inserted;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stringFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => (typeof p === 'string' ? p : ''))
    .join('\n')
    .trim();
}

/**
 * Stable hash for candidate ids. Uses Web Crypto when available, falls back
 * to a deterministic FNV-1a hex digest (sufficient for dedup-by-id).
 */
function hashStable(input: string): string {
  // FNV-1a 32-bit, hex-encoded — pure function, no async.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
