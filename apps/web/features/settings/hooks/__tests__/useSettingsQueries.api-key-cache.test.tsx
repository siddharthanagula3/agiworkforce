import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_CLOUD_WORKSPACES_PATH } from '@agiworkforce/cloud-contracts';
import { observeWorkspaceOwner, workspaceOwnerIsCurrent } from '@/features/workspaces/lib/workspace-admission';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { queryKeys } from '@shared/stores/query-client';
import type { APIKey } from '../../services/user-preferences';
import { useAPIKeys, useCreateAPIKey, useDeleteAPIKey } from '../use-settings-queries';

const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  sdk: { loaded: true, addListener: () => () => undefined, user: { id: 'a' }, session: {
    id: 'session-a', user: { id: 'a' }, getToken: async (): Promise<string | null> => 'token-a',
  } },
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf'),
  addCsrfHeaders: vi.fn(), clearCsrfToken: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const prefix = queryKeys.settings.apiKeys();
const path = '/api/settings/api-keys';
const personal = {
  scope: 'personal', activeWorkspaceId: 'personal', activeOrganizationId: null, workspaces: [],
};
function keys(owner: string): APIKey[] {
  return [{ id: 'shared-id', name: owner, key_prefix: 'agi_', scopes: [],
    created_at: '2026-10-20T00:00:00.000Z' }];
}
const json = (body: unknown) => new Response(JSON.stringify(body));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function changeIdentity(userId: string) {
  fixture.auth = { isLoaded: true, isSignedIn: true, userId, sessionId: `session-${userId}` };
  fixture.sdk.user = { id: userId };
  fixture.sdk.session = { id: `session-${userId}`, user: { id: userId },
    getToken: async () => `token-${userId}` };
}
const fetchMock = vi.fn<typeof fetch>();
const requests: Array<ReturnType<typeof createRequestAuthority>> = [];
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const reads = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === path && init?.method === 'GET');
function useHarness() {
  const capture = useSessionSnapshot();
  return { query: useAPIKeys(), create: useCreateAPIKey(), remove: useDeleteAPIKey(),
    scope: () => {
      const owner = observeWorkspaceOwner(capture())!;
      const epoch = owner.epoch;
      const request = createRequestAuthority(owner.session, () => workspaceOwnerIsCurrent(owner, epoch));
      requests.push(request);
      return { request, organizationId: null, onStepUpRequired: vi.fn() };
    },
  };
}
beforeEach(() => {
  observeWorkspaceOwner(null);
  changeIdentity('a');
  client = new QueryClient({ defaultOptions: { queries: {
    retry: false, staleTime: Infinity, gcTime: Infinity,
  } } });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) => {
    if (String(url) === MANAGED_CLOUD_WORKSPACES_PATH) return json(personal);
    if (String(url) === path) return json({ api_keys: keys(fixture.auth.userId) });
    throw new Error(`Unexpected request: ${String(url)}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  requests.splice(0).forEach((request) => request.retire());
  client.clear();
  observeWorkspaceOwner(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('API-key owner caches and mutation invalidation', () => {
  it('preserves the full legacy prefix and the two-minute stale / ten-minute GC policy', async () => {
    const { result } = renderHook(() => useAPIKeys(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(keys('a')));
    const query = client.getQueryCache().findAll({ queryKey: prefix })
      .find((entry) => entry.state.data !== undefined)!;
    expect(prefix).toEqual(['settings', 'apiKeys', undefined]);
    expect(query.queryKey.slice(0, prefix.length)).toEqual(prefix);
    expect(query.queryKey.length).toBeGreaterThan(prefix.length);
    expect(query.options).toMatchObject({ staleTime: 2 * 60 * 1000, gcTime: 10 * 60 * 1000 });
    expect(query.gcTime).toBe(10 * 60 * 1000);
    expect(client.getQueryData(prefix)).toBeUndefined();
  });

  it.each(['create', 'delete'] as const)('retired %s completion cannot invalidate replacement caches or inject data', async (operation) => {
    const mutationResponse = deferred<Response>();
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === 'POST' || init?.method === 'DELETE') return mutationResponse.promise;
      return String(url) === MANAGED_CLOUD_WORKSPACES_PATH
        ? json(personal) : json({ api_keys: keys(fixture.auth.userId) });
    });
    const { result, rerender } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.query.data).toEqual(keys('a')));
    const oldQuery = client.getQueryCache().findAll({ queryKey: prefix })
      .find((entry) => entry.state.data !== undefined)!;
    const globalData = keys('legacy-global');
    const unrelatedData = keys('legacy-specific-user');
    const unrelatedPrefix = queryKeys.settings.apiKeys('legacy-user');
    client.setQueryData(prefix, globalData);
    client.setQueryData(unrelatedPrefix, unrelatedData);
    let mutation!: Promise<unknown>;
    const scope = result.current.scope();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    act(() => {
      mutation = operation === 'create'
        ? result.current.create.mutateAsync({ scope, draft: { name: 'Created', scopes: ['models:read'] } })
        : result.current.remove.mutateAsync({ scope, keyId: 'shared-id' });
      void mutation.catch(() => undefined);
    });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) =>
      init?.method === 'POST' || init?.method === 'DELETE')).toHaveLength(1));
    act(() => { changeIdentity('b'); rerender(); });
    await waitFor(() => expect(result.current.query.data).toEqual(keys('b')));
    const activeQuery = client.getQueryCache().findAll({ queryKey: prefix })
      .find((entry) => entry.state.data === result.current.query.data)!;
    const createdKey = { ...keys('created-a')[0]!, id: 'created-key' };
    await act(async () => {
      mutationResponse.resolve(json(operation === 'create'
        ? { api_key: createdKey, full_key: 'test-only-key' } : { message: 'API key revoked' }));
      await expect(mutation).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(oldQuery.state.isInvalidated).toBe(false);
    expect(activeQuery.state.isInvalidated).toBe(false);
    expect(client.getQueryState(unrelatedPrefix)?.isInvalidated).toBe(false);
    expect(oldQuery.state.data).toEqual(keys('a'));
    expect(result.current.query.data).toEqual(keys('b'));
    expect(client.getQueryData(prefix)).toEqual(globalData);
    expect(client.getQueryData(unrelatedPrefix)).toEqual(unrelatedData);
    expect(client.getQueryCache().findAll({ queryKey: prefix })
      .some((entry) => JSON.stringify(entry.state.data)?.includes('created-key'))).toBe(false);
    expect(reads()).toHaveLength(2);
    expect(new Headers(reads()[1]![1]?.headers).get('Authorization')).toBe('Bearer token-b');
  });

  it.each(['create', 'delete'] as const)('current %s invalidates only the compatible prefix without delaying its receipt', async (operation) => {
    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.query.data).toEqual(keys('a')));
    const refresh = deferred<Response>();
    const createdKey = { ...keys('created-a')[0]!, id: 'created-key' };
    const globalData = keys('legacy-global');
    const unrelatedPrefix = queryKeys.settings.apiKeys('legacy-user');
    client.setQueryData(prefix, globalData);
    client.setQueryData(unrelatedPrefix, keys('legacy-specific-user'));
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') return json({ api_key: createdKey, full_key: 'test-only-key' });
      if (init?.method === 'DELETE') return json({ message: 'API key revoked' });
      return refresh.promise;
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const scope = result.current.scope();
    await act(async () => {
      if (operation === 'create') await expect(result.current.create.mutateAsync({
        scope, draft: { name: 'Created', scopes: ['models:read'] },
      })).resolves.toEqual({ apiKey: createdKey, fullKey: 'test-only-key' });
      else await expect(result.current.remove.mutateAsync({ scope, keyId: 'shared-id' })).resolves.toBe('shared-id');
    });
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: prefix });
    expect(client.getQueryState(unrelatedPrefix)?.isInvalidated).toBe(false);
    expect(client.getQueryData(prefix)).toEqual(globalData);
    expect(result.current.query.data).toEqual(keys('a'));
    await act(async () => {
      refresh.resolve(json({ api_keys: keys('a-refreshed') }));
    });
    await waitFor(() => expect(result.current.query.data).toEqual(keys('a-refreshed')));
    expect(client.getQueryData(prefix)).toEqual(globalData);
    expect(reads()).toHaveLength(2);
  });
});
