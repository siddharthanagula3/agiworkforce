import React, { StrictMode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import {
  admitWorkspace,
  beginWorkspaceSwitch,
  finishWorkspaceSwitch,
  observeWorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';
import { useManagedChatList } from './useManagedChatList';

const fixture = vi.hoisted(() => ({
  current: true,
  workspacePhase: 'ready' as 'ready' | 'loading' | 'switching',
  token: vi.fn(async () => 'token-a'),
  replace: vi.fn(),
}));
const session = {
  userId: 'manager-owner',
  sessionId: 'manager-session',
  isCurrent: () => fixture.current,
  getToken: () => fixture.token(),
};
vi.mock('@/lib/identity/useSessionSnapshot', () => ({ useSessionSnapshot: () => () => session }));
vi.mock('@/features/workspaces/hooks/use-workspaces', async (original) => ({
  ...(await original<ImportedModule0>()),
  useAccountWorkspaces: () => {
    if (fixture.workspacePhase !== 'ready')
      return {
        data: undefined,
        refetch: vi.fn(),
        isLoading: fixture.workspacePhase === 'loading',
        isSwitching: fixture.workspacePhase === 'switching',
        requiresReload: false,
      };
    const owner = observeWorkspaceOwner(session);
    if (owner) admitWorkspace(owner, owner.epoch, JSON.stringify(['personal', 'personal', null]));
    return {
      data: { scope: 'personal', activeWorkspaceId: 'personal', activeOrganizationId: null },
      refetch: vi.fn(),
      isSwitching: owner?.phase === 'switching',
      requiresReload: false,
    };
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: fixture.replace }) }));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<ImportedModule1>()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf',
  })),
}));
const row = {
  id: 'chat-a',
  title: 'Plan',
  model: 'auto',
  project_id: null,
  pinned: true,
  starred: false,
  archived: true,
  is_temporary: false,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};
const page = { conversations: [row], nextOffset: 1, hasMore: true };
const json = (body: unknown) => new Response(JSON.stringify(body));
const fetchMock = vi.fn<typeof fetch>();
const writes = () =>
  fetchMock.mock.calls.filter(([, init]) => ['POST', 'PUT', 'DELETE'].includes(init?.method ?? ''));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  observeWorkspaceOwner(null);
  fixture.current = true;
  fixture.workspacePhase = 'ready';
  fixture.token.mockReset().mockResolvedValue('token-a');
  fixture.replace.mockReset();
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    streamingConversationIds: [],
    loadingConversationIds: [],
  });
  fetchMock
    .mockReset()
    .mockImplementation(async (_path, init) =>
      init?.method ? json({ conversation: { ...row, archived: false } }) : json(page),
    );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

