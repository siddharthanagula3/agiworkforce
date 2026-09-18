import type {
  KeyValueBatch,
  KeyValueHashFields,
  KeyValueScanOptions,
  KeyValueScanPage,
  KeyValueSetOptions,
  KeyValueSortedEntry,
  KeyValueStore,
} from './types';

export const KEY_VALUE_BREAKER_THRESHOLD_ENV = 'AGI_KV_BREAKER_FAILURE_THRESHOLD';
export const KEY_VALUE_BREAKER_COOLDOWN_MS_ENV = 'AGI_KV_BREAKER_COOLDOWN_MS';

export const DEFAULT_KEY_VALUE_BREAKER_POLICY: KeyValueBreakerPolicy = {
  failureThreshold: 5,
  cooldownMs: 10_000,
};

const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 100;
const MIN_COOLDOWN_MS = 100;
const MAX_COOLDOWN_MS = 300_000;

/**
 * The same three states the shared breaker in `@agiworkforce/utils` uses. This
 * package declares no dependency on that one, so the vocabulary is mirrored
 * here and `KEY_VALUE_BREAKER_CONTRACT` is what keeps the two from drifting.
 */
export type KeyValueCircuitState = 'closed' | 'open' | 'half-open';

export const KEY_VALUE_BREAKER_CONTRACT = {
  states: ['closed', 'open', 'half-open'] as const,
  /** Consecutive failures, not a windowed rate: a key-value call is cheap and uniform. */
  trip: 'consecutive-failures',
  /** One breaker per store instance, never one for every backend at once. */
  scope: 'per-store',
} as const;

export interface KeyValueBreakerPolicy {
  failureThreshold: number;
  cooldownMs: number;
}

export interface KeyValueBreakerObservation {
  state: KeyValueCircuitState;
  consecutiveFailures: number;
  error?: unknown;
}

export interface KeyValueBreakerOptions {
  policy?: Partial<KeyValueBreakerPolicy>;
  /**
   * Served only for keys `degradable` accepts. A counter, reservation or
   * idempotency key answered from process memory would be a second source of
   * truth per instance, so a store with no fallback fails fast instead.
   */
  fallback?: KeyValueStore;
  degradable?: (key: string) => boolean;
  now?: () => number;
  onStateChange?: (observation: KeyValueBreakerObservation) => void;
}

