import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  MANAGED_CLOUD_WORKSPACES_PATH,
  type ManagedCloudAccountWorkspaces,
} from '@agiworkforce/cloud-contracts';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  beginWorkspaceSwitch,
  finishWorkspaceSwitch,
  observeWorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';
import { DEVELOPER_PROJECTS_QUERY_KEY, useDeveloperProjects } from '../hooks/use-developer-projects';
import { DEVELOPER_USAGE_QUERY_KEY, useDeveloperUsage } from '../hooks/use-developer-usage';
import type { DeveloperProject, DeveloperUsage } from '../types';

const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  sdk: { loaded: true, user: { id: 'a' }, session: {
    id: 'session-a', user: { id: 'a' }, getToken: async (): Promise<string | null> => 'token-a',
  } },
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('@features/auth/step-up-fetch', () => ({ sendAuthorizedJson: vi.fn() }));

const personal: ManagedCloudAccountWorkspaces = {
  scope: 'personal', activeWorkspaceId: 'personal', activeOrganizationId: null, workspaces: [],
};
const organizationId = '0190a000-0000-4000-8000-0000000000e1';
const organization: ManagedCloudAccountWorkspaces = {
  scope: 'organization', activeWorkspaceId: 'team', activeOrganizationId: organizationId,
  workspaces: [{ id: 'team', kind: 'organization', organizationId,
    name: 'Team', slug: 'team', isPrimary: false, role: 'member' }],
};
function projects(label: string): DeveloperProject[] {
  return [{ id: label, name: label, monthlyCreditLimit: null, archivedAt: null,
    createdAt: '2026-10-20T00:00:00.000Z' }];
}
function usage(label: string): DeveloperUsage {
  return { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z',
    keys: [{ apiKeyId: label, requests: 1, credits: 1, unsettledRequests: 0 }], projects: [] };
}
const subjects = [
  { name: 'projects', path: '/api/developers/projects', key: DEVELOPER_PROJECTS_QUERY_KEY,
    useHook: useDeveloperProjects, data: projects, body: (label: string) => ({ projects: projects(label) }) },
  { name: 'usage', path: '/api/developers/usage', key: DEVELOPER_USAGE_QUERY_KEY,
    useHook: useDeveloperUsage, data: usage, body: usage },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function changeIdentity(userId: string, sessionId: string) {
  fixture.auth = { isLoaded: true, isSignedIn: true, userId, sessionId };
  fixture.sdk.loaded = true;
  fixture.sdk.user = { id: userId };
  fixture.sdk.session = { id: sessionId, user: { id: userId }, getToken: async () => `token-${userId}` };
}
const fetchMock = vi.fn<typeof fetch>();
let client: QueryClient;
let workspaceData: ManagedCloudAccountWorkspaces;
let releaseAdmission: (() => void) | undefined;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  observeWorkspaceOwner(null);
  changeIdentity('a', 'session-a');
  workspaceData = personal;
  releaseAdmission = undefined;
  client = new QueryClient({ defaultOptions: { queries: {
    retry: false, staleTime: Infinity, gcTime: Infinity,
  } } });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  releaseAdmission?.();
  client.clear();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

describe.each(subjects)('developer $name query ownership', (subject) => {
  const reads = () => fetchMock.mock.calls.filter(([path]) => String(path) === subject.path);
  function useHarness() {
    const capture = useSessionSnapshot();
    return { query: subject.useHook(), capture };
  }
  beforeEach(() => {
    fetchMock.mockImplementation(async (path) => {
      if (String(path) === MANAGED_CLOUD_WORKSPACES_PATH) return json(workspaceData);
      if (String(path) === subject.path) return json(subject.body(fixture.auth.userId));
      throw new Error(`Unexpected network request: ${String(path)}`);
    });
  });

  it('waits for workspace admission and exposes only the curated query surface', async () => {
    const admission = deferred<Response>();
    fetchMock.mockReturnValueOnce(admission.promise);
    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(reads()).toHaveLength(0);
    expect(result.current.query.data).toBeUndefined();
    expect(result.current.query.isLoading).toBe(true);
    await act(async () => admission.resolve(json(personal)));
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(Object.keys(result.current.query).sort()).toEqual([
      'data', 'error', 'isError', 'isFetching', 'isLoading', 'isSuccess', 'refetch',
    ].sort());
  });

  it.each([personal, organization])('sends explicit $scope headers through the real request authority', async (scope) => {
    workspaceData = scope;
    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    const [path, init] = reads()[0]!;
    expect(path).toBe(subject.path);
    expect(new Headers(init?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
      scope.activeOrganizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    );
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-a');
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'omit' });
  });

  it.each(['loading', 'signed-out', 'mismatched-sdk'] as const)('does not dispatch for %s identity', async (state) => {
    if (state === 'loading') fixture.auth.isLoaded = false;
    if (state === 'signed-out') fixture.auth.isSignedIn = false;
    if (state === 'mismatched-sdk') fixture.sdk.user = { id: 'other' };
    const { result } = renderHook(useHarness, { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.query.data).toBeUndefined();
    expect(result.current.query.isSuccess).toBe(false);
    await act(async () => result.current.query.refetch());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['returning-account', 'replacement-session'] as const)('isolates fresh caches across A to B and %s', async (replacement) => {
    const { result, rerender } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.query.data).toEqual(subject.data('a')));
    const original = client.getQueryCache().findAll({ queryKey: subject.key })
      .find((query) => query.state.data !== undefined)!;
    const oldRefetch = result.current.query.refetch;
    act(() => { changeIdentity('b', 'session-b'); rerender(); });
    expect(result.current.query.data).toBeUndefined();
    await waitFor(() => expect(result.current.query.data).toEqual(subject.data('b')));
    const fresh = deferred<Response>();
    fetchMock.mockImplementation(async (path) => String(path) === MANAGED_CLOUD_WORKSPACES_PATH
      ? json(personal) : fresh.promise);
    act(() => {
      changeIdentity('a', replacement === 'returning-account' ? 'session-a' : 'session-a-new');
      rerender();
    });
    expect(result.current.query.data).toBeUndefined();
    await waitFor(() => expect(reads()).toHaveLength(3));
    await act(async () => oldRefetch());
    expect(reads()).toHaveLength(3);
    expect(original.state.data).toEqual(subject.data('a'));
    await act(async () => fresh.resolve(json(subject.body('new-a'))));
    await waitFor(() => expect(result.current.query.data).toEqual(subject.data('new-a')));
    expect(original.state.data).toEqual(subject.data('a'));
  });

  it.each(['account', 'session'] as const)('blocks token dispatch after %s replacement before rerender', async (replacement) => {
    const token = deferred<string | null>();
    const getToken = vi.fn<() => Promise<string | null>>()
      .mockResolvedValueOnce('workspace-token').mockReturnValueOnce(token.promise);
    fixture.sdk.session.getToken = getToken;
    const { result, rerender } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(getToken).toHaveBeenCalledTimes(2));
    changeIdentity(replacement === 'account' ? 'b' : 'a', 'new-session');
    await act(async () => token.resolve('retired-token'));
    expect(reads()).toHaveLength(0);
    act(() => rerender());
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(reads()).toHaveLength(1);
    expect(new Headers(reads()[0]![1]?.headers).get('Authorization')).toBe(
      replacement === 'account' ? 'Bearer token-b' : 'Bearer token-a',
    );
  });

  it.each(['response', 'success-body', 'error-body'] as const)('ignores a retired deferred %s', async (stage) => {
    const response = deferred<Response>();
    const body = deferred<unknown>();
    const parsing = deferred<void>();
    const oldResponse = {
      ok: stage !== 'error-body', status: stage === 'error-body' ? 503 : 200,
      json: () => { parsing.resolve(); return body.promise; },
    } as Response;
    fetchMock.mockImplementation(async (path) => String(path) === MANAGED_CLOUD_WORKSPACES_PATH
      ? json(personal) : stage === 'response' ? response.promise : oldResponse);
    const { result, rerender } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(reads()).toHaveLength(1));
    if (stage !== 'response') await parsing.promise;
    const oldSignal = reads()[0]![1]?.signal;
    fetchMock.mockImplementation(async (path) => String(path) === MANAGED_CLOUD_WORKSPACES_PATH
      ? json(personal) : json(subject.body('b')));
    act(() => { changeIdentity('b', 'session-b'); rerender(); });
    expect(result.current.query.data).toBeUndefined();
    expect(oldSignal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.query.data).toEqual(subject.data('b')));
    await act(async () => {
      response.resolve(json(subject.body('retired')));
      body.resolve(stage === 'error-body' ? { error: 'Retired failure' } : subject.body('retired'));
    });
    expect(result.current.query.data).toEqual(subject.data('b'));
    expect(result.current.query.error).toBeNull();
    expect(client.getQueryCache().findAll({ queryKey: subject.key })
      .some((query) => JSON.stringify(query.state.data)?.includes('retired'))).toBe(false);
  });

  it('recovers unavailable admission without reading developer data prematurely', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Unavailable' }, 503));
    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.query.isError).toBe(true));
    expect(reads()).toHaveLength(0);
    expect(result.current.query.data).toBeUndefined();
    await act(async () => result.current.query.refetch());
    await waitFor(() => expect(result.current.query.data).toEqual(subject.data('a')));
    expect(reads()).toHaveLength(1);
  });

  it('masks cached data during switching and requires reload after uncertain admission', async () => {
    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    const retained = result.current.query.refetch;
    const owner = observeWorkspaceOwner(result.current.capture())!;
    let epoch!: number;
    releaseAdmission = () => finishWorkspaceSwitch(owner, owner.epoch, false);
    act(() => { epoch = beginWorkspaceSwitch(owner, owner.epoch); });
    expect(result.current.query.data).toBeUndefined();
    expect(result.current.query.isSuccess).toBe(false);
    expect(result.current.query.isFetching).toBe(false);
    await act(async () => { await retained(); await result.current.query.refetch(); });
    expect(reads()).toHaveLength(1);
    act(() => finishWorkspaceSwitch(owner, epoch, true));
    expect(result.current.query.error?.message).toMatch(/reload/i);
    await act(async () => result.current.query.refetch());
    expect(reads()).toHaveLength(1);
  });

  it('retires the request on final-observer unmount and rejects retained refetch', async () => {
    const admission = renderHook(() => useAccountWorkspaces(), { wrapper });
    await waitFor(() => expect(admission.result.current.data).toBeDefined());
    const response = deferred<Response>();
    fetchMock.mockReturnValue(response.promise);
    const { result, unmount } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(reads()).toHaveLength(1));
    const signal = reads()[0]![1]?.signal;
    const refetch = result.current.query.refetch;
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { await refetch(); response.resolve(json(subject.body('unmounted'))); });
    expect(reads()).toHaveLength(1);
    expect(client.getQueryCache().findAll({ queryKey: subject.key })
      .every((query) => query.state.data === undefined)).toBe(true);
  });

  it('keeps a shared request alive when only one of two observers unmounts', async () => {
    const admission = renderHook(() => useAccountWorkspaces(), { wrapper });
    await waitFor(() => expect(admission.result.current.data).toBeDefined());
    const response = deferred<Response>();
    fetchMock.mockReturnValue(response.promise);
    const first = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(reads()).toHaveLength(1));
    const second = renderHook(useHarness, { wrapper });
    const signal = reads()[0]![1]?.signal;
    const staleRefetch = first.result.current.query.refetch;
    first.unmount();
    expect(signal?.aborted).toBe(false);
    await act(async () => staleRefetch());
    expect(reads()).toHaveLength(1);
    await act(async () => response.resolve(json(subject.body('shared'))));
    await waitFor(() => expect(second.result.current.query.data).toEqual(subject.data('shared')));
    expect(second.result.current.query.error).toBeNull();
    expect(reads()).toHaveLength(1);
  });

  it('retains current cached data on background failure and supports prefix invalidation', async () => {
    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    fetchMock.mockResolvedValueOnce(json({ error: 'Temporary failure' }, 503));
    await act(async () => result.current.query.refetch());
    await waitFor(() => expect(result.current.query.isError).toBe(true));
    expect(result.current.query.data).toEqual(subject.data('a'));
    expect(result.current.query.isSuccess).toBe(false);
    expect(result.current.query.isFetching).toBe(false);
    await act(async () => { await client.invalidateQueries({ queryKey: subject.key }); });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.query.error).toBeNull();
    expect(reads()).toHaveLength(3);
  });

  it('inherits retry policy without acquiring a replacement account for a captured retry', async () => {
    const replacementToken = vi.fn(async () => 'token-b');
    const retry = vi.fn((failureCount: number) => {
      if (failureCount === 0) {
        changeIdentity('b', 'session-b');
        fixture.sdk.session.getToken = replacementToken;
        return true;
      }
      return false;
    });
    client.setDefaultOptions({ queries: { retry, retryDelay: 0, gcTime: Infinity } });
    const first = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(first.result.current.query.data).toEqual(subject.data('a')));
    const captured = client.getQueryCache().findAll({ queryKey: subject.key })
      .find((query) => query.state.data !== undefined)!;
    first.unmount();
    fetchMock.mockImplementation(async (path) => String(path) === MANAGED_CLOUD_WORKSPACES_PATH
      ? json(personal) : json({ error: 'Temporary failure' }, 503));
    await act(async () => { await expect(captured.fetch()).rejects.toMatchObject({ name: 'AbortError' }); });
    expect(retry).toHaveBeenCalledTimes(2);
    expect(reads()).toHaveLength(2);
    expect(replacementToken).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async (path) => String(path) === MANAGED_CLOUD_WORKSPACES_PATH
      ? json(personal) : json(subject.body('b')));
    const second = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(second.result.current.query.data).toEqual(subject.data('b')));
    expect(reads()).toHaveLength(3);
    expect(new Headers(reads()[2]![1]?.headers).get('Authorization')).toBe('Bearer token-b');
  });
});
