import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_PENDING_ACCOUNT_DELETION } from '@agiworkforce/cloud-contracts';
import { queryKeys } from '@shared/stores/query-client';
import { TimeoutPresets } from '@shared/lib/error-utils';
import {
  isAccountDeletionSnapshotCurrent,
  permitsAccountDeletionAction,
  useAccountDeletionStatus,
} from './use-account-deletion-status';
import {
  useCancelAccountDeletion,
  type AccountDeletionCancellationIntent,
} from './use-cancel-account-deletion';

const native = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    auth: { isLoaded: true, isSignedIn: true, userId: 'native-a', sessionId: 'session-a' },
    listeners,
    sdk: {
      loaded: true,
      user: { id: 'native-a' },
      session: {
        id: 'session-a',
        user: { id: 'native-a' },
        getToken: vi.fn(async () => 'token-a'),
      },
      addListener: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
});
vi.mock('@clerk/nextjs', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => native.auth,
  useClerk: () => native.sdk,
}));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client/csrf')>()),
  addCsrfHeaders: async (headers: HeadersInit) => headers,
}));

const prefix = queryKeys.settings.accountDeletionStatus();
const pending = {
  cancellationPrecondition: 'schedule-pair-v1' as const,
  pending: true,
  canCancel: true,
  requestedAt: null,
  scheduledFor: '2026-11-08T12:00:00.000Z',
};
const json = (body: unknown) => new Response(JSON.stringify(body));
const fetchMock = vi.fn<typeof fetch>();
let client: QueryClient;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function switchSession(userId = 'native-a', sessionId = 'session-a') {
  native.auth = { isLoaded: true, isSignedIn: true, userId, sessionId };
  native.sdk.user = { id: userId };
  native.sdk.session = {
    id: sessionId,
    user: { id: userId },
    getToken: vi.fn(async () => `token-${userId}`),
  };
  for (const notify of [...native.listeners]) notify();
}
function provider(strict = false) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {strict ? <StrictMode>{children}</StrictMode> : children}
      </QueryClientProvider>
    );
  };
}
function useHarness(active = true) {
  return {
    reader: useAccountDeletionStatus(active),
    cancellation: useCancelAccountDeletion(active),
  };
}
function successfulQueries() {
  return client
    .getQueryCache()
    .findAll({ queryKey: prefix })
    .filter((query) => query.queryKey.length > prefix.length && query.state.status === 'success');
}
beforeEach(() => {
  native.listeners.clear();
  switchSession();
  client = new QueryClient({
    defaultOptions: { queries: { retry: 3, retryDelay: 1 }, mutations: { retry: 3 } },
  });
  fetchMock
    .mockReset()
    .mockImplementation(async (_input, init) =>
      json(
        init?.method === 'PUT'
          ? { message: 'Account deletion cancelled.', cancelled: true }
          : pending,
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  client.clear();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('native-session owned deletion status and admissions (UNRUN)', () => {
  it('keeps one owner/key over ordinary rerenders and never adopts a global product-account cache', async () => {
    client.setQueryData(prefix, NO_PENDING_ACCOUNT_DELETION);
    const hook = renderHook(() => useHarness(), { wrapper: provider() });
    await waitFor(() =>
      expect(permitsAccountDeletionAction(hook.result.current.reader.snapshot, 'cancel')).toBe(
        true,
      ),
    );
    const snapshot = hook.result.current.reader.snapshot!;
    const key = successfulQueries()[0]!.queryKey;
    for (let count = 0; count < 5; count += 1) hook.rerender();
    expect(hook.result.current.reader.snapshot).toBe(snapshot);
    expect(successfulQueries()[0]!.queryKey).toBe(key);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1];
    expect(init?.method).toBe('GET');
    expect(init?.cache).toBe('no-store');
    expect(init?.credentials).toBe('omit');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-native-a');
    expect(key[prefix.length]).toBe('native-a');
    expect(key).not.toContain('mapped-product-account');
    let intent!: AccountDeletionCancellationIntent;
    act(() => {
      intent = hook.result.current.cancellation.begin(snapshot)!;
    });
    expect(intent.canConfirm()).toBe(true);
    expect(client.getQueryData(prefix)).toEqual(NO_PENDING_ACCOUNT_DELETION);
  });

  it.each(['other-account', 'new-session', 'replacement-object'] as const)(
    'retires the original owner synchronously on %s and does not revive on A → B → A',
    async (change) => {
      const hook = renderHook(() => useHarness(), { wrapper: provider() });
      await waitFor(() => expect(hook.result.current.reader.data).toEqual(pending));
      const old = hook.result.current.reader.snapshot!;
      const retry = hook.result.current.reader.refetch;
      const sessionA = native.sdk.session;
      let intent!: AccountDeletionCancellationIntent;
      act(() => {
        intent = hook.result.current.cancellation.begin(old)!;
      });
      act(() => {
        switchSession(
          change === 'other-account' ? 'native-b' : 'native-a',
          change === 'replacement-object' ? 'session-a' : 'session-b',
        );
        expect(isAccountDeletionSnapshotCurrent(old)).toBe(false);
        expect(intent.isCurrent()).toBe(false);
        native.sdk.session = sessionA;
        native.sdk.user = { id: 'native-a' };
        native.auth = {
          isLoaded: true,
          isSignedIn: true,
          userId: 'native-a',
          sessionId: 'session-a',
        };
        for (const notify of [...native.listeners]) notify();
      });
      await waitFor(() => expect(hook.result.current.reader.snapshot).not.toBe(old));
      await waitFor(() => expect(hook.result.current.reader.data).toEqual(pending));
      const calls = fetchMock.mock.calls.length;
      await act(async () => {
        await retry();
        intent.confirm();
      });
      expect(fetchMock).toHaveBeenCalledTimes(calls);
      expect(permitsAccountDeletionAction(old, 'cancel')).toBe(false);
      expect(hook.result.current.cancellation.begin(old)).toBeNull();
    },
  );

  it.each(['headers', 'body', 'token'] as const)(
    'rejects retired A work delayed at %s without publishing into B',
    async (stage) => {
      const headers = deferred<Response>();
      const body = deferred<unknown>();
      const token = deferred<string>();
      if (stage === 'token') native.sdk.session.getToken.mockReturnValue(token.promise);
      else
        fetchMock.mockImplementationOnce(() =>
          stage === 'headers'
            ? headers.promise
            : Promise.resolve({ ok: true, json: () => body.promise } as Response),
        );
      const hook = renderHook(() => useHarness(), { wrapper: provider() });
      await waitFor(() => expect(native.sdk.session.getToken).toHaveBeenCalled());
      if (stage !== 'token') await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const oldSignal = fetchMock.mock.calls[0]?.[1]?.signal;
      fetchMock.mockImplementation(async () => json(NO_PENDING_ACCOUNT_DELETION));
      act(() => switchSession('native-b', 'session-b'));
      if (oldSignal) expect(oldSignal.aborted).toBe(true);
      await waitFor(() =>
        expect(hook.result.current.reader.data).toEqual(NO_PENDING_ACCOUNT_DELETION),
      );
      await act(async () => {
        headers.resolve(json(pending));
        body.resolve(pending);
        token.resolve('old-token');
      });
      expect(hook.result.current.reader.data).toEqual(NO_PENDING_ACCOUNT_DELETION);
      expect(permitsAccountDeletionAction(hook.result.current.reader.snapshot, 'schedule')).toBe(
        true,
      );
      expect(
        successfulQueries().every((query) => query.queryKey[prefix.length] === 'native-b'),
      ).toBe(true);
    },
  );

  it('isolates two mounted readers and reconciles only the original key with GET, never cancellation replay', async () => {
    const first = renderHook(() => useHarness(), { wrapper: provider() });
    const second = renderHook(() => useHarness(), { wrapper: provider() });
    await waitFor(() => expect(successfulQueries()).toHaveLength(2));
    const firstKey = successfulQueries()[0]!.queryKey;
    const secondQuery = successfulQueries()[1]!;
    const secondState = secondQuery.state;
    let intent!: AccountDeletionCancellationIntent;
    act(() => {
      intent = first.result.current.cancellation.begin(first.result.current.reader.snapshot)!;
    });
    const receipt = deferred<Response>();
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === 'PUT' ? receipt.promise : json(NO_PENDING_ACCOUNT_DELETION),
    );
    act(() => intent.confirm());
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1),
    );
    act(() => client.setQueryData(firstKey, client.getQueryData(firstKey), { updatedAt: 10 }));
    await act(async () =>
      receipt.resolve(json({ message: 'Account deletion cancelled.', cancelled: true })),
    );
    await waitFor(() => expect(first.result.current.cancellation.needsStatusCheck).toBe(true));
    await act(async () => intent.checkCurrentStatus());
    expect(first.result.current.reader.data).toEqual(NO_PENDING_ACCOUNT_DELETION);
    expect(second.result.current.reader.data).toEqual(pending);
    expect(secondQuery.state).toBe(secondState);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'GET')).toHaveLength(3);
    first.unmount();
    expect(permitsAccountDeletionAction(second.result.current.reader.snapshot, 'cancel')).toBe(
      true,
    );
  });

  it('does not automatically retry malformed reads and retires the explicit Retry handle on close', async () => {
    fetchMock.mockImplementation(async () => json({ ...pending, scheduledFor: 'invalid' }));
    const hook = renderHook(({ active }) => useHarness(active), {
      initialProps: { active: true },
      wrapper: provider(),
    });
    await waitFor(() => expect(hook.result.current.reader.isError).toBe(true));
    const retry = hook.result.current.reader.refetch;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const query = client
      .getQueryCache()
      .findAll({ queryKey: prefix })
      .find((entry) => entry.state.status === 'error')!;
    expect(query.options.retry).toBe(false);
    expect(query.options.gcTime).toBe(0);
    expect(hook.result.current.reader.snapshot).toBeNull();
    fetchMock.mockImplementation(async () => json(pending));
    await act(async () => retry());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const old = hook.result.current.reader.snapshot!;
    hook.rerender({ active: false });
    expect(hook.result.current.reader.data).toBeUndefined();
    hook.rerender({ active: true });
    await waitFor(() => expect(hook.result.current.reader.data).toEqual(pending));
    const calls = fetchMock.mock.calls.length;
    await act(async () => retry());
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(isAccountDeletionSnapshotCurrent(old)).toBe(false);
  });

  it.each(['query-cancel', 'timeout', 'modal-close'] as const)(
    'aborts pending bodies on %s and never admits them later',
    async (cause) => {
      const timeout = new AbortController();
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
      const body = deferred<unknown>();
      fetchMock.mockImplementation(
        async () => ({ ok: true, json: () => body.promise }) as Response,
      );
      const hook = renderHook(({ active }) => useHarness(active), {
        initialProps: { active: true },
        wrapper: provider(),
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(timeoutSpy).toHaveBeenCalledWith(TimeoutPresets.FAST);
      const signal = fetchMock.mock.calls[0]![1]!.signal!;
      if (cause === 'query-cancel')
        await act(async () => {
          await client.cancelQueries({ queryKey: prefix });
        });
      else if (cause === 'timeout') act(() => timeout.abort());
      else hook.rerender({ active: false });
      expect(signal.aborted).toBe(true);
      await act(async () => body.resolve(pending));
      expect(hook.result.current.reader.data).toBeUndefined();
      expect(hook.result.current.reader.snapshot).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('closing one of two pending readers aborts only its private request (UNRUN)', async () => {
    const firstResponse = deferred<Response>();
    const secondResponse = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    const first = renderHook(() => useHarness(), { wrapper: provider() });
    const second = renderHook(() => useHarness(), { wrapper: provider() });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    first.unmount();
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(fetchMock.mock.calls[1]![1]!.signal!.aborted).toBe(false);
    await act(async () => {
      firstResponse.resolve(json(NO_PENDING_ACCOUNT_DELETION));
      secondResponse.resolve(json(pending));
    });
    await waitFor(() => expect(second.result.current.reader.data).toEqual(pending));
    expect(permitsAccountDeletionAction(second.result.current.reader.snapshot, 'cancel')).toBe(
      true,
    );
  });

  it('uses fresh StrictMode setup generations and cannot reuse a closed reader snapshot', async () => {
    const hook = renderHook(({ active }) => useHarness(active), {
      initialProps: { active: true },
      wrapper: provider(true),
    });
    await waitFor(() => expect(hook.result.current.reader.data).toEqual(pending));
    const old = hook.result.current.reader.snapshot!;
    const key = successfulQueries()[0]!.queryKey;
    expect(key.at(-1)).toBeGreaterThan(1);
    hook.rerender({ active: false });
    hook.rerender({ active: true });
    await waitFor(() => expect(hook.result.current.reader.data).toEqual(pending));
    expect(successfulQueries().at(-1)!.queryKey).not.toEqual(key);
    expect(hook.result.current.cancellation.begin(old)).toBeNull();
  });
});
