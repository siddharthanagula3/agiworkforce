
const MAX_TRACKED_SESSIONS = 64;

export interface LatchedHeaders {
  readonly headers: Readonly<Record<string, string>>;
  readonly latchedAt: number;
}

export class LatchedHeaderStore {
  private readonly state = new Map<string, Map<string, string>>();
  private readonly insertionOrder: string[] = [];

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

  getLatched(sessionId: string): Readonly<Record<string, string>> {
    const entry = this.state.get(sessionId);
    if (!entry) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of entry.entries()) out[k] = v;
    return out;
  }

  snapshot(sessionId: string): LatchedHeaders | null {
    const entry = this.state.get(sessionId);
    if (!entry || entry.size === 0) return null;
    const headers: Record<string, string> = {};
    for (const [k, v] of entry.entries()) headers[k] = v;
    return { headers, latchedAt: Date.now() };
  }

  clear(sessionId: string): void {
    if (this.state.delete(sessionId)) {
      const idx = this.insertionOrder.indexOf(sessionId);
      if (idx >= 0) this.insertionOrder.splice(idx, 1);
    }
  }

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

export const defaultLatchedHeaderStore = new LatchedHeaderStore();

export function applyLatchedHeaders(
  sessionId: string,
  outbound: Record<string, string>,
  store: LatchedHeaderStore = defaultLatchedHeaderStore,
): Record<string, string> {
  const latched = store.getLatched(sessionId);
  if (Object.keys(latched).length === 0) return outbound;
  return { ...outbound, ...latched };
}
