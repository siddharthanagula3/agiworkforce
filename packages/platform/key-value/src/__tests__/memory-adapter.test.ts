import { beforeEach, describe, expect, it } from 'vitest';

import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '../adapters/memory';
import { createSlidingWindowRateLimiter } from '../sliding-window';

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const START_MS = 1_700_000_000_000;

let clockMs = START_MS;
const now = (): number => clockMs;

function advance(byMs: number): void {
  clockMs += byMs;
}

describe('memory key-value store', () => {
  let store: MemoryKeyValueStore;

  beforeEach(() => {
    clockMs = START_MS;
    store = createMemoryKeyValueStore({ now });
  });

  it('reads back a value written without a ttl', async () => {
    await store.set('k', { status: 'active' });
    await expect(store.get('k')).resolves.toEqual({ status: 'active' });
  });

  it('expires a value once its ttl has elapsed', async () => {
    await store.set('k', 'v', { ttlSeconds: 5 });

    advance(4 * SECOND_MS);
    await expect(store.get('k')).resolves.toBe('v');

    advance(SECOND_MS);
    await expect(store.get('k')).resolves.toBeNull();
  });

  it('expires a value written with a millisecond ttl', async () => {
    await store.set('k', 'v', { ttlMilliseconds: 250 });

    advance(249);
    await expect(store.get('k')).resolves.toBe('v');

    advance(1);
    await expect(store.get('k')).resolves.toBeNull();
  });

  it('applies a ttl set after the write', async () => {
    await store.set('k', 'v');
    await store.expire('k', 2);

    advance(2 * SECOND_MS);
    await expect(store.get('k')).resolves.toBeNull();
  });

  it('refuses a conditional write while the key is live and allows it after expiry', async () => {
    await expect(
      store.set('lock', 'first', { onlyIfAbsent: true, ttlMilliseconds: 100 }),
    ).resolves.toBe(true);
    await expect(store.set('lock', 'second', { onlyIfAbsent: true })).resolves.toBe(false);

    advance(100);
    await expect(store.set('lock', 'third', { onlyIfAbsent: true })).resolves.toBe(true);
    await expect(store.get('lock')).resolves.toBe('third');
  });

  it('counts increments and reports deletions', async () => {
    await expect(store.increment('n')).resolves.toBe(1);
    await expect(store.increment('n', 4)).resolves.toBe(5);
    await expect(store.delete('n')).resolves.toBe(1);
    await expect(store.delete('n')).resolves.toBe(0);
  });

  it('expires a hash and reports an absent hash as null', async () => {
    await store.hashSet('h', { reason: 'overloaded', untilMs: 42 });
    await expect(store.hashGetAll('h')).resolves.toEqual({ reason: 'overloaded', untilMs: 42 });

    await store.expire('h', 1);
    advance(SECOND_MS);
    await expect(store.hashGetAll('h')).resolves.toBeNull();
  });

  it('tracks set membership for the audit-stream flag shape', async () => {
    await store.setAdd('orgs', 'org-1');
    await store.setAdd('orgs', 'org-2');
    await expect(store.setSize('orgs')).resolves.toBe(2);

    await store.setRemove('orgs', 'org-1');
    await expect(store.setSize('orgs')).resolves.toBe(1);
  });

  it('ages sorted-set members out by score for the turn-slot shape', async () => {
    await store.sortedAdd('slots', { score: clockMs, member: 'turn-1' });
    advance(MINUTE_MS);
    await store.sortedAdd('slots', { score: clockMs, member: 'turn-2' });

    await store.sortedRemoveByScore('slots', 0, clockMs - MINUTE_MS);
    await expect(store.sortedSize('slots')).resolves.toBe(1);

    await store.sortedRemove('slots', 'turn-2');
    await expect(store.sortedSize('slots')).resolves.toBe(0);
  });

  it('runs a batch in order and returns one result per queued command', async () => {
    const results = await store.batch().set('pool', 1).increment('pool', 2).get('pool').exec();

    expect(results).toEqual([true, 3, 3]);
  });

  it('matches scan patterns and drops expired keys from the page', async () => {
    await store.set('e2b:session:v3:t:u:code_session:a', 'one');
    await store.set('e2b:session:v3:t:u:code_session:b', 'two', { ttlSeconds: 1 });
    await store.set('other:key', 'three');

    const first = await store.scan('0', { match: 'e2b:session:v3:*', count: 500 });
    expect([...first.keys].sort()).toEqual([
      'e2b:session:v3:t:u:code_session:a',
      'e2b:session:v3:t:u:code_session:b',
    ]);
    expect(first.cursor).toBe('0');

    advance(SECOND_MS);
    const second = await store.scan('0', { match: 'e2b:session:v3:*', count: 500 });
    expect(second.keys).toEqual(['e2b:session:v3:t:u:code_session:a']);
  });
});

describe('sliding window rate limiter over the memory store', () => {
  beforeEach(() => {
    clockMs = START_MS;
  });

  it('admits up to the limit and then refuses inside the window', async () => {
    const limiter = createSlidingWindowRateLimiter(createMemoryKeyValueStore({ now }), { now });
    const window = { limit: 3, window: '1 m' };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const verdict = await limiter.limit('agi-rl:chat-message', 'user:1', window);
      expect(verdict.success).toBe(true);
      expect(verdict.remaining).toBe(3 - attempt - 1);
    }

    const refused = await limiter.limit('agi-rl:chat-message', 'user:1', window);
    expect(refused.success).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.limit).toBe(3);
  });

  it('readmits as the oldest request slides out of the window', async () => {
    const limiter = createSlidingWindowRateLimiter(createMemoryKeyValueStore({ now }), { now });
    const window = { limit: 2, window: '1 m' };

    await limiter.limit('agi-rl:chat-message', 'user:1', window);
    advance(30 * SECOND_MS);
    await limiter.limit('agi-rl:chat-message', 'user:1', window);

    await expect(limiter.limit('agi-rl:chat-message', 'user:1', window)).resolves.toMatchObject({
      success: false,
    });

    advance(31 * SECOND_MS);
    await expect(limiter.limit('agi-rl:chat-message', 'user:1', window)).resolves.toMatchObject({
      success: true,
      remaining: 0,
    });
  });

  it('keeps identifiers and namespaces in separate buckets', async () => {
    const limiter = createSlidingWindowRateLimiter(createMemoryKeyValueStore({ now }), { now });
    const window = { limit: 1, window: '1 m' };

    await limiter.limit('agi-rl:chat-message', 'user:1', window);

    await expect(limiter.limit('agi-rl:chat-message', 'user:2', window)).resolves.toMatchObject({
      success: true,
    });
    await expect(limiter.limit('agi-rl:llm-completion', 'user:1', window)).resolves.toMatchObject({
      success: true,
    });
    await expect(limiter.limit('agi-rl:chat-message', 'user:1', window)).resolves.toMatchObject({
      success: false,
    });
  });
});
