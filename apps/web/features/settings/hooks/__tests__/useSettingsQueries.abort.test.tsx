import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { MANAGED_CLOUD_WORKSPACES_PATH } from '@agiworkforce/cloud-contracts';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import { observeWorkspaceOwner } from '@/features/workspaces/lib/workspace-admission';
import { TimeoutPresets } from '@shared/lib/error-utils';
import { queryKeys } from '@shared/stores/query-client';
import { useAPIKeys } from '../use-settings-queries';

const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: {
      id: 'session-a',
      user: { id: 'a' },
      getToken: async (): Promise<string | null> => 'token-a',
    },
  },
  loggerError: vi.fn(),
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('@shared/lib/logger', () => ({
  logger: { error: fixture.loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const path = '/api/settings/api-keys';
const personal = {
  scope: 'personal',
  activeWorkspaceId: 'personal',
  activeOrganizationId: null,
  workspaces: [],
};
const keys = [
  {
    id: 'current',
    name: 'Current',
    key_prefix: 'agi_',
    scopes: [],
    created_at: '2026-10-20T00:00:00.000Z',
  },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function changeIdentity(userId: string) {
  fixture.auth = { isLoaded: true, isSignedIn: true, userId, sessionId: `session-${userId}` };
  fixture.sdk.user = { id: userId };
  fixture.sdk.session = {
    id: `session-${userId}`,
    user: { id: userId },
    getToken: async () => `token-${userId}`,
  };
}
const fetchMock = vi.fn<typeof fetch>();
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const reads = () => fetchMock.mock.calls.filter(([url]) => String(url) === path);
async function admit() {
  const admission = renderHook(() => useAccountWorkspaces(), { wrapper });
  await waitFor(() => expect(admission.result.current.data).toEqual(personal));
}
beforeEach(() => {
  observeWorkspaceOwner(null);
  changeIdentity('a');
  fixture.loggerError.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) => {
    if (String(url) === MANAGED_CLOUD_WORKSPACES_PATH) return json(personal);
    if (String(url) === path) return json({ api_keys: keys });
    throw new Error(`Unexpected request: ${String(url)}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  client.clear();
  observeWorkspaceOwner(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useAPIKeys cancellation through the real service and request authority', () => {
  it('does not log a caller abort flattened by the service', async () => {
    await admit();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('signal is aborted without reason', 'AbortError'));
            },
            { once: true },
          );
        }),
    );
    const hook = renderHook(() => useAPIKeys(), { wrapper });
    await waitFor(() => expect(reads()).toHaveLength(1));
    const signal = reads()[0]![1]?.signal;
    await act(async () => hook.unmount());
    expect(signal?.aborted).toBe(true);
    expect(fixture.loggerError).not.toHaveBeenCalled();
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: queryKeys.settings.apiKeys() })
        .every((query) => query.state.data === undefined),
    ).toBe(true);
  });

  it.each(['token', 'body'] as const)(
    'does not log or publish an obsolete deferred %s',
    async (stage) => {
      await admit();
      const token = deferred<string | null>();
      const body = deferred<unknown>();
      const parsing = vi.fn(() => body.promise);
      const getToken = vi.fn<() => Promise<string | null>>().mockReturnValue(token.promise);
      if (stage === 'token') fixture.sdk.session.getToken = getToken;
      else
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: parsing,
        } as unknown as Response);
      const { result, rerender } = renderHook(() => useAPIKeys(), { wrapper });
      await waitFor(() => expect(stage === 'token' ? getToken : parsing).toHaveBeenCalledOnce());
      act(() => {
        changeIdentity('b');
        rerender();
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await act(async () => {
        token.resolve('retired-token');
        body.resolve({ api_keys: [{ ...keys[0], id: 'retired' }] });
      });
      expect(result.current.data).toEqual(keys);
      expect(fixture.loggerError).not.toHaveBeenCalled();
      expect(
        client
          .getQueryCache()
          .findAll({ queryKey: queryKeys.settings.apiKeys() })
          .some((query) => JSON.stringify(query.state.data)?.includes('retired')),
      ).toBe(false);
      expect(reads()).toHaveLength(stage === 'token' ? 1 : 2);
    },
  );

  it('still logs a current HTTP failure', async () => {
    await admit();
    fetchMock.mockResolvedValueOnce(json({ error: 'Unavailable' }, 503));
    const { result } = renderHook(() => useAPIKeys(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fixture.loggerError).toHaveBeenCalledExactlyOnceWith(
      '[SettingsQuery] API keys error:',
      'HTTP 503',
    );
  });

  it.each(['token', 'body'] as const)(
    'bounds a deferred %s with the FAST deadline',
    async (stage) => {
      await admit();
      const timeout = new AbortController();
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
      const token = deferred<string | null>();
      const body = deferred<unknown>();
      const parsing = vi.fn(() => body.promise);
      const getToken = vi.fn<() => Promise<string | null>>().mockReturnValue(token.promise);
      if (stage === 'token') fixture.sdk.session.getToken = getToken;
      else
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: parsing,
        } as unknown as Response);
      vi.useFakeTimers();
      const { result } = renderHook(() => useAPIKeys(), { wrapper });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(stage === 'token' ? getToken : parsing).toHaveBeenCalledOnce();
      expect(timeoutSpy).toHaveBeenCalledWith(TimeoutPresets.FAST);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(TimeoutPresets.FAST);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(result.current.isError).toBe(true);
      expect(result.current.error?.message).toContain('API keys took too long to load.');
      expect(fixture.loggerError).toHaveBeenCalledTimes(1);
      await act(async () => {
        token.resolve('late-token');
        body.resolve({ api_keys: keys });
      });
      expect(reads()).toHaveLength(stage === 'token' ? 0 : 1);
      expect(result.current.data).toBeUndefined();
      expect(fixture.loggerError).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects a successful body that resolves after the transport deadline', async () => {
    await admit();
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    const body = deferred<unknown>();
    const parsing = vi.fn(() => body.promise);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: parsing,
    } as unknown as Response);
    const { result } = renderHook(() => useAPIKeys(), { wrapper });
    await waitFor(() => expect(parsing).toHaveBeenCalledOnce());
    await act(async () => {
      timeout.abort(new DOMException('Timed out', 'TimeoutError'));
      body.resolve({ api_keys: keys });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(reads()[0]![1]?.signal?.aborted).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(fixture.loggerError).toHaveBeenCalledExactlyOnceWith(
      '[SettingsQuery] API keys error:',
      'API keys took too long to load. Please try again.',
    );
  });
});
