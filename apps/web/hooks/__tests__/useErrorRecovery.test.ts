import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useErrorRecovery } from '../useErrorRecovery';

describe('useErrorRecovery', () => {
  it('should initialize with no error', () => {
    const { result } = renderHook(() => useErrorRecovery());

    expect(result.current.error).toBeNull();
    expect(result.current.isRecovering).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('should handle and log errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useErrorRecovery({
        onError,
        showToast: false,
      }),
    );

    act(() => {
      result.current.handleError(new Error('Test error'));
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.message).toBe('Test error');
    expect(onError).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should handle string errors', () => {
    const { result } = renderHook(() =>
      useErrorRecovery({
        showToast: false,
      }),
    );

    act(() => {
      result.current.handleError('String error');
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.message).toBe('String error');
  });

  it('should reset error state', () => {
    const { result } = renderHook(() =>
      useErrorRecovery({
        showToast: false,
      }),
    );

    act(() => {
      result.current.handleError(new Error('Test error'));
    });

    expect(result.current.error).toBeTruthy();

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.retryCount).toBe(0);
    expect(result.current.isRecovering).toBe(false);
  });

  it('should retry on failure', async () => {
    const { result } = renderHook(() =>
      useErrorRecovery({
        maxRetries: 2,
        retryDelay: 10,
        showToast: false,
      }),
    );

    const failingFn = vi.fn().mockRejectedValue(new Error('Retry test'));

    await act(async () => {
      await result.current.retry(failingFn);
    });

    expect(result.current.retryCount).toBe(1);
    expect(result.current.error).toBeTruthy();
  });

  it('should succeed on retry', async () => {
    const { result } = renderHook(() =>
      useErrorRecovery({
        maxRetries: 3,
        retryDelay: 10,
        showToast: false,
      }),
    );

    const successFn = vi.fn().mockResolvedValue(undefined);

    // Set initial error
    act(() => {
      result.current.handleError(new Error('Initial error'));
    });

    expect(result.current.error).toBeTruthy();

    // Retry should succeed
    await act(async () => {
      await result.current.retry(successFn);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.retryCount).toBe(0);
  });

  it('should respect max retries limit', async () => {
    const { result } = renderHook(() =>
      useErrorRecovery({
        maxRetries: 1,
        retryDelay: 10,
        showToast: false,
      }),
    );

    const failingFn = vi.fn().mockRejectedValue(new Error('Fail'));

    // First retry
    await act(async () => {
      await result.current.retry(failingFn);
    });

    expect(result.current.retryCount).toBe(1);

    // Second retry should fail (max retries exceeded)
    await act(async () => {
      await result.current.retry(failingFn);
    });

    expect(result.current.retryCount).toBe(1); // Should not increment beyond first retry
  });
});
