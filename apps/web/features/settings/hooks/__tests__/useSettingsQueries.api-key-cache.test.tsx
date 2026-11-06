import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_CLOUD_WORKSPACES_PATH } from '@agiworkforce/cloud-contracts';
import { observeWorkspaceOwner } from '@/features/workspaces/lib/workspace-admission';
import { queryKeys } from '@shared/stores/query-client';
import settingsService, { type APIKey } from '../../services/user-preferences';
import { useAPIKeys, useCreateAPIKey, useDeleteAPIKey } from '../use-settings-queries';

const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  sdk: { loaded: true, user: { id: 'a' }, session: {
    id: 'session-a', user: { id: 'a' }, getToken: async (): Promise<string | null> => 'token-a',
  } },
  sendAuthorizedJson: vi.fn(),
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('@/features/auth/step-up-fetch', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/auth/step-up-fetch')>(),
  sendAuthorizedJson: fixture.sendAuthorizedJson,
}));
vi.mock('../useStepUp', () => ({
  useStepUp: () => ({
    dialog: null,
    withStepUp: (send: (headers: Record<string, string>) => Promise<Response>) => send({}),
  }),
}));
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
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const reads = () => fetchMock.mock.calls.filter(([url]) => String(url) === path);
function useHarness() {
  return { query: useAPIKeys(), create: useCreateAPIKey(), remove: useDeleteAPIKey() };
}
beforeEach(() => {
  observeWorkspaceOwner(null);
  changeIdentity('a');
  fixture.sendAuthorizedJson.mockReset();
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

  it.each(['create', 'delete'] as const)('%s completion invalidates owner caches without injecting mutation data', async (operation) => {
    const mutationResponse = deferred<Response>();
    const deletion = deferred<{ error?: string }>();
    fixture.sendAuthorizedJson.mockReturnValue(mutationResponse.promise);
    vi.spyOn(settingsService, 'deleteAPIKey').mockReturnValue(deletion.promise);
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
    let settled = false;
    act(() => {
      mutation = operation === 'create'
        ? result.current.create.mutateAsync({ name: 'Created', scopes: [] })
        : result.current.remove.mutateAsync('shared-id');
      void mutation.then(() => { settled = true; });
    });
    await waitFor(() => expect(operation === 'create'
      ? fixture.sendAuthorizedJson : settingsService.deleteAPIKey).toHaveBeenCalledOnce());
    act(() => { changeIdentity('b'); rerender(); });
    await waitFor(() => expect(result.current.query.data).toEqual(keys('b')));
    const activeQuery = client.getQueryCache().findAll({ queryKey: prefix })
      .find((entry) => entry.state.data === result.current.query.data)!;
    const refresh = deferred<Response>();
    fetchMock.mockReturnValueOnce(refresh.promise);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const createdKey = { ...keys('created-a')[0]!, id: 'created-key' };
    await act(async () => {
      mutationResponse.resolve(json({ api_key: createdKey, full_key: 'test-only-key' }));
      deletion.resolve({});
    });
    await waitFor(() => expect(reads()).toHaveLength(3));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: prefix });
    expect(oldQuery.state.isInvalidated).toBe(true);
    expect(activeQuery.state.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelatedPrefix)?.isInvalidated).toBe(false);
    expect(oldQuery.state.data).toEqual(keys('a'));
    expect(result.current.query.data).toEqual(keys('b'));
    expect(client.getQueryData(prefix)).toEqual(globalData);
    expect(client.getQueryData(unrelatedPrefix)).toEqual(unrelatedData);
    expect(client.getQueryCache().findAll({ queryKey: prefix })
      .some((entry) => JSON.stringify(entry.state.data)?.includes('created-key'))).toBe(false);
    expect(new Headers(reads()[2]![1]?.headers).get('Authorization')).toBe('Bearer token-b');
    if (operation === 'create') {
      await expect(mutation).resolves.toEqual({ apiKey: createdKey, fullKey: 'test-only-key' });
      expect(settled).toBe(true);
    } else {
      expect(settled).toBe(false);
    }
    await act(async () => {
      refresh.resolve(json({ api_keys: keys('b-refreshed') }));
      await mutation;
    });
    await waitFor(() => expect(result.current.query.data).toEqual(keys('b-refreshed')));
    expect(settled).toBe(true);
    expect(oldQuery.state.data).toEqual(keys('a'));
    expect(client.getQueryData(prefix)).toEqual(globalData);
    expect(reads()).toHaveLength(3);
  });
});
