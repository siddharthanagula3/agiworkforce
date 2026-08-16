
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsMounted } from '../useIsMounted';

describe('useIsMounted', () => {
  it('returns a ref with current=true while the component is mounted', () => {
    const { result } = renderHook(() => useIsMounted());
    expect(result.current.current).toBe(true);
  });

  it('sets ref.current=false after unmount', () => {
    const { result, unmount } = renderHook(() => useIsMounted());
    expect(result.current.current).toBe(true);
    unmount();
    expect(result.current.current).toBe(false);
  });

  it('the ref is stable across rerenders (referential identity)', () => {
    const { result, rerender } = renderHook(() => useIsMounted());
    const firstRef = result.current;
    rerender();
    expect(result.current).toBe(firstRef);
  });
});
