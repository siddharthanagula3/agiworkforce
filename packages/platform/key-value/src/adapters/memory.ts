import type {
  KeyValueBatch,
  KeyValueHashFields,
  KeyValueScanOptions,
  KeyValueScanPage,
  KeyValueSetOptions,
  KeyValueSortedEntry,
  KeyValueStore,
} from '../types';

const NO_EXPIRY = Number.POSITIVE_INFINITY;
const SCAN_START_CURSOR = '0';
const MILLISECONDS_PER_SECOND = 1_000;
const DEFAULT_INCREMENT = 1;
const EMPTY_SIZE = 0;

type StoredKind = 'value' | 'hash' | 'set' | 'sorted';

interface StoredEntry {
  kind: StoredKind;
  value: unknown;
  hash: Map<string, string | number>;
  members: Set<string>;
  sorted: Map<string, number>;
  expiresAtMs: number;
}

function emptyEntry(kind: StoredKind): StoredEntry {
  return {
    kind,
    value: null,
    hash: new Map(),
    members: new Set(),
    sorted: new Map(),
    expiresAtMs: NO_EXPIRY,
  };
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
  const translated = escaped.replace(/\*/gu, '.*').replace(/\?/gu, '.');
  return new RegExp(`^${translated}$`, 'u');
}

