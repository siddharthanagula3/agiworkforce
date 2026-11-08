import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MANAGED_CLOUD_WORKSPACES_PATH } from '@agiworkforce/cloud-contracts';
import { useChatStore } from '@shared/stores/web-chat-store';
import { observeWorkspaceOwner } from '@/features/workspaces/lib/workspace-admission';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useManagedChatList } from './useManagedChatList';

const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: { id: 'session-a', user: { id: 'a' }, getToken: async () => 'token-a' },
  },
  replace: vi.fn(),
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: fixture.replace }) }));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<MockedModule0>()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf',
  })),
}));
const row = {
  id: 'chat-a',
  title: 'Account A',
  model: 'auto',
  project_id: null,
  pinned: true,
  starred: false,
  archived: true,
  is_temporary: false,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};
const page = { conversations: [row], nextOffset: 1, hasMore: false };
const personal = {
  scope: 'personal',
  activeWorkspaceId: 'personal',
  activeOrganizationId: null,
  workspaces: [],
};
const json = (body: unknown) => new Response(JSON.stringify(body));
const fetchMock = vi.fn<typeof fetch>();
const writes = () =>
  fetchMock.mock.calls.filter(([, init]) => ['POST', 'PUT', 'DELETE'].includes(init?.method ?? ''));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function changeIdentity(userId: string, sessionId: string) {
  fixture.auth = { isLoaded: true, isSignedIn: true, userId, sessionId };
  fixture.sdk.user = { id: userId };
  fixture.sdk.session = {
    id: sessionId,
    user: { id: userId },
    getToken: async () => `token-${userId}`,
  };
}
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  observeWorkspaceOwner(null);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  changeIdentity('a', 'session-a');
  fixture.replace.mockReset();
  vi.mocked(addCsrfHeaders)
    .mockReset()
    .mockImplementation(async (headers) => ({ ...headers, 'x-csrf-token': 'csrf' }));
  useChatStore.setState({
    conversations: [],
    streamingConversationIds: [],
    loadingConversationIds: [],
    activeConversationId: null,
  });
  fetchMock
    .mockReset()
    .mockImplementation(async (path) =>
      String(path) === MANAGED_CLOUD_WORKSPACES_PATH ? json(personal) : json(page),
    );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  client.clear();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

it.each(['different-account', 'replacement-session'] as const)(
  'a late restore body cannot settle the pending %s lane',
  async (replacement) => {
    const body = deferred<unknown>();
    const parsing = deferred<void>();
    const newPage = deferred<Response>();
    const { result, rerender } = renderHook(() => useManagedChatList('deleted'), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    fetchMock.mockImplementation(async (path, init) => {
      if (String(path) === MANAGED_CLOUD_WORKSPACES_PATH) return json(personal);
      if (init?.method === 'POST')
        return {
          ok: true,
          json: () => {
            parsing.resolve();
            return body.promise;
          },
        } as Response;
      return newPage.promise;
    });
    act(() => result.current.restore(result.current.conversations[0]!));
    await parsing.promise;
    const nextUser = replacement === 'different-account' ? 'b' : 'a';
    act(() => {
      changeIdentity(nextUser, 'session-replacement');
      rerender();
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([path]) => String(path).includes('deleted=only')),
      ).toHaveLength(2),
    );
    expect(result.current.ready).toBe(false);
    await act(async () => body.resolve({ conversation: row }));
    expect(useChatStore.getState().conversations).toHaveLength(0);
    expect(result.current.ready).toBe(false);
    expect(result.current.loading).toBe(true);
    expect(result.current.notice).toBeNull();
    await act(async () =>
      newPage.resolve(
        json({
          conversations: [{ ...row, id: 'replacement-chat', title: 'Replacement' }],
          nextOffset: 1,
          hasMore: false,
        }),
      ),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.conversations.map((item) => item.id)).toEqual(['replacement-chat']);
    expect(writes()).toHaveLength(1);
    expect(fixture.replace).not.toHaveBeenCalled();
  },
);

it('an SDK account change during CSRF preparation prevents dispatch even before React rerenders', async () => {
  const csrf = deferred<HeadersInit>();
  const { result, rerender } = renderHook(() => useManagedChatList('archived'), { wrapper });
  await waitFor(() => expect(result.current.ready).toBe(true));
  vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
  act(() => result.current.restore(result.current.conversations[0]!));
  await waitFor(() => expect(addCsrfHeaders).toHaveBeenCalledTimes(1));
  changeIdentity('b', 'session-b');
  await act(async () => csrf.resolve({ 'x-csrf-token': 'old-csrf' }));
  expect(writes()).toHaveLength(0);
  expect(useChatStore.getState().conversations).toHaveLength(0);
  act(() => rerender());
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.notice).toBeNull();
  expect(writes()).toHaveLength(0);
});

type MockedModule0 = typeof import('@/lib/client/csrf');
