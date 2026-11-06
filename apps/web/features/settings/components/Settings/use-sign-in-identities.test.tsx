import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const identity = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'sa' },
  sdk: { loaded: true, user: { id: 'a' }, session: null as null | { id: string; user: { id: string }; getToken: () => Promise<string | null> }, addListener: vi.fn() },
  listeners: new Set<() => void>(),
}));
vi.mock('@clerk/nextjs', async (importOriginal) => ({
  ...await importOriginal<typeof import('@clerk/nextjs')>(),
  useAuth: () => identity.auth, useClerk: () => identity.sdk,
}));
import { signInIdentitiesSchema, useSignInIdentities } from './use-sign-in-identities';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const payload = () => ({ identities: [], providers: [{ id: 'google', label: 'Google' }], consequence: 'You cannot sign in with it.' });
function switchSession(userId = 'b', sessionId = 'sb') {
  identity.auth = { isLoaded: true, isSignedIn: true, userId, sessionId };
  identity.sdk.user = { id: userId };
  identity.sdk.session = { id: sessionId, user: { id: userId }, getToken: vi.fn(async () => `token-${userId}`) };
}
beforeEach(() => {
  identity.listeners.clear();
  identity.sdk.loaded = true;
  identity.sdk.addListener.mockImplementation((listener: () => void) => {
    identity.listeners.add(listener);
    return () => identity.listeners.delete(listener);
  });
  switchSession('a', 'sa');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload())));
});
afterEach(() => vi.unstubAllGlobals());