export class KeyValueCircuitOpenError extends Error {
  constructor(readonly retryAtMs: number) {
    super('Key-value backend is unavailable; the circuit is open');
    this.name = 'KeyValueCircuitOpenError';
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function readNumber(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveKeyValueBreakerPolicy(
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): KeyValueBreakerPolicy {
  const defaults = DEFAULT_KEY_VALUE_BREAKER_POLICY;
  return {
    failureThreshold: clamp(
      Math.round(readNumber(env, KEY_VALUE_BREAKER_THRESHOLD_ENV, defaults.failureThreshold)),
      MIN_THRESHOLD,
      MAX_THRESHOLD,
    ),
    cooldownMs: clamp(
      Math.round(readNumber(env, KEY_VALUE_BREAKER_COOLDOWN_MS_ENV, defaults.cooldownMs)),
      MIN_COOLDOWN_MS,
      MAX_COOLDOWN_MS,
    ),
  };
}

export interface CircuitBreakerKeyValueStore extends KeyValueStore {
  circuitState(): KeyValueCircuitState;
}

/**
 * Turns a backend that has stopped answering into an immediate error rather
 * than a per-request timeout. Every consumer of the store already handles a
 * throw, by falling through to Postgres or by refusing the request; what none
 * of them survives is paying the full deadline on every call for the length of
 * an outage.
 */
export function createCircuitBreakerKeyValueStore(
  primary: KeyValueStore,
  options: KeyValueBreakerOptions = {},
): CircuitBreakerKeyValueStore {
  const policy = { ...resolveKeyValueBreakerPolicy(), ...options.policy };
  const now = options.now ?? Date.now;
  const degradable = options.degradable ?? (() => Boolean(options.fallback));

  let consecutiveFailures = 0;
  let openedAtMs: number | null = null;
  let halfOpenInFlight = false;

  function announce(state: KeyValueCircuitState, error?: unknown): void {
    options.onStateChange?.({ state, consecutiveFailures, error });
  }

  function state(): KeyValueCircuitState {
    if (openedAtMs === null) return 'closed';
    return now() - openedAtMs >= policy.cooldownMs ? 'half-open' : 'open';
  }

  function recordSuccess(): void {
    if (openedAtMs !== null) {
      openedAtMs = null;
      consecutiveFailures = 0;
      halfOpenInFlight = false;
      announce('closed');
      return;
    }
    consecutiveFailures = 0;
  }

  function recordFailure(error: unknown): void {
    consecutiveFailures += 1;
    halfOpenInFlight = false;
    if (openedAtMs !== null || consecutiveFailures >= policy.failureThreshold) {
      openedAtMs = now();
      announce('open', error);
    }
  }

  function degradedTo(keys: readonly string[]): KeyValueStore | null {
    const { fallback } = options;
    if (!fallback || keys.length === 0) return null;
    return keys.every((key) => degradable(key)) ? fallback : null;
  }

  async function guard<T>(
    keys: readonly string[],
    call: () => Promise<T>,
    degraded?: (store: KeyValueStore) => Promise<T>,
  ): Promise<T> {
    const current = state();
    if (current === 'open' || (current === 'half-open' && halfOpenInFlight)) {
      const store = degraded ? degradedTo(keys) : null;
      if (store && degraded) return degraded(store);
      throw new KeyValueCircuitOpenError((openedAtMs ?? now()) + policy.cooldownMs);
    }
    if (current === 'half-open') halfOpenInFlight = true;

    try {
      const result = await call();
      recordSuccess();
      return result;
    } catch (error) {
      recordFailure(error);
      const store = degraded ? degradedTo(keys) : null;
      if (store && degraded) return degraded(store);
      throw error;
    }
  }

  return {
    circuitState: state,

    get<T>(key: string): Promise<T | null> {
      return guard(
        [key],
        () => primary.get<T>(key),
        (store) => store.get<T>(key),
      );
    },

    set(key: string, value: unknown, setOptions?: KeyValueSetOptions): Promise<boolean> {
      return guard(
        [key],
        () => primary.set(key, value, setOptions),
        (store) => store.set(key, value, setOptions),
      );
    },

    delete(...keys: string[]): Promise<number> {
      return guard(
        keys,
        () => primary.delete(...keys),
        (store) => store.delete(...keys),
      );
    },

    increment(key: string, amount?: number): Promise<number> {
      return guard([key], () => primary.increment(key, amount));
    },

    expire(key: string, ttlSeconds: number): Promise<void> {
      return guard(
        [key],
        () => primary.expire(key, ttlSeconds),
        (store) => store.expire(key, ttlSeconds),
      );
    },

    hashSet(key: string, fields: KeyValueHashFields): Promise<void> {
      return guard(
        [key],
        () => primary.hashSet(key, fields),
        (store) => store.hashSet(key, fields),
      );
    },

    hashGetAll<T>(key: string): Promise<T | null> {
      return guard(
        [key],
        () => primary.hashGetAll<T>(key),
        (store) => store.hashGetAll<T>(key),
      );
    },

    setAdd(key: string, member: string): Promise<void> {
      return guard([key], () => primary.setAdd(key, member));
    },

    setRemove(key: string, member: string): Promise<void> {
      return guard([key], () => primary.setRemove(key, member));
    },

    setSize(key: string): Promise<number> {
      return guard([key], () => primary.setSize(key));
    },

    sortedAdd(key: string, entry: KeyValueSortedEntry): Promise<void> {
      return guard([key], () => primary.sortedAdd(key, entry));
    },

    sortedRemove(key: string, member: string): Promise<void> {
      return guard([key], () => primary.sortedRemove(key, member));
    },

    sortedRemoveByScore(key: string, minScore: number, maxScore: number): Promise<void> {
      return guard([key], () => primary.sortedRemoveByScore(key, minScore, maxScore));
    },

    sortedSize(key: string): Promise<number> {
      return guard([key], () => primary.sortedSize(key));
    },

    scan(cursor: string, scanOptions: KeyValueScanOptions): Promise<KeyValueScanPage> {
      return guard([], () => primary.scan(cursor, scanOptions));
    },

    batch(): KeyValueBatch {
      const queued = primary.batch();
      const wrapper: KeyValueBatch = {
        get(key: string) {
          queued.get(key);
          return wrapper;
        },
        set(key: string, value: unknown, setOptions?: KeyValueSetOptions) {
          queued.set(key, value, setOptions);
          return wrapper;
        },
        increment(key: string, amount?: number) {
          queued.increment(key, amount);
          return wrapper;
        },
        expire(key: string, ttlSeconds: number) {
          queued.expire(key, ttlSeconds);
          return wrapper;
        },
        expireIn(key: string, ttlMilliseconds: number) {
          queued.expireIn(key, ttlMilliseconds);
          return wrapper;
        },
        expireAt(key: string, epochMilliseconds: number) {
          queued.expireAt(key, epochMilliseconds);
          return wrapper;
        },
        hashSet(key: string, fields: KeyValueHashFields) {
          queued.hashSet(key, fields);
          return wrapper;
        },
        hashGetAll(key: string) {
          queued.hashGetAll(key);
          return wrapper;
        },
        sortedAdd(key: string, entry: KeyValueSortedEntry) {
          queued.sortedAdd(key, entry);
          return wrapper;
        },
        sortedRemoveByScore(key: string, minScore: number, maxScore: number) {
          queued.sortedRemoveByScore(key, minScore, maxScore);
          return wrapper;
        },
        sortedRangeByScore(key: string, minScore: number, maxScore: number) {
          queued.sortedRangeByScore(key, minScore, maxScore);
          return wrapper;
        },
        exec: () => guard([], () => queued.exec()),
      };
      return wrapper;
    },
  };
}
