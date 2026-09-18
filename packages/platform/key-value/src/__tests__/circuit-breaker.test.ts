import { describe, expect, it, vi } from 'vitest';

import { createMemoryKeyValueStore } from '../adapters/memory';
import {
  createCircuitBreakerKeyValueStore,
  resolveKeyValueBreakerPolicy,
  KEY_VALUE_BREAKER_CONTRACT,
  KeyValueCircuitOpenError,
  KEY_VALUE_BREAKER_COOLDOWN_MS_ENV,
  KEY_VALUE_BREAKER_THRESHOLD_ENV,
} from '../circuit-breaker';
import type { KeyValueStore } from '../types';

const COOLDOWN_MS = 1_000;
const THRESHOLD = 3;
const CACHE_KEY = 'cache:account-status:user_1';
const COUNTER_KEY = 'free-lane:user_1';

function outage(): { store: KeyValueStore; calls: () => number; heal: () => void } {
  const inner = createMemoryKeyValueStore();
  let down = true;
  let calls = 0;
  const fail = async (): Promise<never> => {
    calls += 1;
    throw new Error('ECONNREFUSED');
  };
  const store: KeyValueStore = {
    ...inner,
    async get(key) {
      if (down) return fail();
      calls += 1;
      return inner.get(key);
    },
    async set(key, value, options) {
      if (down) return fail();
      calls += 1;
      return inner.set(key, value, options);
    },
    async increment(key, amount) {
      if (down) return fail();
      calls += 1;
      return inner.increment(key, amount);
    },
  };
  return { store, calls: () => calls, heal: () => (down = false) };
}

function breaker(
  store: KeyValueStore,
  extra: Parameters<typeof createCircuitBreakerKeyValueStore>[1] = {},
) {
  let clock = 0;
  const wrapped = createCircuitBreakerKeyValueStore(store, {
    policy: { failureThreshold: THRESHOLD, cooldownMs: COOLDOWN_MS },
    now: () => clock,
    ...extra,
  });
  return { wrapped, advance: (ms: number) => (clock += ms) };
}

async function drive(call: () => Promise<unknown>, times: number): Promise<unknown[]> {
  const outcomes: unknown[] = [];
  for (let index = 0; index < times; index += 1) {
    outcomes.push(await call().catch((error: unknown) => error));
  }
  return outcomes;
}

describe('key-value circuit breaker', () => {
  it('opens after the failure threshold and then fails fast without calling the backend', async () => {
    const { store, calls } = outage();
    const { wrapped } = breaker(store);

    await drive(() => wrapped.get(CACHE_KEY), THRESHOLD);
    expect(calls()).toBe(THRESHOLD);
    expect(wrapped.circuitState()).toBe('open');

    await expect(wrapped.get(CACHE_KEY)).rejects.toBeInstanceOf(KeyValueCircuitOpenError);
    expect(calls()).toBe(THRESHOLD);
  });

  it('half-opens after the cooldown and closes on the first success', async () => {
    const { store, heal, calls } = outage();
    const { wrapped, advance } = breaker(store);

    await drive(() => wrapped.get(CACHE_KEY), THRESHOLD);
    advance(COOLDOWN_MS);
    expect(wrapped.circuitState()).toBe('half-open');

    heal();
    await expect(wrapped.get(CACHE_KEY)).resolves.toBeNull();
    expect(wrapped.circuitState()).toBe('closed');
    expect(calls()).toBe(THRESHOLD + 1);
  });

  it('re-opens when the half-open probe fails again', async () => {
    const { store } = outage();
    const { wrapped, advance } = breaker(store);

    await drive(() => wrapped.get(CACHE_KEY), THRESHOLD);
    advance(COOLDOWN_MS);
    await expect(wrapped.get(CACHE_KEY)).rejects.toThrow('ECONNREFUSED');
    expect(wrapped.circuitState()).toBe('open');
  });

  it('serves a declared cache key from the fallback while the circuit is open', async () => {
    const { store } = outage();
    const fallback = createMemoryKeyValueStore();
    const { wrapped } = breaker(store, {
      fallback,
      degradable: (key: string) => key.startsWith('cache:'),
    });

    await wrapped.set(CACHE_KEY, { status: 'active' });
    await expect(wrapped.get(CACHE_KEY)).resolves.toEqual({ status: 'active' });
    expect(await fallback.get(CACHE_KEY)).toEqual({ status: 'active' });
  });

  it('never answers a counter from the fallback, because a per-instance count is a second truth', async () => {
    const { store } = outage();
    const fallback = createMemoryKeyValueStore();
    const { wrapped } = breaker(store, {
      fallback,
      degradable: (key: string) => key.startsWith('cache:'),
    });

    await expect(wrapped.increment(COUNTER_KEY)).rejects.toThrow('ECONNREFUSED');
    await expect(wrapped.get(COUNTER_KEY)).rejects.toThrow('ECONNREFUSED');
    expect(await fallback.get(COUNTER_KEY)).toBeNull();
  });

  it('reports the transition so an operator learns the backend is degraded', async () => {
    const { store } = outage();
    const onStateChange = vi.fn();
    const { wrapped, advance } = breaker(store, { onStateChange });

    await drive(() => wrapped.get(CACHE_KEY), THRESHOLD);
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'open', consecutiveFailures: THRESHOLD }),
    );

    advance(COOLDOWN_MS);
    expect(wrapped.circuitState()).toBe('half-open');
  });

  it('reads its policy from the environment', () => {
    expect(
      resolveKeyValueBreakerPolicy({
        [KEY_VALUE_BREAKER_THRESHOLD_ENV]: '7',
        [KEY_VALUE_BREAKER_COOLDOWN_MS_ENV]: '2500',
      }),
    ).toEqual({ failureThreshold: 7, cooldownMs: 2_500 });

    expect(resolveKeyValueBreakerPolicy({ [KEY_VALUE_BREAKER_THRESHOLD_ENV]: '0' })).toEqual(
      resolveKeyValueBreakerPolicy({}),
    );
  });
});

describe('the contract this breaker shares with the platform one', () => {
  it('uses the same three states, so a reader does not have to learn two vocabularies', () => {
    expect([...KEY_VALUE_BREAKER_CONTRACT.states]).toEqual(['closed', 'open', 'half-open']);
  });

  it('states why it trips on consecutive failures rather than on a windowed rate', () => {
    expect(KEY_VALUE_BREAKER_CONTRACT.trip).toBe('consecutive-failures');
  });

  it('is scoped to one store, never shared across every backend at once', async () => {
    const failing = createCircuitBreakerKeyValueStore(
      {
        get: async () => {
          throw new Error('backend down');
        },
      } as never,
      { policy: { failureThreshold: 1, cooldownMs: 10_000 } },
    );
    const healthy = createCircuitBreakerKeyValueStore({ get: async () => 'ok' } as never, {
      policy: { failureThreshold: 1, cooldownMs: 10_000 },
    });

    await failing.get('k').catch(() => undefined);

    expect(KEY_VALUE_BREAKER_CONTRACT.scope).toBe('per-store');
    expect(failing.circuitState()).toBe('open');
    expect(healthy.circuitState()).toBe('closed');
    await expect(healthy.get('k')).resolves.toBe('ok');
  });
});
