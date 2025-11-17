// Updated Nov 16, 2025: Added proper cleanup in beforeEach and afterEach
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import useErrorStore from '../stores/errorStore';

describe('errorStore', () => {
  beforeEach(() => {
    // Reset store before each test to prevent test pollution
    useErrorStore.setState({
      errors: [],
      toasts: [],
    });
  });

  afterEach(() => {
    // Clear all errors and toasts after each test
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

      // Add first error
      addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Connection failed',
      });

      // Add duplicate error immediately
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

      // Add more than maxHistorySize errors
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

      // Add more than maxToasts errors
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

      // Add multiple errors
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
});
