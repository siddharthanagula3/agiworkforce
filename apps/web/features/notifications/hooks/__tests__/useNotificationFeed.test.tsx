import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNotificationFeed } from '../use-notification-feed';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  getCsrfToken: vi.fn(async () => 'csrf-token'),
}));

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

describe('rejected mark-all-read', () => {
  const item = (id: string) => ({
    id,
    category: 'research',
    severity: 'success',
    title: id,
    message: '',
    href: null,
    read: false,
    createdAt: new Date().toISOString(),
  });

  it('keeps a feed accepted while the write was in flight', async () => {
    const older = { notifications: [item('n-1')], unreadCount: 1 };
    const newer = { notifications: [item('n-2'), item('n-1')], unreadCount: 2 };
    let rejectWrite: (response: Response) => void = () => undefined;
    let reads = 0;
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return new Promise<Response>((resolve) => {
          rejectWrite = resolve;
        });
      }
      reads += 1;
      return new Response(JSON.stringify(reads === 1 ? older : newer));
    });
    vi.stubGlobal('fetch', request);

    const { result } = renderHook(() => useNotificationFeed(true));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.unreadCount).toBe(1);

    let outcome: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      outcome = result.current.markAllRead();
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.unreadCount).toBe(2);

    await act(async () => {
      rejectWrite(new Response(null, { status: 500 }));
      await outcome;
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    expect(result.current.notifications.map((entry) => entry.id)).toEqual(['n-2', 'n-1']);
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