it('reserves one mutation synchronously and rejects callbacks from a replaced snapshot', async () => {
  const pending = deferred<Response>();
  fetchMock.mockImplementation(async (_path, init) =>
    init?.method ? pending.promise : json(page),
  );
  const { result } = renderHook(() => useManagedChatList('archived'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  const old = result.current;
  act(() => {
    old.restore(old.conversations[0]!);
    old.restore(old.conversations[0]!);
    old.loadMore();
  });
  await waitFor(() => expect(writes()).toHaveLength(1));
  await act(async () => pending.resolve(json({ conversation: { ...row, archived: false } })));
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => {
    old.restore(old.conversations[0]!);
    old.loadMore();
  });
  expect(writes()).toHaveLength(1);
  expect(useChatStore.getState().conversations[0]?.isArchived).toBe(false);
});

it('retires a confirmation before workspace switching and ignores its retained confirm callback', async () => {
  const { result } = renderHook(() => useManagedChatList('archived'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => result.current.removeAll());
  const old = result.current;
  act(() => {
    const owner = observeWorkspaceOwner(session)!;
    beginWorkspaceSwitch(owner, owner.epoch);
    old.confirm();
  });
  expect(writes()).toHaveLength(0);
  expect(result.current.ready).toBe(false);
  act(() => {
    const owner = observeWorkspaceOwner(session)!;
    finishWorkspaceSwitch(owner, owner.epoch, false);
  });
});

it('locks mutation admission while a page is pending, then ignores pre-page row callbacks', async () => {
  const pending = deferred<Response>();
  const { result } = renderHook(() => useManagedChatList('deleted'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  const old = result.current;
  fetchMock.mockImplementation(async () => pending.promise);
  act(() => {
    old.loadMore();
    old.restore(old.conversations[0]!);
  });
  expect(writes()).toHaveLength(0);
  await act(async () =>
    pending.resolve(
      json({ conversations: [{ ...row, id: 'chat-b' }], nextOffset: 2, hasMore: false }),
    ),
  );
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => old.restore(old.conversations[0]!));
  expect(writes()).toHaveLength(0);
  expect(result.current.conversations).toHaveLength(2);
});

it('keeps unknown writes locked behind a successful read and never replays the write', async () => {
  const { result } = renderHook(() => useManagedChatList('deleted'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  fetchMock.mockRejectedValue(new Error('connection lost'));
  act(() => result.current.restore(result.current.conversations[0]!));
  await waitFor(() => expect(result.current.error).toContain('could not be loaded'));
  expect(result.current.notice).toContain('could not confirm');
  expect(result.current.ready).toBe(false);
  expect(writes()).toHaveLength(1);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.error).toContain('could not be loaded'));
  expect(result.current.notice).toContain('could not confirm');
  expect(writes()).toHaveLength(1);
  fetchMock.mockResolvedValue(json({ ...page, hasMore: false }));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(writes()).toHaveLength(1);
  expect(result.current.notice).toContain('could not confirm');
});

it('checks streaming after a delayed token, before destructive dispatch', async () => {
  const { result } = renderHook(() => useManagedChatList('archived'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => result.current.removeAll());
  const token = deferred<string>();
  fixture.token.mockReturnValueOnce(token.promise);
  act(() => result.current.confirm());
  await waitFor(() => expect(fixture.token).toHaveBeenCalledTimes(2));
  useChatStore.setState({ streamingConversationIds: ['new-stream'] });
  await act(async () => token.resolve('token-a'));
  await waitFor(() => expect(result.current.notice).toContain('Finish or stop'));
  expect(writes()).toHaveLength(0);
});

it('does not publish a late restore after the view unmounts', async () => {
  const pending = deferred<Response>();
  const { result, unmount } = renderHook(() => useManagedChatList('deleted'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  fetchMock.mockReturnValue(pending.promise);
  act(() => result.current.restore(result.current.conversations[0]!));
  await waitFor(() => expect(writes()).toHaveLength(1));
  unmount();
  await act(async () => pending.resolve(json({ conversation: row })));
  expect(useChatStore.getState().conversations).toHaveLength(0);
});

it('rejects an empty advancing page rather than repeatedly rebuilding it', async () => {
  fetchMock.mockResolvedValue(json({ conversations: [], nextOffset: 50, hasMore: true }));
  const { result } = renderHook(() => useManagedChatList('deleted'));
  await waitFor(() => expect(result.current.error).toContain('could not be loaded'));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.current.ready).toBe(false);
});

it('retains confirmed restoration through failed readback, failed retry, and successful retry', async () => {
  const { result } = renderHook(() => useManagedChatList('deleted'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  fetchMock.mockImplementation(async (_path, init) => {
    if (init?.method === 'POST') return json({ conversation: row });
    throw new Error('read unavailable');
  });
  act(() => result.current.restore(result.current.conversations[0]!));
  await waitFor(() => expect(result.current.error).toContain('could not be loaded'));
  expect(result.current.notice).toBe('Restored “Plan”.');
  expect(useChatStore.getState().conversations[0]).toMatchObject({
    isArchived: true,
    isPinned: true,
  });
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.error).toContain('could not be loaded'));
  expect(result.current.notice).toBe('Restored “Plan”.');
  expect(result.current.ready).toBe(false);
  fetchMock.mockResolvedValue(json({ conversations: [], hasMore: false, nextOffset: 0 }));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.notice).toBe('Restored “Plan”.');
  expect(writes()).toHaveLength(1);
});

it('survives StrictMode cleanup and setup with only the current read admitting a mutation', async () => {
  const { result } = renderHook(() => useManagedChatList('deleted'), {
    wrapper: ({ children }: { children: React.ReactNode }) => <StrictMode>{children}</StrictMode>,
  });
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => result.current.restore(result.current.conversations[0]!));
  await waitFor(() => expect(result.current.notice).toBe('Restored “Plan”.'));
  expect(writes()).toHaveLength(1);
  await waitFor(() => expect(result.current.ready).toBe(true));
});

it('saved cancel and confirm callbacks cannot release or confirm a newer intent', async () => {
  const pending = deferred<Response>();
  const { result } = renderHook(() => useManagedChatList('archived'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  const initial = result.current;
  act(() => initial.removeAll());
  const old = result.current;
  act(() => old.cancel());
  act(() => initial.removeAll());
  expect(result.current.confirmation).toBeNull();
  act(() => result.current.remove(result.current.conversations[0]!));
  const fresh = result.current;
  act(() => {
    old.confirm();
    old.cancel();
  });
  expect(result.current.confirmation).toBe(fresh.confirmation);
  expect(writes()).toHaveLength(0);
  fetchMock.mockImplementation(async (_path, init) =>
    init?.method ? pending.promise : json(page),
  );
  act(() => {
    fresh.confirm();
    fresh.confirm();
    old.cancel();
  });
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(result.current.ready).toBe(false);
  await act(async () => pending.resolve(json({ success: true })));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(writes()).toHaveLength(1);
});

it.each([
  {
    name: 'terminal empty',
    continuation: { conversations: [], nextOffset: 1, hasMore: false },
    ready: true,
  },
  {
    name: 'nonadvancing',
    continuation: { conversations: [row], nextOffset: 1, hasMore: true },
    ready: false,
  },
  {
    name: 'duplicate-only',
    continuation: { conversations: [row], nextOffset: 2, hasMore: true },
    ready: false,
  },
])(
  'bounds a $name continuation while rebuilding the loaded span',
  async ({ continuation, ready }) => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          conversations: [row, { ...row, id: 'chat-b' }, { ...row, id: 'chat-c' }],
          nextOffset: 3,
          hasMore: false,
        }),
      )
      .mockResolvedValueOnce(json({ conversation: row }))
      .mockResolvedValueOnce(json(page))
      .mockResolvedValueOnce(json(continuation));
    const { result } = renderHook(() => useManagedChatList('deleted'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.restore(result.current.conversations[0]!));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(ready);
    expect(result.current.notice).toBe('Restored “Plan”.');
    expect(writes()).toHaveLength(1);
    if (ready) expect(result.current.conversations).toHaveLength(1);
    else expect(result.current.error).toContain('could not be loaded');
  },
);

it.each(['loading', 'switching'] as const)(
  'shows workspace %s without claiming a list failure',
  (phase) => {
    fixture.workspacePhase = phase;
    const { result } = renderHook(() => useManagedChatList('archived'));
    expect(result.current.loading).toBe(true);
    expect(result.current.ready).toBe(false);
    expect(result.current.loadFailed).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.conversations).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

type ImportedModule0 = typeof import('@/features/workspaces/hooks/use-workspaces');
type ImportedModule1 = typeof import('@/lib/client/csrf');
