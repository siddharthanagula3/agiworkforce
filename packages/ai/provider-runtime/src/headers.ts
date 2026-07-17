/**
 * Latched session-stable headers.
 *
 * Anthropic's `claude.ts:1412-1456` enforces a sticky-on invariant for a
 * narrow set of headers: once they have been sent for a session, they
 * MUST keep being sent on every subsequent request even if the
 * originating feature is no longer active. Reason: the prompt-cache key
 * is computed from the full header set, and dropping a header mid-session
 * busts ~50–70 K tokens of cached prefix on the next turn.
 *
 * The same problem applies to any provider with explicit prompt caching
 * (Anthropic ephemeral, OpenAI Responses cache key, Google
 * `cachedContents`). This module provides a generic `LatchedHeaderStore`
 * keyed by session ID; consumers latch the specific header names the
 * provider cares about.
 *
 * Citation:
 *   - `tasks/research/deep/m8-services-api.md` §1.2 phase 3 latches.
 *   - `tasks/research/gap-matrix/pkg-api-providers-normalize.md`
 *     "Latched session-stable header flags (P0 — cache key preservation)".
 */

const MAX_TRACKED_SESSIONS = 64;

/** Snapshot of the latched flags for a single session. */
export interface LatchedHeaders {
  readonly headers: Readonly<Record<string, string>>;
  readonly latchedAt: number;
}

/**
 * In-memory store of latched headers. **Per-process** — does not persist
 * across CLI restarts because the prompt cache key is regenerated when
 * the session resumes anyway.
 *
 * Entries are evicted FIFO when the store exceeds `MAX_TRACKED_SESSIONS`
 * (64). Anthropic uses a similar `MAX_TRACKED_SOURCES = 10` cap (see
 * `m8 §5`); we hold more because subagents create more session keys
 * per parent in our architecture.
 */
export class LatchedHeaderStore {
  private readonly state = new Map<string, Map<string, string>>();
  private readonly insertionOrder: string[] = [];

  /**
   * Mark a header as latched for the given session. Idempotent — if the
   * header is already latched with the same value, this is a no-op.
   * Returns `true` when this call performed a state mutation.
   */
  latch(sessionId: string, headerName: string, value: string): boolean {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
    if (typeof headerName !== 'string' || headerName.length === 0) return false;
    const norm = headerName.toLowerCase();

    let entry = this.state.get(sessionId);
    if (!entry) {
      entry = new Map();
      this.state.set(sessionId, entry);
      this.insertionOrder.push(sessionId);
      this.evictIfOverCap();
    }
    const prev = entry.get(norm);
    if (prev === value) return false;
    entry.set(norm, value);
    return true;
  }

  /**
   * Read the latched header set for a session. Returns an empty record
   * when the session has no latches.
   */
  getLatched(sessionId: string): Readonly<Record<string, string>> {
    const entry = this.state.get(sessionId);
    if (!entry) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of entry.entries()) out[k] = v;
    return out;
  }

  /**
   * Return the snapshot for a session including the latch timestamp.
   */
  snapshot(sessionId: string): LatchedHeaders | null {
    const entry = this.state.get(sessionId);
    if (!entry || entry.size === 0) return null;
    const headers: Record<string, string> = {};
    for (const [k, v] of entry.entries()) headers[k] = v;
    return { headers, latchedAt: Date.now() };
  }

  /**
   * Drop all latches for a session. Used when the chat layer detects the
   * cache key has been invalidated for unrelated reasons (new model,
   * tool-set change, etc.) so future turns start clean.
   */
  clear(sessionId: string): void {
    if (this.state.delete(sessionId)) {
      const idx = this.insertionOrder.indexOf(sessionId);
      if (idx >= 0) this.insertionOrder.splice(idx, 1);
    }
  }

  /** Number of tracked sessions — for telemetry. */
  get size(): number {
    return this.state.size;
  }

  private evictIfOverCap(): void {
    while (this.insertionOrder.length > MAX_TRACKED_SESSIONS) {
      const oldest = this.insertionOrder.shift();
      if (oldest) this.state.delete(oldest);
    }
  }
}

/**
 * Default singleton — most consumers want a single per-process store.
 * For testing or multi-tenant isolation, instantiate `LatchedHeaderStore`
 * directly.
 */
export const defaultLatchedHeaderStore = new LatchedHeaderStore();

/**
 * Merge a request's outbound header set with any latched headers for the
 * session. Latched headers WIN over the request's own headers — the
 * whole point of latching is that they override even when the calling
 * feature has toggled off.
 */
export function applyLatchedHeaders(
  sessionId: string,
  outbound: Record<string, string>,
  store: LatchedHeaderStore = defaultLatchedHeaderStore,
): Record<string, string> {
  const latched = store.getLatched(sessionId);
  if (Object.keys(latched).length === 0) return outbound;
  return { ...outbound, ...latched };
}
