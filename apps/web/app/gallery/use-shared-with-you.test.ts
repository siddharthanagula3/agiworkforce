import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const session = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true as boolean,
  getToken: vi.fn(async () => 'session-token'),
}));

vi.mock('@/lib/identity/client', () => ({
  useSession: () => session,
}));

const { useSharedWithYou } = await import('./use-shared-with-you');

function item(token: string) {
  return { token, title: token, kind: 'html', updatedAt: '2026-10-20T10:00:00.000Z' };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

describe('useSharedWithYou', () => {
  beforeEach(() => {
    session.isSignedIn = true;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads nothing for a signed-out visitor', async () => {
    session.isSignedIn = false;
    const { result } = renderHook(() => useSharedWithYou());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the first page with the session token and appends the next one', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ items: [item('a'), item('b')], nextCursor: 'c1', emailVerified: true }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [item('b'), item('c')], nextCursor: null, emailVerified: true }),
      );
    const { result } = renderHook(() => useSharedWithYou());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/artifacts/shared-with-me');
    expect(init.headers).toEqual({ Authorization: 'Bearer session-token' });
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items.map((i) => i.token)).toEqual(['a', 'b', 'c']));
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/artifacts/shared-with-me?cursor=c1');
    expect(result.current.hasMore).toBe(false);
  });

  it('reports an unverified email and a failed read', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [], nextCursor: null, emailVerified: false }),
    );
    const first = renderHook(() => useSharedWithYou());
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    expect(first.result.current.emailVerified).toBe(false);
    first.unmount();

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    const second = renderHook(() => useSharedWithYou());
    await waitFor(() => expect(second.result.current.loaded).toBe(true));
    expect(second.result.current.error).toEqual(expect.any(String));
    expect(second.result.current.items).toEqual([]);
  });
});
