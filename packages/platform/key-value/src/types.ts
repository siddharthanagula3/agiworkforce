export type KeyValueProvider = 'upstash' | 'redis' | 'memory' | 'none';

export interface KeyValueSetOptions {
  ttlSeconds?: number;
  ttlMilliseconds?: number;
  onlyIfAbsent?: boolean;
}

export interface KeyValueScanOptions {
  match: string;
  count: number;
}

export interface KeyValueScanPage {
  cursor: string;
  keys: readonly string[];
}

export interface KeyValueSortedEntry {
  score: number;
  member: string;
}

export type KeyValueHashFields = Record<string, string | number>;

/**
 * Commands queued on one round trip. `exec` resolves the results positionally,
 * in the order the commands were queued, which is the shape the routing and
 * free-lane readers already index into.
 */
export interface KeyValueBatch {
  get(key: string): KeyValueBatch;
  set(key: string, value: unknown, options?: KeyValueSetOptions): KeyValueBatch;
  increment(key: string, amount?: number): KeyValueBatch;
  expire(key: string, ttlSeconds: number): KeyValueBatch;
  expireIn(key: string, ttlMilliseconds: number): KeyValueBatch;
  expireAt(key: string, epochMilliseconds: number): KeyValueBatch;
  hashSet(key: string, fields: KeyValueHashFields): KeyValueBatch;
  hashGetAll(key: string): KeyValueBatch;
  sortedAdd(key: string, entry: KeyValueSortedEntry): KeyValueBatch;
  sortedRemoveByScore(key: string, minScore: number, maxScore: number): KeyValueBatch;
  sortedRangeByScore(key: string, minScore: number, maxScore: number): KeyValueBatch;
  exec(): Promise<unknown[]>;
}

export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>;
  /** `false` only when `onlyIfAbsent` was asked for and the key already existed. */
  set(key: string, value: unknown, options?: KeyValueSetOptions): Promise<boolean>;
  delete(...keys: string[]): Promise<number>;
  increment(key: string, amount?: number): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  hashSet(key: string, fields: KeyValueHashFields): Promise<void>;
  hashGetAll<T>(key: string): Promise<T | null>;
  setAdd(key: string, member: string): Promise<void>;
  setRemove(key: string, member: string): Promise<void>;
  setSize(key: string): Promise<number>;
  sortedAdd(key: string, entry: KeyValueSortedEntry): Promise<void>;
  sortedRemove(key: string, member: string): Promise<void>;
  sortedRemoveByScore(key: string, minScore: number, maxScore: number): Promise<void>;
  sortedSize(key: string): Promise<number>;
  scan(cursor: string, options: KeyValueScanOptions): Promise<KeyValueScanPage>;
  batch(): KeyValueBatch;
}

export interface RateLimitWindow {
  limit: number;
  /** Upstash duration grammar, for example `1 m` or `15 m`. */
  window: string;
}

export interface RateLimitVerdict {
  success: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
}

export interface RateLimiter {
  limit(namespace: string, identifier: string, window: RateLimitWindow): Promise<RateLimitVerdict>;
}

export class KeyValueConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyValueConfigError';
  }
}