export interface MemoryKeyValueStoreOptions {
  now?: () => number;
}

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly entries = new Map<string, StoredEntry>();

  private readonly now: () => number;

  constructor(options: MemoryKeyValueStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  clear(): void {
    this.entries.clear();
  }

  private live(key: string): StoredEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private upsert(key: string, kind: StoredKind): StoredEntry {
    const existing = this.live(key);
    if (existing && existing.kind === kind) return existing;
    const created = emptyEntry(kind);
    this.entries.set(key, created);
    return created;
  }

  private applyTtl(entry: StoredEntry, options: KeyValueSetOptions | undefined): void {
    if (options?.ttlSeconds !== undefined) {
      entry.expiresAtMs = this.now() + options.ttlSeconds * MILLISECONDS_PER_SECOND;
      return;
    }
    if (options?.ttlMilliseconds !== undefined) {
      entry.expiresAtMs = this.now() + options.ttlMilliseconds;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.live(key);
    if (!entry || entry.kind !== 'value') return null;
    return entry.value as T;
  }

  async set(key: string, value: unknown, options?: KeyValueSetOptions): Promise<boolean> {
    if (options?.onlyIfAbsent && this.live(key)) return false;
    const entry = emptyEntry('value');
    entry.value = value;
    this.applyTtl(entry, options);
    this.entries.set(key, entry);
    return true;
  }

  async delete(...keys: string[]): Promise<number> {
    let removed = EMPTY_SIZE;
    for (const key of keys) {
      if (this.live(key)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  async increment(key: string, amount: number = DEFAULT_INCREMENT): Promise<number> {
    const entry = this.upsert(key, 'value');
    const current = typeof entry.value === 'number' ? entry.value : Number(entry.value ?? 0);
    const next = (Number.isFinite(current) ? current : 0) + amount;
    entry.value = next;
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.live(key);
    if (!entry) return;
    entry.expiresAtMs = this.now() + ttlSeconds * MILLISECONDS_PER_SECOND;
  }

  expireIn(key: string, ttlMilliseconds: number): void {
    const entry = this.live(key);
    if (!entry) return;
    entry.expiresAtMs = this.now() + ttlMilliseconds;
  }

  expireAt(key: string, epochMilliseconds: number): void {
    const entry = this.live(key);
    if (!entry) return;
    entry.expiresAtMs = epochMilliseconds;
  }

  async hashSet(key: string, fields: KeyValueHashFields): Promise<void> {
    const entry = this.upsert(key, 'hash');
    for (const [field, value] of Object.entries(fields)) entry.hash.set(field, value);
  }

  async hashGetAll<T>(key: string): Promise<T | null> {
    const entry = this.live(key);
    if (!entry || entry.kind !== 'hash' || entry.hash.size === EMPTY_SIZE) return null;
    return Object.fromEntries(entry.hash) as T;
  }

  async setAdd(key: string, member: string): Promise<void> {
    this.upsert(key, 'set').members.add(member);
  }

  async setRemove(key: string, member: string): Promise<void> {
    const entry = this.live(key);
    if (entry?.kind === 'set') entry.members.delete(member);
  }

  async setSize(key: string): Promise<number> {
    const entry = this.live(key);
    return entry?.kind === 'set' ? entry.members.size : EMPTY_SIZE;
  }

  async sortedAdd(key: string, entry: KeyValueSortedEntry): Promise<void> {
    this.upsert(key, 'sorted').sorted.set(entry.member, entry.score);
  }

  async sortedRemove(key: string, member: string): Promise<void> {
    const entry = this.live(key);
    if (entry?.kind === 'sorted') entry.sorted.delete(member);
  }

  async sortedRemoveByScore(key: string, minScore: number, maxScore: number): Promise<void> {
    const entry = this.live(key);
    if (entry?.kind !== 'sorted') return;
    for (const [member, score] of entry.sorted) {
      if (score >= minScore && score <= maxScore) entry.sorted.delete(member);
    }
  }

  async sortedSize(key: string): Promise<number> {
    const entry = this.live(key);
    return entry?.kind === 'sorted' ? entry.sorted.size : EMPTY_SIZE;
  }

  sortedRangeByScore(key: string, minScore: number, maxScore: number): string[] {
    const entry = this.live(key);
    if (entry?.kind !== 'sorted') return [];
    return [...entry.sorted.entries()]
      .filter(([, score]) => score >= minScore && score <= maxScore)
      .sort((left, right) => left[1] - right[1])
      .map(([member]) => member);
  }

  async scan(cursor: string, options: KeyValueScanOptions): Promise<KeyValueScanPage> {
    if (cursor !== SCAN_START_CURSOR) return { cursor: SCAN_START_CURSOR, keys: [] };
    const matcher = globToRegExp(options.match);
    const keys = [...this.entries.keys()]
      .filter((key) => this.live(key) !== undefined && matcher.test(key))
      .slice(EMPTY_SIZE, options.count);
    return { cursor: SCAN_START_CURSOR, keys };
  }

  batch(): KeyValueBatch {
    const queued: Array<() => Promise<unknown>> = [];
    const batch: KeyValueBatch = {
      get: (key) => {
        queued.push(() => this.get(key));
        return batch;
      },
      set: (key, value, options) => {
        queued.push(() => this.set(key, value, options));
        return batch;
      },
      increment: (key, amount) => {
        queued.push(() => this.increment(key, amount));
        return batch;
      },
      expire: (key, ttlSeconds) => {
        queued.push(() => this.expire(key, ttlSeconds));
        return batch;
      },
      expireIn: (key, ttlMilliseconds) => {
        queued.push(async () => this.expireIn(key, ttlMilliseconds));
        return batch;
      },
      expireAt: (key, epochMilliseconds) => {
        queued.push(async () => this.expireAt(key, epochMilliseconds));
        return batch;
      },
      hashSet: (key, fields) => {
        queued.push(() => this.hashSet(key, fields));
        return batch;
      },
      hashGetAll: (key) => {
        queued.push(() => this.hashGetAll(key));
        return batch;
      },
      sortedAdd: (key, entry) => {
        queued.push(() => this.sortedAdd(key, entry));
        return batch;
      },
      sortedRemoveByScore: (key, minScore, maxScore) => {
        queued.push(() => this.sortedRemoveByScore(key, minScore, maxScore));
        return batch;
      },
      sortedRangeByScore: (key, minScore, maxScore) => {
        queued.push(async () => this.sortedRangeByScore(key, minScore, maxScore));
        return batch;
      },
      exec: async () => {
        const results: unknown[] = [];
        for (const run of queued) results.push(await run());
        return results;
      },
    };
    return batch;
  }
}

export function createMemoryKeyValueStore(
  options: MemoryKeyValueStoreOptions = {},
): MemoryKeyValueStore {
  return new MemoryKeyValueStore(options);
}
