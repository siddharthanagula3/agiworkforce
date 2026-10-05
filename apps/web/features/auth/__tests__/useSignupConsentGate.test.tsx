import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useSignupConsentGate } from '../useSignupConsentGate';

describe('the sign-up consent gate', () => {
  it('runs nothing and refuses until the box is confirmed', () => {
    const { result } = renderHook(() => useSignupConsentGate(true));
    const attempt = vi.fn();
    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.append(box);
    result.current.checkboxRef.current = box;

    let admitted = true;
    act(() => {
      admitted = result.current.admit(attempt);
    });

    expect(admitted).toBe(false);
    expect(attempt).not.toHaveBeenCalled();
    expect(result.current.refused).toBe(true);
    expect(document.activeElement).toBe(box);

    act(() => result.current.confirm(true));
    expect(result.current.refused).toBe(false);

    act(() => {
      admitted = result.current.admit(attempt);
    });
    expect(admitted).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(1);
    box.remove();
  });

  it('is open when the screen does not require consent', () => {
    const { result } = renderHook(() => useSignupConsentGate(false));
    const attempt = vi.fn();

    let admitted = false;
    act(() => {
      admitted = result.current.admit(attempt);
    });

    expect(admitted).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(result.current.refused).toBe(false);
  });

  it('starts unconfirmed on every mount', () => {
    const first = renderHook(() => useSignupConsentGate(true));
    act(() => first.result.current.confirm(true));
    first.unmount();

    const second = renderHook(() => useSignupConsentGate(true));
    expect(second.result.current.confirmed).toBe(false);
  });
});
