import { describe, expect, it } from 'vitest';

import { LatchedHeaderStore, applyLatchedHeaders } from '../headers';

describe('LatchedHeaderStore', () => {
  it('latches a header and returns it on read', () => {
    const store = new LatchedHeaderStore();
    expect(store.latch('s1', 'Anthropic-Beta', 'fast-mode')).toBe(true);
    expect(store.getLatched('s1')).toEqual({ 'anthropic-beta': 'fast-mode' });
  });

  it('is idempotent — re-latching same value returns false', () => {
    const store = new LatchedHeaderStore();
    store.latch('s1', 'X-Cache-Mode', 'global');
    expect(store.latch('s1', 'X-Cache-Mode', 'global')).toBe(false);
  });

  it('updates value on second call with different value', () => {
    const store = new LatchedHeaderStore();
    store.latch('s1', 'X-Mode', 'a');
    expect(store.latch('s1', 'X-Mode', 'b')).toBe(true);
    expect(store.getLatched('s1')['x-mode']).toBe('b');
  });

  it('isolates sessions', () => {
    const store = new LatchedHeaderStore();
    store.latch('s1', 'H', 'v1');
    store.latch('s2', 'H', 'v2');
    expect(store.getLatched('s1')['h']).toBe('v1');
    expect(store.getLatched('s2')['h']).toBe('v2');
  });

  it('clear drops all latches for a session', () => {
    const store = new LatchedHeaderStore();
    store.latch('s1', 'H', 'v');
    store.clear('s1');
    expect(store.getLatched('s1')).toEqual({});
  });

  it('snapshot returns null when session has no latches', () => {
    const store = new LatchedHeaderStore();
    expect(store.snapshot('nope')).toBeNull();
  });

  it('snapshot includes timestamp', () => {
    const store = new LatchedHeaderStore();
    store.latch('s', 'H', 'v');
    const snap = store.snapshot('s');
    expect(snap).not.toBeNull();
    expect(snap!.headers['h']).toBe('v');
    expect(typeof snap!.latchedAt).toBe('number');
  });

  it('rejects empty session/header names', () => {
    const store = new LatchedHeaderStore();
    expect(store.latch('', 'H', 'v')).toBe(false);
    expect(store.latch('s', '', 'v')).toBe(false);
  });

  it('FIFO-evicts when over capacity (64 sessions)', () => {
    const store = new LatchedHeaderStore();
    for (let i = 0; i < 70; i++) {
      store.latch(`s${i}`, 'H', String(i));
    }
    expect(store.size).toBeLessThanOrEqual(64);
    // The first sessions should have been evicted.
    expect(store.getLatched('s0')).toEqual({});
    // Latest sessions remain.
    expect(store.getLatched('s69')['h']).toBe('69');
  });
});

describe('applyLatchedHeaders', () => {
  it('returns outbound unchanged when nothing latched', () => {
    const store = new LatchedHeaderStore();
    const out = applyLatchedHeaders('s1', { 'X-Foo': 'bar' }, store);
    expect(out).toEqual({ 'X-Foo': 'bar' });
  });

  it('merges latched headers with outbound', () => {
    const store = new LatchedHeaderStore();
    store.latch('s1', 'X-Latched', 'on');
    const out = applyLatchedHeaders('s1', { 'X-Foo': 'bar' }, store);
    expect(out['X-Foo']).toBe('bar');
    expect(out['x-latched']).toBe('on');
  });

  it('latched headers OVERRIDE outbound on collision', () => {
    const store = new LatchedHeaderStore();
    store.latch('s1', 'X-Foo', 'latched-value');
    const out = applyLatchedHeaders('s1', { 'X-Foo': 'outbound-value' }, store);
    // latched wins (lowercased key)
    expect(out['x-foo']).toBe('latched-value');
  });
});
