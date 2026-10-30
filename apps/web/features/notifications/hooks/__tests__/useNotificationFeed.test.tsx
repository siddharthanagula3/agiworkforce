import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNotificationFeed } from '../use-notification-feed';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('optional notification refresh', () => {
  it('makes one initial request during an idle hour and refreshes once on interaction', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const request = vi.fn(
      async () => new Response(JSON.stringify({ notifications: [], unreadCount: 0 })),
    );
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => useNotificationFeed(true));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60_000);
    });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => {
      document.dispatchEvent(new Event('pointerdown'));
    });
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => {
      await result.current.refresh();
    });
    expect(request).toHaveBeenCalledTimes(3);
  });
});
