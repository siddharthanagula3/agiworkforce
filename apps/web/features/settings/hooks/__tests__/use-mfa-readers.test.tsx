import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager, onlineManager, type Query } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import { useMfaRequirement, useMfaStatus, WORKSPACE_MFA_REQUIREMENT_QUERY_KEY } from '../use-mfa-readers';

const fixture = vi.hoisted(() => ({
  session: null as SessionAuthority | null,
  listeners: new Set<() => void>(),
}));
vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/identity/useSessionSnapshot')>(),
  useSessionSnapshot: () => () => fixture.session,
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function session(userId = 'a', sessionId = 'session-a') {
  let retired = false;
  const candidate: SessionAuthority = {
    userId, sessionId,
    isCurrent: () => { if (fixture.session !== candidate) retired = true; return !retired; },
    getToken: vi.fn(async () => `token-${userId}`),
    subscribe: (listener) => { fixture.listeners.add(listener); return () => { fixture.listeners.delete(listener); }; },
  };
  fixture.session = candidate;
  return candidate;
}
function notify() { for (const listener of [...fixture.listeners]) listener(); }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const statusBody = { enabled: true, backup_codes_ready: true, enrollment_available: true };
const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
function provider(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 3, staleTime: 300_000 } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{strict ? <StrictMode>{children}</StrictMode> : children}</QueryClientProvider>
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
    await act(async () => { await client.invalidateQueries({ queryKey: WORKSPACE_MFA_REQUIREMENT_QUERY_KEY }); });
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
    act(() => { session('b', 'session-b'); notify(); });
    await waitFor(() => expect(view.result.current.data).toBe(false));
    await act(async () => { token.resolve('old-token'); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Authorization')).toBe('Bearer token-b');
  });

  it('drops a pending body and reconciles silent owner loss at settlement', async () => {
    const body = deferred<unknown>();
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => body.promise } as Response)
      .mockResolvedValue(json({ required: false }));
    const { wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => { session('b', 'session-b'); body.resolve({ required: true }); });
    await waitFor(() => expect(view.result.current.data).toBe(false));
  });

  it('keeps ready/error subscriptions and does not reuse an A to B to A cache', async () => {
    fetchMock.mockResolvedValueOnce(json({ required: true }))
      .mockResolvedValueOnce(json({}, 500)).mockResolvedValue(json({ required: false }));
    const { wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    act(() => { session('b', 'session-b'); notify(); });
    await waitFor(() => expect(view.result.current.error).not.toBeNull());
    expect(view.result.current.data).toBeUndefined();
    act(() => { session(); notify(); });
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
    await act(async () => { two.resolve(json({ required: true })); one.resolve(json({ required: false })); });
    await waitFor(() => expect(second.result.current.data).toBe(true));
  });

  it('rejects malformed and failed status reads without fallback or automatic retry', async () => {
    fetchMock.mockResolvedValueOnce(json({ ...statusBody, enabled: 'yes' }));
    const { client, wrapper } = provider();
    const view = renderHook(useMfaStatus, { wrapper });
    await waitFor(() => expect(view.result.current.error).not.toBeNull());
    expect(view.result.current.data).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const query = client.getQueryCache().getAll().find((entry) => entry.queryKey[1] === 'two-factor-status');
    expect(query?.options.retry).toBe(false);
    fetchMock.mockResolvedValue(json({}, 503));
    await act(async () => { await client.invalidateQueries({ queryKey: ['settings', 'two-factor-status'] }); });
    expect(view.result.current.data).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('masks previously ready data after a failed background refresh', async () => {
    fetchMock.mockResolvedValueOnce(json(statusBody)).mockResolvedValue(json({}, 500));
    const { client, wrapper } = provider();
    const view = renderHook(useMfaStatus, { wrapper });
    await waitFor(() => expect(view.result.current.data?.enrollmentAvailable).toBe(true));
    await act(async () => { await client.invalidateQueries({ queryKey: ['settings', 'two-factor-status'] }); });
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
    await act(async () => { token.resolve('captured-token'); });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(fixture.listeners.size).toBe(0);
  });

  it('replaces the reader when a new session object has the same user and session identifiers', async () => {
    fetchMock.mockResolvedValueOnce(json({ required: true })).mockResolvedValue(json({ required: false }));
    const { wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    const original = fixture.session!;
    act(() => { session(original.userId, original.sessionId); notify(); });
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
    act(() => { session(); view.rerender(); });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    act(() => { fixture.session = null; notify(); });
    expect(view.result.current.data).toBeUndefined();
    expect(view.result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not settle a delayed fetch from the first A incarnation into a later A incarnation', async () => {
    const firstResponse = deferred<Response>();
    fetchMock.mockReturnValueOnce(firstResponse.promise)
      .mockResolvedValueOnce(json({ required: true }))
      .mockResolvedValue(json({ required: false }));
    const { wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const oldSignal = fetchMock.mock.calls[0]![1]?.signal;
    act(() => { session('b', 'session-b'); notify(); });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    act(() => { session(); notify(); });
    await waitFor(() => expect(view.result.current.data).toBe(false));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { firstResponse.resolve(json({ required: true })); });
    expect(view.result.current.data).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('refuses a retained retired query on manual refetch, focus and reconnect without reacquiring tokens', async () => {
    fetchMock.mockResolvedValue(json({ required: true }));
    const original = fixture.session!;
    const { client, wrapper } = provider();
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    const oldQuery = client.getQueryCache().getAll().find((entry) =>
      entry.queryKey[2] === 'workspace-requirement' && entry.state.data === true);
    expect(oldQuery).toBeDefined();
    const tokenCalls = vi.mocked(original.getToken).mock.calls.length;
    act(() => { fixture.session = null; notify(); });
    await act(async () => { await expect(oldQuery!.fetch()).rejects.toMatchObject({ name: 'AbortError' }); });
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
      if (event.type === 'added' && event.query.queryKey[2] === 'workspace-requirement' &&
          event.query.queryKey.at(-1) == null && !beforeActivation) beforeActivation = event.query;
    });
    const view = renderHook(useMfaRequirement, { wrapper });
    await waitFor(() => expect(view.result.current.data).toBe(true));
    expect(beforeActivation).toBeDefined();
    const live = client.getQueryCache().getAll().find((entry) => entry.state.data === true);
    expect(live).toBeDefined();
    const original = fixture.session!;
    const tokenCalls = vi.mocked(original.getToken).mock.calls.length;
    await act(async () => { await expect(beforeActivation!.fetch()).rejects.toMatchObject({ name: 'AbortError' }); });
    expect(view.result.current.data).toBe(true);
    view.unmount();
    await act(async () => { await expect(live!.fetch()).rejects.toMatchObject({ name: 'AbortError' }); });
    expect(original.getToken).toHaveBeenCalledTimes(tokenCalls);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stop();
  });

});