describe('sign-in identities read ownership', () => {
  it('survives strict effect cleanup and replay without admitting retired work', async () => {
    const { result } = renderHook(() => useSignInIdentities(), {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(identity.listeners.size).toBe(1);
    act(() => result.current.reload());
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  it('uses captured bearer transport without cookies, CSRF or workspace headers', async () => {
    const { result, rerender } = renderHook(() => useSignInIdentities());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const init = vi.mocked(fetch).mock.calls[0]![1]!;
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store' });
    expect(Array.from(new Headers(init.headers).entries())).toEqual([['authorization', 'Bearer token-a']]);
    rerender();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(identity.listeners.size).toBe(1);
  });

  it.each([['b', 'sb'], ['a', 'sa-new']])('replaces owner %s / %s and rejects obsolete reload', async (user, session) => {
    const { result, rerender } = renderHook(() => useSignInIdentities());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const oldReload = result.current.reload;
    act(() => { switchSession(user, session); rerender(); });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    act(() => oldReload());
    expect(fetch).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.data).not.toBeNull());
  });

  it('retires A through SDK-only B then A even before a React auth update', async () => {
    const { result } = renderHook(() => useSignInIdentities());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const reload = result.current.reload;
    const original = identity.sdk.session;
    act(() => {
      identity.sdk.session = { id: 'sb', user: { id: 'b' }, getToken: async () => 'token-b' };
      identity.sdk.user = { id: 'b' };
      identity.listeners.forEach((listener) => listener());
      identity.sdk.session = original;
      identity.sdk.user = { id: 'a' };
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    act(() => reload());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not dispatch after a deferred captured token loses its owner', async () => {
    const token = deferred<string | null>();
    identity.sdk.session!.getToken = () => token.promise;
    const { result, rerender } = renderHook(() => useSignInIdentities());
    act(() => { switchSession(); rerender(); });
    await act(async () => token.resolve('token-a'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new Headers(vi.mocked(fetch).mock.calls[0]![1]!.headers).get('authorization')).toBe('Bearer token-b');
  });

  it.each(['response', 'json', 'error'])('ignores obsolete deferred %s completion', async (stage) => {
    const pending = deferred<Response>();
    const body = deferred<unknown>();
    vi.mocked(fetch).mockImplementationOnce(() => stage === 'json'
      ? Promise.resolve({ ok: true, json: () => body.promise } as Response) : pending.promise);
    const { result, rerender } = renderHook(() => useSignInIdentities());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    act(() => { switchSession(); rerender(); });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => {
      if (stage === 'error') pending.reject(new Error('Old account failure'));
      else if (stage === 'json') body.resolve({ ...payload(), providers: [{ id: 'github', label: 'Old account' }] });
      else pending.resolve(Response.json({ ...payload(), providers: [{ id: 'github', label: 'Old account' }] }));
    });
    expect(result.current.data?.providers[0]?.label).toBe('Google');
    expect(result.current.error).toBeNull();
  });

  it('retires the old ready view synchronously on reload and ignores stale JSON', async () => {
    const body = deferred<unknown>();
    const { result } = renderHook(() => useSignInIdentities());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    vi.mocked(fetch).mockImplementationOnce(async () => ({ ok: true, json: () => body.promise }) as Response);
    act(() => result.current.reload());
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => body.resolve(null));
    expect(result.current.error).toBeNull();
  });

  it('aborts and unsubscribes on unmount; retained reload is inert', async () => {
    const body = deferred<unknown>();
    vi.mocked(fetch).mockImplementationOnce(async () => ({ ok: true, json: () => body.promise }) as Response);
    const { result, unmount } = renderHook(() => useSignInIdentities());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const reload = result.current.reload;
    const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(identity.listeners.size).toBe(0);
    await act(async () => { reload(); body.reject(new Error('late')); });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the ready-state subscription live and hides data on SDK sign-out', async () => {
    const { result } = renderHook(() => useSignInIdentities());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    act(() => {
      identity.sdk.session = null;
      identity.listeners.forEach((listener) => listener());
    });
    expect(result.current.data).toBeNull();
    expect(result.current.ownerId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('does not transfer a prior read error into a replacement owner', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('failure'));
    const next = deferred<Response>();
    const { result, rerender } = renderHook(() => useSignInIdentities());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    vi.mocked(fetch).mockImplementationOnce(() => next.promise);
    act(() => { switchSession(); rerender(); });
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
    await act(async () => next.resolve(Response.json({ ...payload(), providers: [] })));
    await waitFor(() => expect(result.current.data?.providers).toEqual([]));
  });

  it('fails closed for malformed JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ providers: null }));
    const { result } = renderHook(() => useSignInIdentities());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.data).toBeNull();
  });
});

describe('identities payload schema', () => {
  const linked = () => ({ id: '00000000-0000-4000-8000-000000000001', provider: 'backend-provider', creationSource: 'future-source', createdAt: '2026-01-01T00:00:00.000Z', lastAuthenticatedAt: null, removable: true });
  it('accepts empty identities/providers and backend identity provenance', () => {
    expect(signInIdentitiesSchema.safeParse({ ...payload(), providers: [] }).success).toBe(true);
    expect(signInIdentitiesSchema.safeParse({ ...payload(), identities: [linked()] }).success).toBe(true);
  });
  it.each([
    { id: 'invalid' }, { provider: null }, { creationSource: null }, { createdAt: 'yesterday' },
    { lastAuthenticatedAt: false }, { removable: 'true' },
  ])('rejects malformed identity fields %j', (patch) => {
    expect(signInIdentitiesSchema.safeParse({ ...payload(), identities: [{ ...linked(), ...patch }] }).success).toBe(false);
  });
  it('rejects duplicates, unknown OAuth providers and missing consequence', () => {
    expect(signInIdentitiesSchema.safeParse({ ...payload(), identities: [linked(), linked()] }).success).toBe(false);
    expect(signInIdentitiesSchema.safeParse({ ...payload(), providers: [...payload().providers, ...payload().providers] }).success).toBe(false);
    expect(signInIdentitiesSchema.safeParse({ ...payload(), providers: [{ id: 'unknown', label: 'Unknown' }] }).success).toBe(false);
    expect(signInIdentitiesSchema.safeParse({ ...payload(), consequence: '' }).success).toBe(false);
  });
});
