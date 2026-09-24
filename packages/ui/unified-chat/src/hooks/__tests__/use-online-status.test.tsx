import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useOnlineStatus } from '../use-online-status';

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

afterEach(() => {
  setOnline(true);
});

describe('useOnlineStatus', () => {
  it('tracks offline and reconnect events', () => {
    setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => setOnline(false));
    expect(result.current).toBe(false);

    act(() => setOnline(true));
    expect(result.current).toBe(true);
  });
});
