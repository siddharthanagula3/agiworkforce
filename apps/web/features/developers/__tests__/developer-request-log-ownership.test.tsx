import React, { StrictMode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEVELOPER_REQUEST_LOGS_PATH,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  MANAGED_CLOUD_WORKSPACES_PATH,
  type DeveloperRequestLog,
  type DeveloperRequestLogPage,
  type ManagedCloudAccountWorkspaces,
} from '@agiworkforce/cloud-contracts';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  beginWorkspaceSwitch,
  finishWorkspaceSwitch,
  observeWorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';
import {
  useDeveloperRequestLogs,
  type RequestLogFetcher,
} from '../hooks/use-developer-request-logs';

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
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('@features/auth/step-up-fetch', () => ({ sendAuthorizedJson: vi.fn() }));

const personal: ManagedCloudAccountWorkspaces = {
  scope: 'personal',
  activeWorkspaceId: 'personal',
  activeOrganizationId: null,
  workspaces: [],
};
const organizationId = '0190a000-0000-4000-8000-0000000000e1';
const organization: ManagedCloudAccountWorkspaces = {
  scope: 'organization',
  activeWorkspaceId: 'team',
  activeOrganizationId: organizationId,
  workspaces: [
    {
      id: 'team',
      kind: 'organization',
      organizationId,
      name: 'Team',
      slug: 'team',
      isPrimary: false,
      role: 'member',
    },
  ],
};
const oldCursor = '2026-10-19T10:00:00.000Z';
const freshCursor = '2026-10-20T10:00:00.000Z';
function log(name: string): DeveloperRequestLog {
  return {
    id: '0190a000-0000-7000-8000-0000000000d1',
    createdAt: oldCursor,
    apiKeyName: name,
    apiKeyPrefix: null,
    status: 'completed',
    model: 'auto',
    servedModel: null,
    errorCode: null,
    credits: 1,
    inputTokens: 1,
    outputTokens: 1,
    reasoningTokens: null,
    cacheReadTokens: null,
    webSearchRequests: null,
    webFetchRequests: null,
    codeExecutionRuns: null,
    steps: [],
  };
}
const page = (name: string, nextBefore: string | null = null): DeveloperRequestLogPage => ({
  logs: [log(name)],
  nextBefore,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function changeIdentity(userId: string, sessionId: string) {
  fixture.auth = { isLoaded: true, isSignedIn: true, userId, sessionId };
  fixture.sdk.loaded = true;
  fixture.sdk.user = { id: userId };
  fixture.sdk.session = {
    id: sessionId,
    user: { id: userId },
    getToken: async () => `token-${userId}`,
  };
}
const fetchMock = vi.fn<typeof fetch>();
const logReads = () =>
  fetchMock.mock.calls.filter(([path]) => String(path).startsWith(DEVELOPER_REQUEST_LOGS_PATH));
let workspaceData: ManagedCloudAccountWorkspaces;
let client: QueryClient;
let releaseAdmission: (() => void) | undefined;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const strictWrapper = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  </StrictMode>
);
function useLogHarness(fetchLogs?: RequestLogFetcher) {
  const capture = useSessionSnapshot();
  return { ...useDeveloperRequestLogs(fetchLogs), capture };
}
beforeEach(() => {
  observeWorkspaceOwner(null);
  changeIdentity('a', 'session-a');
  workspaceData = personal;
  releaseAdmission = undefined;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  fetchMock.mockReset().mockImplementation(async (path) => {
    if (String(path) === MANAGED_CLOUD_WORKSPACES_PATH) return json(workspaceData);
    if (String(path).startsWith(DEVELOPER_REQUEST_LOGS_PATH))
      return json(page('initial', oldCursor));
    throw new Error(`Unexpected network request: ${String(path)}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  releaseAdmission?.();
  client.clear();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

describe('developer request log ownership', () => {
  it('does not read logs until the workspace response is admitted', async () => {
    const admission = deferred<Response>();
    fetchMock.mockReturnValueOnce(admission.promise);
    const { result } = renderHook(() => useLogHarness(), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(logReads()).toHaveLength(0);
    expect(result.current.logs).toBeNull();
    await act(async () => admission.resolve(json(personal)));
    await waitFor(() => expect(result.current.logs?.[0]?.apiKeyName).toBe('initial'));
    expect(logReads()).toHaveLength(1);
  });

  it.each(['loading', 'signed-out', 'mismatched-sdk'] as const)(
    'makes no network reads for %s identity',
    async (state) => {
      if (state === 'loading') fixture.auth.isLoaded = false;
      if (state === 'signed-out') fixture.auth.isSignedIn = false;
      if (state === 'mismatched-sdk') fixture.sdk.user = { id: 'other' };
      const { result } = renderHook(() => useLogHarness(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.logs).toBeNull();
      expect(result.current.nextBefore).toBeNull();
    },
  );

  it.each([personal, organization])(
    'sends explicit $scope selectors with captured authorization',
    async (scope) => {
      workspaceData = scope;
      const { result } = renderHook(() => useLogHarness(), { wrapper });
      await waitFor(() => expect(result.current.logs).not.toBeNull());
      const [path, init] = logReads()[0]!;
      expect(path).toBe(DEVELOPER_REQUEST_LOGS_PATH);
      expect(new Headers(init?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
        scope.activeOrganizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      );
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-a');
      expect(init).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'omit' });
      act(() => result.current.loadMore());
      await waitFor(() => expect(logReads()).toHaveLength(2));
      expect(logReads()[1]![0]).toBe(
        `${DEVELOPER_REQUEST_LOGS_PATH}?before=${encodeURIComponent(oldCursor)}`,
      );
    },
  );

  it.each(['account', 'session'] as const)(
    'blocks pending-token dispatch after %s replacement before rerender',
    async (replacement) => {
      const token = deferred<string | null>();
      const getToken = vi
        .fn<() => Promise<string | null>>()
        .mockResolvedValueOnce('workspace-token')
        .mockReturnValueOnce(token.promise);
      fixture.sdk.session.getToken = getToken;
      const { result, rerender } = renderHook(() => useLogHarness(), { wrapper });
      await waitFor(() => expect(getToken).toHaveBeenCalledTimes(2));
      changeIdentity(replacement === 'account' ? 'b' : 'a', 'replacement-session');
      await act(async () => token.resolve('retired-token'));
      expect(logReads()).toHaveLength(0);
      act(() => rerender());
      await waitFor(() => expect(result.current.logs).not.toBeNull());
      expect(logReads()).toHaveLength(1);
      expect(new Headers(logReads()[0]![1]?.headers).get('Authorization')).toBe(
        replacement === 'account' ? 'Bearer token-b' : 'Bearer token-a',
      );
      expect(result.current.error).toBeNull();
    },
  );

  it.each(['account', 'session', 'workspace'] as const)(
    'masks the old page and ignores late success/error bodies across %s changes',
    async (replacement) => {
      for (const status of [200, 503]) {
        const oldBody = deferred<unknown>();
        const parsing = deferred<void>();
        const fresh = deferred<Response>();
        const { result, rerender, unmount } = renderHook(() => useLogHarness(), { wrapper });
        await waitFor(() => expect(result.current.logs).not.toBeNull());
        const oldLoadMore = result.current.loadMore;
        const oldRetry = result.current.retry;
        const countBefore = logReads().length;
        fetchMock.mockImplementation(async (path) => {
          if (String(path) === MANAGED_CLOUD_WORKSPACES_PATH) return json(workspaceData);
          if (String(path).includes('?before='))
            return {
              ok: status === 200,
              status,
              json: () => {
                parsing.resolve();
                return oldBody.promise;
              },
            } as Response;
          return fresh.promise;
        });
        act(() => result.current.loadMore());
        await parsing.promise;
        expect(result.current.loadingMore).toBe(true);
        let completeSwitch: (() => void) | undefined;
        act(() => {
          if (replacement === 'workspace') {
            const owner = observeWorkspaceOwner(result.current.capture())!;
            const epoch = beginWorkspaceSwitch(owner, owner.epoch);
            completeSwitch = () => finishWorkspaceSwitch(owner, epoch, false);
            releaseAdmission = () => finishWorkspaceSwitch(owner, owner.epoch, false);
          } else {
            changeIdentity(replacement === 'account' ? `b-${status}` : 'a', `session-${status}`);
            rerender();
          }
        });
        expect(result.current.logs).toBeNull();
        expect(result.current.nextBefore).toBeNull();
        expect(result.current.loadingMore).toBe(false);
        act(() => {
          oldLoadMore();
          oldRetry();
        });
        if (completeSwitch) {
          workspaceData = personal;
          act(() => completeSwitch!());
        }
        await waitFor(() => expect(logReads()).toHaveLength(countBefore + 2));
        expect(logReads().at(-1)![0]).toBe(DEVELOPER_REQUEST_LOGS_PATH);
        await act(async () =>
          oldBody.resolve(status === 200 ? page('retired', oldCursor) : { error: 'retired error' }),
        );
        expect(result.current.logs).toBeNull();
        expect(result.current.error).toBeNull();
        await act(async () => fresh.resolve(json(page('fresh', freshCursor))));
        await waitFor(() => expect(result.current.logs?.[0]?.apiKeyName).toBe('fresh'));
        expect(result.current.nextBefore).toBe(freshCursor);
        expect(result.current.error).toBeNull();
        unmount();
        client.clear();
        observeWorkspaceOwner(null);
        changeIdentity('a', 'session-a');
        workspaceData = personal;
        fetchMock.mockImplementation(async (path) =>
          String(path) === MANAGED_CLOUD_WORKSPACES_PATH
            ? json(workspaceData)
            : json(page('initial', oldCursor)),
        );
      }
    },
  );

  it('keeps a changed-scope recovery blocked until reload instead of re-admitting logs', async () => {
    const { result, unmount } = renderHook(() => useLogHarness(), { wrapper });
    await waitFor(() => expect(result.current.logs).not.toBeNull());
    const staleLoadMore = result.current.loadMore;
    const staleRetry = result.current.retry;
    const owner = observeWorkspaceOwner(result.current.capture())!;
    let epoch!: number;
    releaseAdmission = () => finishWorkspaceSwitch(owner, owner.epoch, false);
    act(() => {
      epoch = beginWorkspaceSwitch(owner, owner.epoch);
    });
    expect(result.current.logs).toBeNull();
    expect(result.current.nextBefore).toBeNull();
    workspaceData = organization;
    act(() => finishWorkspaceSwitch(owner, epoch, false));
    await waitFor(() => expect(result.current.requiresReload).toBe(true));
    expect(result.current.isUnavailable).toBe(true);
    expect(result.current.logs).toBeNull();
    expect(result.current.error).toBeNull();
    act(() => {
      staleLoadMore();
      staleRetry();
      result.current.retry();
      result.current.loadMore();
    });
    expect(logReads()).toHaveLength(1);
    unmount();
    releaseAdmission();
    releaseAdmission = undefined;
  });

  it('serializes overlapping pagination and rejects callbacks retained from a previous page', async () => {
    const older = deferred<DeveloperRequestLogPage>();
    const fetchLogs = vi
      .fn<RequestLogFetcher>()
      .mockResolvedValueOnce(page('first', oldCursor))
      .mockReturnValueOnce(older.promise)
      .mockResolvedValue(page('third'));
    const { result } = renderHook(() => useLogHarness(fetchLogs), { wrapper });
    await waitFor(() => expect(result.current.logs).not.toBeNull());
    const staleLoadMore = result.current.loadMore;
    const staleRetry = result.current.retry;
    act(() => {
      staleLoadMore();
      staleLoadMore();
      staleRetry();
    });
    expect(fetchLogs).toHaveBeenCalledTimes(2);
    expect(result.current.loadingMore).toBe(true);
    await act(async () => older.resolve(page('second', freshCursor)));
    expect(result.current.logs?.map((row) => row.apiKeyName)).toEqual(['first', 'second']);
    act(() => {
      staleLoadMore();
      staleRetry();
    });
    expect(fetchLogs).toHaveBeenCalledTimes(2);
    act(() => result.current.loadMore());
    await waitFor(() => expect(fetchLogs).toHaveBeenCalledTimes(3));
    expect(fetchLogs.mock.calls[2]![0]).toBe(freshCursor);
  });

  it('rejects pre-error callbacks even when failed pagination retains the same page object', async () => {
    const older = deferred<DeveloperRequestLogPage>();
    const fetchLogs = vi
      .fn<RequestLogFetcher>()
      .mockResolvedValueOnce(page('first', oldCursor))
      .mockReturnValueOnce(older.promise)
      .mockResolvedValue(page('recovered', freshCursor));
    const { result } = renderHook(() => useLogHarness(fetchLogs), { wrapper });
    await waitFor(() => expect(result.current.logs).not.toBeNull());
    const staleLoadMore = result.current.loadMore;
    const staleRetry = result.current.retry;
    const originalLogs = result.current.logs;
    act(() => staleLoadMore());
    await act(async () => older.reject(new Error('Pagination temporarily failed')));
    expect(result.current.error).toBeTruthy();
    expect(result.current.logs).toBe(originalLogs);
    expect(result.current.nextBefore).toBeNull();
    expect(result.current.loadingMore).toBe(false);
    act(() => {
      staleLoadMore();
      staleRetry();
    });
    expect(fetchLogs).toHaveBeenCalledTimes(2);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.logs?.[0]?.apiKeyName).toBe('recovered'));
    expect(fetchLogs).toHaveBeenCalledTimes(3);
    expect(fetchLogs.mock.calls[2]![0]).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it.each(['resolve', 'reject'] as const)(
    'retires a replaced source and unmounted request on late %s',
    async (outcome) => {
      const old = deferred<DeveloperRequestLogPage>();
      const next = deferred<DeveloperRequestLogPage>();
      const firstSource = vi.fn<RequestLogFetcher>().mockReturnValue(old.promise);
      const nextSource = vi.fn<RequestLogFetcher>().mockReturnValue(next.promise);
      const { result, rerender, unmount } = renderHook(({ source }) => useLogHarness(source), {
        wrapper,
        initialProps: { source: firstSource },
      });
      await waitFor(() => expect(firstSource).toHaveBeenCalledTimes(1));
      const retired = firstSource.mock.calls[0]![1].request;
      rerender({ source: nextSource });
      await waitFor(() => expect(nextSource).toHaveBeenCalledTimes(1));
      expect(retired.signal.aborted).toBe(true);
      await act(async () => {
        if (outcome === 'resolve') old.resolve(page('retired'));
        else old.reject(new Error('retired source failed'));
      });
      expect(result.current.logs).toBeNull();
      expect(result.current.error).toBeNull();
      const active = nextSource.mock.calls[0]![1].request;
      unmount();
      expect(active.signal.aborted).toBe(true);
      await act(async () => {
        if (outcome === 'resolve') next.resolve(page('unmounted'));
        else next.reject(new Error('unmounted source failed'));
      });
      expect(nextSource).toHaveBeenCalledTimes(1);
    },
  );

  it('survives StrictMode replay with a fresh authority and no stale settlement', async () => {
    const admission = renderHook(() => useAccountWorkspaces(), { wrapper });
    await waitFor(() => expect(admission.result.current.data).toBeDefined());
    const pending: ReturnType<typeof deferred<DeveloperRequestLogPage>>[] = [];
    const fetchLogs = vi.fn<RequestLogFetcher>(() => {
      const request = deferred<DeveloperRequestLogPage>();
      pending.push(request);
      return request.promise;
    });
    const { result } = renderHook(() => useLogHarness(fetchLogs), { wrapper: strictWrapper });
    await waitFor(() => expect(fetchLogs).toHaveBeenCalledTimes(2));
    expect(fetchLogs.mock.calls[0]![1].request.signal.aborted).toBe(true);
    expect(fetchLogs.mock.calls[1]![1].request.signal.aborted).toBe(false);
    await act(async () => pending[0]!.resolve(page('replayed-old', oldCursor)));
    expect(result.current.logs).toBeNull();
    expect(result.current.error).toBeNull();
    await act(async () => pending[1]!.resolve(page('replayed-current', freshCursor)));
    expect(result.current.logs?.[0]?.apiKeyName).toBe('replayed-current');
    expect(result.current.nextBefore).toBe(freshCursor);
  });

  it('publishes current HTTP errors and retries from the first page with a fresh authority', async () => {
    let failures = 1;
    fetchMock.mockImplementation(async (path) => {
      if (String(path) === MANAGED_CLOUD_WORKSPACES_PATH) return json(personal);
      return failures-- > 0
        ? json({ error: 'Temporarily unavailable' }, 503)
        : json(page('recovered'));
    });
    const { result } = renderHook(() => useLogHarness(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.logs).toBeNull();
    expect(result.current.nextBefore).toBeNull();
    const failedSignal = logReads()[0]![1]?.signal;
    expect(failedSignal?.aborted).toBe(true);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.logs?.[0]?.apiKeyName).toBe('recovered'));
    expect(result.current.error).toBeNull();
    expect(logReads()).toHaveLength(2);
    expect(logReads()[1]![0]).toBe(DEVELOPER_REQUEST_LOGS_PATH);
    expect(logReads()[1]![1]?.signal).not.toBe(failedSignal);
  });
});
