import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
  type Query,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@shared/stores/query-client';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import {
  invalidateMfaReaders,
  useMfaRequirement,
  useMfaStatus,
  WORKSPACE_MFA_REQUIREMENT_QUERY_KEY,
} from '../use-mfa-readers';

const fixture = vi.hoisted(() => ({
  session: null as SessionAuthority | null,
  listeners: new Set<() => void>(),
}));
vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useSessionSnapshot: () => () => fixture.session,
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function session(userId = 'a', sessionId = 'session-a') {
  let retired = false;
  const candidate: SessionAuthority = {
    userId,
    sessionId,
    isCurrent: () => {
      if (fixture.session !== candidate) retired = true;
      return !retired;
    },
    getToken: vi.fn(async () => `token-${userId}`),
    subscribe: (listener) => {
      fixture.listeners.add(listener);
      return () => {
        fixture.listeners.delete(listener);
      };
    },
  };
  fixture.session = candidate;
  return candidate;
}
function notify() {
  for (const listener of [...fixture.listeners]) listener();
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const statusBody = { enabled: true, backup_codes_ready: true, enrollment_available: true };
const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
function provider(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 3, staleTime: 300_000 } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      {strict ? <StrictMode>{children}</StrictMode> : children}
    </QueryClientProvider>
  );
  return { client, wrapper };
}
beforeEach(() => {
  fixture.listeners.clear();
  session();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('account/session owned MFA readers (source-authored fixtures)', () => {
  it('uses captured bearer transport without cookies or workspace headers and preserves prefix invalidation', async () => {
    fetchMock.mockResolvedValue(json({ required: true }));
    const { client, wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.credentials).toBe('omit');
    expect(init?.cache).toBe('no-store');
    expect([...new Headers(init?.headers)]).toEqual([['authorization', 'Bearer token-a']]);
    fetchMock.mockResolvedValue(json({ required: false }));
    await act(async () => {
      await client.invalidateQueries({ queryKey: WORKSPACE_MFA_REQUIREMENT_QUERY_KEY });
    });
    await waitFor(() => expect(view.result.current.data).toBe(false));
  });

  it('drops a pending token after owner replacement without dispatching it', async () => {
    const token = deferred<string | null>();
    const old = fixture.session!;
    vi.mocked(old.getToken).mockReturnValue(token.promise);
    fetchMock.mockResolvedValue(json({ required: false }));
    const { wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(old.getToken).toHaveBeenCalled());
    act(() => {
      session('b', 'session-b');
      notify();
    });
    await waitFor(() => expect(view.result.current.data).toBe(false));
    await act(async () => {
      token.resolve('old-token');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Authorization')).toBe(
      'Bearer token-b',
    );
  });

  it('drops a pending body and reconciles silent owner loss at settlement', async () => {
    const body = deferred<unknown>();
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => body.promise } as Response)
      .mockResolvedValue(json({ required: false }));
    const { wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      session('b', 'session-b');
      body.resolve({ required: true });
    });
    await waitFor(() => expect(view.result.current.data).toBe(false));
  });

  it('keeps ready/error subscriptions and does not reuse an A to B to A cache', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ required: true }))
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValue(json({ required: false }));
    const { wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    act(() => {
      session('b', 'session-b');
      notify();
    });
    await waitFor(() => expect(view.result.current.error).not.toBeNull());
    expect(view.result.current.data).toBeUndefined();
    act(() => {
      session();
      notify();
    });
    await waitFor(() => expect(view.result.current.data).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not share promises or abort another mounted observer during cleanup', async () => {
    const one = deferred<Response>();
    const two = deferred<Response>();
    fetchMock.mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise);
    const { wrapper } = provider();
    const first = renderHook(useMfaRequirement, { wrapper });
    const second = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const firstSignal = fetchMock.mock.calls[0]![1]?.signal;
    const secondSignal = fetchMock.mock.calls[1]![1]?.signal;
    first.unmount();
    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);
    await act(async () => {
      two.resolve(json({ required: true }));
      one.resolve(json({ required: false }));
    });
    await waitFor(() => expect(second.result.current.data).toBe(true));
  });

  it('rejects malformed and failed status reads without fallback or automatic retry', async () => {
    fetchMock.mockResolvedValueOnce(json({ ...statusBody, enabled: 'yes' }));
    const { client, wrapper } = provider();
    const view = renderHook(useMfaStatus, { wrapper });
    await waitFor(() => expect(view.result.current.error).not.toBeNull());
    expect(view.result.current.data).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const query = client
      .getQueryCache()
      .getAll()
      .find((entry) => entry.queryKey[1] === 'two-factor-status');
    expect(query?.options.retry).toBe(false);
    fetchMock.mockResolvedValue(json({}, 503));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['settings', 'two-factor-status'] });
    });
    expect(view.result.current.data).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('masks previously ready data after a failed background refresh', async () => {
    fetchMock.mockResolvedValueOnce(json(statusBody)).mockResolvedValue(json({}, 500));
    const { client, wrapper } = provider();
    const view = renderHook(useMfaStatus, { wrapper });
    await waitFor(() => expect(view.result.current.data?.enrollmentAvailable).toBe(true));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['settings', 'two-factor-status'] });
    });
    await waitFor(() => expect(view.result.current.data).toBeUndefined());
  });

  it('settles live StrictMode generations and releases observation on unmount', async () => {
    const token = deferred<string | null>();
    const old = fixture.session!;
    vi.mocked(old.getToken).mockReturnValue(token.promise);
    fetchMock.mockResolvedValue(json({ required: true }));
    const { wrapper } = provider(true);
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(old.getToken).toHaveBeenCalled());
    await act(async () => {
      token.resolve('captured-token');
    });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(fixture.listeners.size).toBe(0);
  });

  it('replaces the reader when a new session object has the same user and session identifiers', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ required: true }))
      .mockResolvedValue(json({ required: false }));
    const { wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    const original = fixture.session!;
    act(() => {
      session(original.userId, original.sessionId);
      notify();
    });
    await waitFor(() => expect(view.result.current.data).toBe(false));
    expect(fixture.session).not.toBe(original);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('admits no request without identity and removes ready data when identity disappears', async () => {
    fixture.session = null;
    fetchMock.mockResolvedValue(json({ required: true }));
    const { wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    expect(view.result.current.data).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => {
      session();
      view.rerender();
    });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    act(() => {
      fixture.session = null;
      notify();
    });
    expect(view.result.current.data).toBeUndefined();
    expect(view.result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not settle a delayed fetch from the first A incarnation into a later A incarnation', async () => {
    const firstResponse = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(firstResponse.promise)
      .mockResolvedValueOnce(json({ required: true }))
      .mockResolvedValue(json({ required: false }));
    const { wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const oldSignal = fetchMock.mock.calls[0]![1]?.signal;
    act(() => {
      session('b', 'session-b');
      notify();
    });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    act(() => {
      session();
      notify();
    });
    await waitFor(() => expect(view.result.current.data).toBe(false));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      firstResponse.resolve(json({ required: true }));
    });
    expect(view.result.current.data).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('refuses a retained retired query on manual refetch, focus and reconnect without reacquiring tokens', async () => {
    fetchMock.mockResolvedValue(json({ required: true }));
    const original = fixture.session!;
    const { client, wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    const oldQuery = client
      .getQueryCache()
      .getAll()
      .find((entry) => entry.queryKey[2] === 'workspace-requirement' && entry.state.data === true);
    expect(oldQuery).toBeDefined();
    const tokenCalls = vi.mocked(original.getToken).mock.calls.length;
    act(() => {
      fixture.session = null;
      notify();
    });
    await act(async () => {
      await expect(oldQuery!.fetch()).rejects.toMatchObject({ name: 'AbortError' });
    });
    await act(async () => {
      focusManager.setFocused(false);
      onlineManager.setOnline(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(true);
    });
    expect(original.getToken).toHaveBeenCalledTimes(tokenCalls);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(view.result.current.data).toBeUndefined();
  });

  it('refuses a captured pre-activation query after StrictMode setup and a captured live query after cleanup', async () => {
    fetchMock.mockResolvedValue(json({ required: true }));
    const { client, wrapper } = provider(true);
    let beforeActivation: Query | undefined;
    const stop = client.getQueryCache().subscribe((event) => {
      if (
        event.type === 'added' &&
        event.query.queryKey[2] === 'workspace-requirement' &&
        event.query.queryKey.at(-1) == null &&
        !beforeActivation
      )
        beforeActivation = event.query;
    });
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    expect(beforeActivation).toBeDefined();
    const live = client
      .getQueryCache()
      .getAll()
      .find((entry) => entry.state.data === true);
    expect(live).toBeDefined();
    const original = fixture.session!;
    const tokenCalls = vi.mocked(original.getToken).mock.calls.length;
    await act(async () => {
      await expect(beforeActivation!.fetch()).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(view.result.current.data).toBe(true);
    view.unmount();
    await act(async () => {
      await expect(live!.fetch()).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(original.getToken).toHaveBeenCalledTimes(tokenCalls);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('TOTP status admission and scoped invalidation (source-authored fixtures)', () => {
  it('does not acquire a token or dispatch while inactive, including retained manual queries', async () => {
    const original = fixture.session!;
    const { client, wrapper } = provider();
    const view = renderHook(() => useMfaStatus(false), { wrapper });
    expect(view.result.current).toEqual({ data: undefined, error: null, isLoading: false });
    const inactive = client
      .getQueryCache()
      .getAll()
      .find((query) => query.queryKey[1] === 'two-factor-status');
    expect(inactive).toBeDefined();
    await act(async () => {
      await expect(inactive!.fetch()).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(original.getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retires a pending token on deactivation and starts a fresh same-session read on reopening', async () => {
    const pending = deferred<string | null>();
    const original = fixture.session!;
    vi.mocked(original.getToken).mockReturnValueOnce(pending.promise);
    fetchMock.mockImplementation(async () => json(statusBody));
    const { wrapper } = provider();
    const view = renderHook(({ active }) => useMfaStatus(active), {
      initialProps: { active: true },
      wrapper,
    });
    await waitFor(() => expect(original.getToken).toHaveBeenCalledTimes(1));
    view.rerender({ active: false });
    expect(view.result.current.data).toBeUndefined();
    await act(async () => {
      pending.resolve('retired-token');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    view.rerender({ active: true });
    await waitFor(() => expect(view.result.current.data?.enabled).toBe(true));
    expect(original.getToken).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Authorization')).toBe(
      'Bearer token-a',
    );
  });

  it('retires a pending body on deactivation without publishing it into the reopened reader', async () => {
    const body = deferred<unknown>();
    const readBody = vi.fn(() => body.promise);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: readBody } as unknown as Response)
      .mockImplementation(async () => json({ ...statusBody, enabled: false }));
    const { wrapper } = provider();
    const view = renderHook(({ active }) => useMfaStatus(active), {
      initialProps: { active: true },
      wrapper,
    });
    await waitFor(() => expect(readBody).toHaveBeenCalled());
    const signal = fetchMock.mock.calls[0]![1]?.signal;
    view.rerender({ active: false });
    expect(signal?.aborted).toBe(true);
    expect(view.result.current).toEqual({ data: undefined, error: null, isLoading: false });
    view.rerender({ active: true });
    await waitFor(() => expect(view.result.current.data?.enabled).toBe(false));
    await act(async () => {
      body.resolve(statusBody);
    });
    expect(view.result.current.data?.enabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses old queries after deactivation, same-session reopening and remount', async () => {
    fetchMock.mockImplementation(async () => json(statusBody));
    const original = fixture.session!;
    const { client, wrapper } = provider();
    const view = renderHook(({ active }) => useMfaStatus(active), {
      initialProps: { active: true },
      wrapper,
    });
    await waitFor(() => expect(view.result.current.data?.enabled).toBe(true));
    const oldQuery = client
      .getQueryCache()
      .getAll()
      .find((query) => query.state.data !== undefined);
    expect(oldQuery).toBeDefined();
    view.rerender({ active: false });
    await act(async () => {
      await expect(oldQuery!.fetch()).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(original.getToken).toHaveBeenCalledTimes(1);
    view.rerender({ active: true });
    await waitFor(() => expect(view.result.current.data?.enabled).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await expect(oldQuery!.fetch()).rejects.toMatchObject({ name: 'AbortError' });
    });
    const reopened = client
      .getQueryCache()
      .getAll()
      .find((query) => query.state.data !== undefined);
    expect(reopened).toBeDefined();
    expect(reopened).not.toBe(oldQuery);
    view.unmount();
    const remounted = renderHook(() => useMfaStatus(), { wrapper });
    await waitFor(() => expect(remounted.result.current.data?.enabled).toBe(true));
    await act(async () => {
      await expect(reopened!.fetch()).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(original.getToken).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('invalidates only existing status and requirement prefixes for the captured native user and session', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const original = fixture.session!;
    invalidateMfaReaders(original);
    expect(invalidate).toHaveBeenCalledTimes(1);
    const predicate = invalidate.mock.calls[0]![0]?.predicate;
    expect(predicate).toBeTypeOf('function');
    const matches = (queryKey: readonly unknown[]) => predicate!({ queryKey } as Query);
    expect(matches(['settings', 'two-factor-status', 'a', 'session-a', 'reader-1', 1, 1])).toBe(
      true,
    );
    expect(
      matches([...WORKSPACE_MFA_REQUIREMENT_QUERY_KEY, 'a', 'session-a', 'reader-2', 2, 4]),
    ).toBe(true);
    for (const key of [
      ['settings', 'two-factor-status', 'b', 'session-a'],
      ['settings', 'two-factor-status', 'a', 'session-b'],
      ['settings', 'two-factor-status'],
      ['settings', 'two-factor-status-extra', 'a', 'session-a'],
      ['settings', 'unrelated', 'a', 'session-a'],
      ['settings', 'two-factor', 'workspace-requirement', 'b', 'session-a'],
      ['settings', 'two-factor', 'workspace-requirement', 'a', 'session-b'],
      ['settings', 'two-factor', 'other', 'a', 'session-a'],
    ])
      expect(matches(key)).toBe(false);
    session('b', 'session-b');
    expect(matches(['settings', 'two-factor-status', 'a', 'session-a'])).toBe(false);
    invalidate.mockClear();
    invalidateMfaReaders(original);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

type ImportedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
