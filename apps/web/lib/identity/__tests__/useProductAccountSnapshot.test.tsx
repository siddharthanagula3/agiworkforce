import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useProductAccountSnapshot } from '../useProductAccountSnapshot';

const initialAuthState = useAuthStore.getState();
function setAccount(id: string | null, name = 'Original') {
  useAuthStore.setState({ user: id ? { id, name, email: `${id}@example.com` } : null });
}
beforeEach(() => setAccount('product-a'));
afterEach(() => {
  cleanup();
  useAuthStore.setState(initialAuthState, true);
});

describe('product account snapshot ownership', () => {
  it('captures only the current product store ID and does not equate it with a native subject', () => {
    const { result } = renderHook(() => useProductAccountSnapshot());
    expect(result.current(null)).toBeNull();
    expect(result.current('native-a')).toBeNull();
    expect(result.current('product-b')).toBeNull();
    expect(result.current('product-a')?.accountId).toBe('product-a');
    expect(result.current('product-a')?.isCurrent()).toBe(true);
  });

  it('latches synchronous A/B/A before React renders even if no consumer reads B', () => {
    const { result } = renderHook(() => useProductAccountSnapshot());
    const owner = result.current('product-a')!;
    const readCurrent = vi.fn(owner.isCurrent);
    act(() => {
      setAccount('product-b');
      setAccount('product-a');
      expect(readCurrent()).toBe(false);
    });
    expect(readCurrent).toHaveBeenCalledOnce();
    expect(owner.isCurrent()).toBe(false);
    expect(result.current('product-a')?.isCurrent()).toBe(true);
  });

  it('notifies and retires its subscribed authority synchronously at the first account change', () => {
    const { result } = renderHook(() => useProductAccountSnapshot());
    const owner = result.current('product-a')!;
    const states: boolean[] = [];
    const listener = vi.fn(() => states.push(owner.isCurrent()));
    const stop = owner.subscribe(listener);
    act(() => {
      setAccount('product-b');
      expect(states).toEqual([false]);
      setAccount('product-a');
      expect(states).toEqual([false, false]);
    });
    stop();
    act(() => setAccount('product-c'));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(owner.isCurrent()).toBe(false);
  });

  it('retires sign-out and restoration while preserving a same-account metadata update', () => {
    const { result } = renderHook(() => useProductAccountSnapshot());
    const owner = result.current('product-a')!;
    act(() => setAccount('product-a', 'Updated name'));
    expect(owner.isCurrent()).toBe(true);
    act(() => {
      setAccount(null);
      setAccount('product-a', 'Returned name');
    });
    expect(owner.isCurrent()).toBe(false);
    expect(result.current('product-a')?.isCurrent()).toBe(true);
  });

  it('does not let a replacement capture restore an earlier authority', () => {
    const { result } = renderHook(() => useProductAccountSnapshot());
    const a = result.current('product-a')!;
    act(() => setAccount('product-b'));
    const b = result.current('product-b')!;
    act(() => setAccount('product-a'));
    const replacement = result.current('product-a')!;
    expect(a.isCurrent()).toBe(false);
    expect(b.isCurrent()).toBe(false);
    expect(replacement.isCurrent()).toBe(true);
  });
});
