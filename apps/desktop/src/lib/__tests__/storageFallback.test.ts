/**
 * H42 — storageFallback tests
 *
 * Verifies the no-op Storage implementation used in SSR / non-browser environments.
 */
import { describe, it, expect } from 'vitest';
import { storageFallback } from '../storageFallback';

describe('storageFallback', () => {
  describe('getItem', () => {
    it('always returns null regardless of key', () => {
      expect(storageFallback.getItem('anything')).toBeNull();
      expect(storageFallback.getItem('')).toBeNull();
      expect(storageFallback.getItem('key-that-was-set')).toBeNull();
    });

    it('returns null after a setItem call for the same key', () => {
      storageFallback.setItem('myKey', 'myValue');
      // storageFallback is a no-op: stored value is discarded
      expect(storageFallback.getItem('myKey')).toBeNull();
    });
  });

  describe('setItem', () => {
    it('does not throw when called', () => {
      expect(() => storageFallback.setItem('key', 'value')).not.toThrow();
    });

    it('returns undefined (no-op)', () => {
      const result = storageFallback.setItem('k', 'v');
      expect(result).toBeUndefined();
    });

    it('does not persist value across subsequent getItem calls', () => {
      storageFallback.setItem('persistent?', 'no');
      expect(storageFallback.getItem('persistent?')).toBeNull();
    });
  });

  describe('removeItem', () => {
    it('does not throw when called', () => {
      expect(() => storageFallback.removeItem('any-key')).not.toThrow();
    });

    it('returns undefined (no-op)', () => {
      const result = storageFallback.removeItem('key');
      expect(result).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('does not throw when called', () => {
      expect(() => storageFallback.clear()).not.toThrow();
    });

    it('returns undefined (no-op)', () => {
      const result = storageFallback.clear();
      expect(result).toBeUndefined();
    });

    it('calling clear does not affect subsequent getItem — still returns null', () => {
      storageFallback.setItem('x', '1');
      storageFallback.clear();
      expect(storageFallback.getItem('x')).toBeNull();
    });
  });

  describe('key', () => {
    it('returns null for index 0', () => {
      expect(storageFallback.key(0)).toBeNull();
    });

    it('returns null for any index', () => {
      expect(storageFallback.key(99)).toBeNull();
      expect(storageFallback.key(-1)).toBeNull();
    });
  });

  describe('length', () => {
    it('is always 0', () => {
      expect(storageFallback.length).toBe(0);
    });

    it('remains 0 after setItem calls', () => {
      storageFallback.setItem('a', '1');
      storageFallback.setItem('b', '2');
      expect(storageFallback.length).toBe(0);
    });

    it('remains 0 after clear', () => {
      storageFallback.clear();
      expect(storageFallback.length).toBe(0);
    });
  });

  describe('Storage interface conformance', () => {
    it('implements the full Storage interface', () => {
      expect(typeof storageFallback.getItem).toBe('function');
      expect(typeof storageFallback.setItem).toBe('function');
      expect(typeof storageFallback.removeItem).toBe('function');
      expect(typeof storageFallback.clear).toBe('function');
      expect(typeof storageFallback.key).toBe('function');
      expect(typeof storageFallback.length).toBe('number');
    });

    it('can be used as a Storage value directly', () => {
      // Assigning to a Storage-typed variable should not cause type errors at runtime
      const storage: Storage = storageFallback;
      expect(storage.length).toBe(0);
      expect(storage.getItem('k')).toBeNull();
    });
  });
});
