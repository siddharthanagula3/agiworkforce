import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import useErrorStore from '../stores/errorStore';

describe('errorStore', () => {
  beforeEach(() => {
    useErrorStore.setState({
      errors: [],
      toasts: [],
    });
  });

  afterEach(() => {
    useErrorStore.getState().clearHistory();
  });

  describe('addError', () => {
    it('should add a new error to the store', () => {
      const { addError } = useErrorStore.getState();

      addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Failed to connect',
      });

      const currentErrors = useErrorStore.getState().errors;
      expect(currentErrors).toHaveLength(1);
      expect(currentErrors[0]?.message).toBe('Failed to connect');
      expect(currentErrors[0]?.type).toBe('NETWORK_ERROR');
      expect(currentErrors[0]?.severity).toBe('error');
    });

    it('should increment count for duplicate errors within 5 seconds', () => {
      const { addError } = useErrorStore.getState();

      addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Connection failed',
      });

      addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Connection failed',
      });

      const currentErrors = useErrorStore.getState().errors;
      expect(currentErrors).toHaveLength(1);
      expect(currentErrors[0]?.count).toBe(2);
    });

    it('should limit error history to maxHistorySize', () => {
      const { addError } = useErrorStore.getState();

      for (let i = 0; i < 150; i++) {
        addError({
          type: 'TEST_ERROR',
          severity: 'info',
          message: `Error ${i}`,
        });
      }

      const currentErrors = useErrorStore.getState().errors;
      expect(currentErrors.length).toBeLessThanOrEqual(100);
    });

    it('should limit toasts to maxToasts', () => {
      const { addError } = useErrorStore.getState();

      for (let i = 0; i < 10; i++) {
        addError({
          type: `ERROR_${i}`,
          severity: 'error',
          message: `Error ${i}`,
        });
      }

      const currentToasts = useErrorStore.getState().toasts;
      expect(currentToasts.length).toBeLessThanOrEqual(5);
    });
  });

  describe('dismissError', () => {
    it('should mark error as dismissed and remove from toasts', () => {
      const { addError, dismissError } = useErrorStore.getState();

      addError({
        type: 'TEST_ERROR',
        severity: 'error',
        message: 'Test error',
      });

      const errorId = useErrorStore.getState().errors[0]?.id;
      if (errorId) {
        dismissError(errorId);

        const { errors } = useErrorStore.getState();
        expect(errors[0]?.dismissed).toBe(true);
      }
      const { toasts } = useErrorStore.getState();
      expect(toasts).toHaveLength(0);
    });
  });

  describe('dismissAll', () => {
    it('should dismiss all errors and clear toasts', () => {
      const { addError, dismissAll } = useErrorStore.getState();

      addError({ type: 'ERROR_1', severity: 'error', message: 'Error 1' });
      addError({ type: 'ERROR_2', severity: 'error', message: 'Error 2' });
      addError({ type: 'ERROR_3', severity: 'error', message: 'Error 3' });

      dismissAll();

      const { errors, toasts } = useErrorStore.getState();
      expect(errors.every((e) => e.dismissed)).toBe(true);
      expect(toasts).toHaveLength(0);
    });
  });

  describe('clearHistory', () => {
    it('should clear all errors and toasts', () => {
      const { addError, clearHistory } = useErrorStore.getState();

      addError({ type: 'ERROR_1', severity: 'error', message: 'Error 1' });
      addError({ type: 'ERROR_2', severity: 'error', message: 'Error 2' });

      clearHistory();

      const { errors, toasts } = useErrorStore.getState();
      expect(errors).toHaveLength(0);
      expect(toasts).toHaveLength(0);
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', () => {
      const { addError, getStatistics } = useErrorStore.getState();

      addError({ type: 'NETWORK_ERROR', severity: 'error', message: 'Network error 1' });
      addError({ type: 'NETWORK_ERROR', severity: 'error', message: 'Network error 2' });
      addError({ type: 'DATABASE_ERROR', severity: 'critical', message: 'Database error' });
      addError({ type: 'FILE_ERROR', severity: 'warning', message: 'File error' });

      const stats = getStatistics();

      expect(stats.totalErrors).toBe(4);
      expect(stats.errorsByType['NETWORK_ERROR']).toBe(2);
      expect(stats.errorsByType['DATABASE_ERROR']).toBe(1);
      expect(stats.errorsBySeverity['error']).toBe(2);
      expect(stats.errorsBySeverity['critical']).toBe(1);
      expect(stats.errorsBySeverity['warning']).toBe(1);
    });
  });

  describe('exportLogs', () => {
    it('should export errors as JSON', async () => {
      const { addError, exportLogs } = useErrorStore.getState();

      addError({ type: 'TEST_ERROR', severity: 'error', message: 'Test error' });

      const json = await exportLogs();
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].message).toBe('Test error');
    });
  });

  // M35 — FIFO eviction order tests
  describe('FIFO eviction order (M35)', () => {
    it('evicts oldest errors first when history exceeds maxHistorySize', () => {
      const { addError } = useErrorStore.getState();

      // Add exactly 100 unique errors (fills up to capacity)
      for (let i = 0; i < 100; i++) {
        addError({ type: `UNIQUE_ERROR_${i}`, severity: 'info', message: `Error ${i}` });
      }

      // The store prepends new errors (newest first), so the oldest is at the END
      const errorsBefore = useErrorStore.getState().errors;
      const oldestId = errorsBefore[errorsBefore.length - 1]?.id;
      expect(oldestId).toBeDefined();

      // Add one more to push past the cap — oldest should be evicted
      addError({ type: 'NEW_ERROR', severity: 'info', message: 'Newest error' });

      const errorsAfter = useErrorStore.getState().errors;

      // Total count should remain at or below 100
      expect(errorsAfter.length).toBeLessThanOrEqual(100);

      // The oldest error should no longer be present
      const oldestStillExists = errorsAfter.some((e) => e.id === oldestId);
      expect(oldestStillExists).toBe(false);
    });

    it('retains the newest error after eviction', () => {
      const { addError } = useErrorStore.getState();

      // Fill up to capacity
      for (let i = 0; i < 100; i++) {
        addError({ type: `E_${i}`, severity: 'info', message: `Error ${i}` });
      }

      // Add the newest error that should survive
      addError({ type: 'NEWEST', severity: 'error', message: 'I should survive eviction' });

      const errors = useErrorStore.getState().errors;
      const newestExists = errors.some((e) => e.message === 'I should survive eviction');
      expect(newestExists).toBe(true);
    });

    it('evicts in FIFO order — second-oldest is evicted before newest', () => {
      const { addError } = useErrorStore.getState();

      // Add 100 errors so the store is at capacity
      for (let i = 0; i < 100; i++) {
        addError({ type: `BASE_${i}`, severity: 'info', message: `Base error ${i}` });
      }

      // The store prepends (newest first), so the second-oldest is at index [length - 2]
      const at100 = useErrorStore.getState().errors;
      const secondOldestId = at100[at100.length - 2]?.id;
      expect(secondOldestId).toBeDefined();

      // Adding 2 more should evict the last two items (oldest, then second-oldest)
      addError({ type: 'EXTRA_1', severity: 'info', message: 'Extra 1' });
      addError({ type: 'EXTRA_2', severity: 'info', message: 'Extra 2' });

      const final = useErrorStore.getState().errors;
      const secondOldestStillExists = final.some((e) => e.id === secondOldestId);
      expect(secondOldestStillExists).toBe(false);
    });

    it('evicted error IDs are distinct from retained error IDs', () => {
      const { addError } = useErrorStore.getState();

      // Overflow the store by 5 entries
      for (let i = 0; i < 105; i++) {
        addError({ type: `ID_TEST_${i}`, severity: 'info', message: `Error ${i}` });
      }

      const errors = useErrorStore.getState().errors;
      const ids = errors.map((e) => e.id);
      const uniqueIds = new Set(ids);

      // All remaining IDs should be unique (no duplicates from eviction logic)
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('toast queue also respects FIFO when full', () => {
      const { addError } = useErrorStore.getState();

      // Add enough distinct errors to overflow toast queue (max 5)
      for (let i = 0; i < 7; i++) {
        addError({ type: `TOAST_${i}`, severity: 'error', message: `Toast error ${i}` });
      }

      const toasts = useErrorStore.getState().toasts;
      expect(toasts.length).toBeLessThanOrEqual(5);

      // The newest toast should be present (most recently added)
      const newestToast = toasts.find((t) => t.message === 'Toast error 6');
      expect(newestToast).toBeDefined();

      // FIFO eviction: the oldest toast (0) should have been evicted first
      const oldestToast = toasts.find((t) => t.message === 'Toast error 0');
      expect(oldestToast).toBeUndefined();
    });
  });
});
