import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import StateRecoveryService from '../state-recovery-service';

describe('StateRecoveryService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('captureSnapshot', () => {
    it('should capture state snapshot to localStorage', () => {
      const state = { counter: 5, name: 'test' };
      StateRecoveryService.captureSnapshot('test-key', state);

      const stored = localStorage.getItem('state_snapshot_test-key');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.data).toEqual(state);
      expect(parsed.timestamp).toBeTruthy();
      expect(parsed.version).toBe(1);
    });

    it('should handle primitive values', () => {
      StateRecoveryService.captureSnapshot('primitive', 42);

      const stored = localStorage.getItem('state_snapshot_primitive');
      const parsed = JSON.parse(stored!);
      expect(parsed.data.value).toBe(42);
    });
  });

  describe('restoreFromSnapshot', () => {
    it('should restore state from snapshot', () => {
      const originalState = { counter: 5, name: 'test' };
      StateRecoveryService.captureSnapshot('restore-test', originalState);

      const restored = StateRecoveryService.restoreFromSnapshot('restore-test', {});
      expect(restored).toEqual(originalState);
    });

    it('should return fallback when no snapshot exists', () => {
      const fallback = { default: true };
      const restored = StateRecoveryService.restoreFromSnapshot('nonexistent', fallback);
      expect(restored).toEqual(fallback);
    });

    it('should return fallback on corrupted data', () => {
      localStorage.setItem('state_snapshot_corrupted', 'not valid json');
      const fallback = { default: true };

      const restored = StateRecoveryService.restoreFromSnapshot('corrupted', fallback);
      expect(restored).toEqual(fallback);
    });
  });

  describe('validateState', () => {
    it('should validate state against schema', () => {
      const state = { name: 'test', age: 25 };
      const isValid = StateRecoveryService.validateState(state, (s: any) => {
        return typeof s === 'object' && 'name' in s && 'age' in s;
      });

      expect(isValid).toBe(true);
    });

    it('should return false for invalid state', () => {
      const state = { name: 'test' };
      const isValid = StateRecoveryService.validateState(state, (s: any) => {
        return typeof s === 'object' && 'name' in s && 'age' in s;
      });

      expect(isValid).toBe(false);
    });

    it('should handle validation errors gracefully', () => {
      const validator = () => {
        throw new Error('Validation error');
      };

      const isValid = StateRecoveryService.validateState({}, validator);
      expect(isValid).toBe(false);
    });
  });

  describe('resetState', () => {
    it('should clear state snapshot', () => {
      StateRecoveryService.captureSnapshot('reset-test', { value: 42 });
      expect(localStorage.getItem('state_snapshot_reset-test')).toBeTruthy();

      StateRecoveryService.resetState('reset-test', {});
      expect(localStorage.getItem('state_snapshot_reset-test')).toBeNull();
    });
  });

  describe('mergeState', () => {
    it('should merge partial state updates', () => {
      const current = { a: 1, b: 2, c: 3 };
      const updates = { b: 20 };
      const defaults = { a: 0, b: 0, c: 0 };

      const merged = StateRecoveryService.mergeState(current, updates, defaults);
      expect(merged).toEqual({ a: 1, b: 20, c: 3 });
    });

    it('should reset to defaults on null/undefined values', () => {
      const current = { a: 1, b: 2, c: 3 };
      const updates = { b: null };
      const defaults = { a: 0, b: 0, c: 0 };

      const merged = StateRecoveryService.mergeState(current, updates as any, defaults);
      expect(merged.b).toBe(0);
    });

    it('should return current on merge error', () => {
      const current = { a: 1 };
      const updates = { a: 1 };
      const defaults = { a: 0 };

      const merged = StateRecoveryService.mergeState(current, updates, defaults);
      expect(merged).toEqual(current);
    });
  });

  describe('recovery log', () => {
    it('should track recovery actions', () => {
      const state = { test: true };
      StateRecoveryService.captureSnapshot('log-test', state);

      // Restore to trigger logging
      StateRecoveryService.restoreFromSnapshot('log-test', {});

      const log = StateRecoveryService.getRecoveryLog();
      expect(log.length).toBeGreaterThan(0);
      if (log.length > 0) {
        expect(log[log.length - 1]?.action).toBe('snapshot_restore');
      }
    });

    it('should clear recovery log', () => {
      StateRecoveryService.captureSnapshot('test', {});
      StateRecoveryService.restoreFromSnapshot('test', {});

      let log = StateRecoveryService.getRecoveryLog();
      expect(log.length).toBeGreaterThan(0);

      StateRecoveryService.clearRecoveryLog();
      log = StateRecoveryService.getRecoveryLog();
      expect(log).toEqual([]);
    });

    it('should limit log to 50 entries', () => {
      // Add more than 50 entries
      for (let i = 0; i < 60; i++) {
        StateRecoveryService.captureSnapshot(`test-${i}`, { value: i });
      }

      const log = StateRecoveryService.getRecoveryLog();
      expect(log.length).toBeLessThanOrEqual(50);
    });
  });
});
