import { describe, it, expect } from 'vitest';
import { uuidv7, isUuidV7, uuidV7TimestampMs, setUuidV7RandomSource } from '../uuidv7';

// Generic RFC-4122 UUID shape (any version) — mirrors what the sync endpoint's
// `z.string().uuid()` accepts, so a generated v7 must pass this too.
const ANY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuidv7', () => {
  it('produces a canonical, version-7, RFC-variant UUID', () => {
    const id = uuidv7();
    expect(id).toMatch(ANY_UUID_RE);
    expect(isUuidV7(id)).toBe(true);
    expect(id[14]).toBe('7'); // version nibble
    expect(['8', '9', 'a', 'b']).toContain(id[19]!.toLowerCase()); // variant
  });

  it('is unique across many generations', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50_000; i++) ids.add(uuidv7());
    expect(ids.size).toBe(50_000);
  });

  it('is monotonic: lexical string order == creation order (the sync ordering guarantee)', () => {
    const ids: string[] = [];
    for (let i = 0; i < 10_000; i++) ids.push(uuidv7());
    for (let i = 1; i < ids.length; i++) {
      // strictly increasing — never equal, never decreasing, even within one ms.
      // Indices are provably in-bounds (i ∈ [1, length)), so the non-null
      // assertions just satisfy noUncheckedIndexedAccess without changing intent.
      expect(ids[i]! > ids[i - 1]!).toBe(true);
    }
    // sorting a shuffled copy lexically restores creation order
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    expect([...shuffled].sort()).toEqual(ids);
  });

  it('embeds a recoverable creation timestamp close to now', () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();
    const ts = uuidV7TimestampMs(id);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 1);
  });

  it('isUuidV7 rejects v4 and malformed ids', () => {
    expect(isUuidV7('550e8400-e29b-41d4-a716-446655440000')).toBe(false); // v4
    expect(isUuidV7('not-a-uuid')).toBe(false);
    expect(isUuidV7('')).toBe(false);
  });

  it('uses an injected CSPRNG source when configured (React Native path)', () => {
    let called = 0;
    setUuidV7RandomSource((n) => {
      called++;
      return new Uint8Array(n).fill(0xab);
    });
    try {
      const id = uuidv7();
      expect(isUuidV7(id)).toBe(true);
      expect(called).toBeGreaterThan(0);
    } finally {
      // restore the default (global crypto) for other tests
      setUuidV7RandomSource((n) => {
        const b = new Uint8Array(n);
        (globalThis as { crypto?: Crypto }).crypto!.getRandomValues(b);
        return b;
      });
    }
  });
});
