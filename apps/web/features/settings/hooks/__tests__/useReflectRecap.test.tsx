import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  type ManagedCloudReflectRange,
} from '@agiworkforce/cloud-contracts';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import {
  observeWorkspaceOwner,
  beginWorkspaceSwitch,
  finishWorkspaceSwitch,
  failWorkspaceRead,
  admitWorkspace,
} from '@/features/workspaces/lib/workspace-admission';
import { useReflectRecap } from '../use-reflect-recap';

const fixture = vi.hoisted(() => ({
  session: null as SessionAuthority | null,
  data: {
    scope: 'personal',
    activeWorkspaceId: 'personal',
    activeOrganizationId: null as string | null,
  },
  refetch: vi.fn(),
  listeners: new Set<() => void>(),
}));
vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useSessionSnapshot: () => () => fixture.session,
}));
vi.mock('@/features/workspaces/hooks/use-workspaces', async (importOriginal) => {
  const original = await importOriginal<ImportedModule1>();
  const { observeWorkspaceOwner, admitWorkspace } =
    await import('@/features/workspaces/lib/workspace-admission');
  return {
    ...original,
    useAccountWorkspaces: () => {
      const owner = observeWorkspaceOwner(fixture.session);
      if (owner?.phase === 'resolving') {
        admitWorkspace(
          owner,
          owner.epoch,
          JSON.stringify([
            fixture.data.scope,
            fixture.data.activeWorkspaceId,
            fixture.data.activeOrganizationId,
          ]),
        );
      }
      return {
        data: fixture.data,
        isLoading: false,
        requiresReload: owner?.phase === 'uncertain',
        refetch: fixture.refetch,
      };
    },
  };
});
const recap = (range: ManagedCloudReflectRange = '30d') => ({
  range,
  generatedAt: '2026-07-18T18:00:00.000Z',
  period: {
    start: '2026-06-18T18:00:00.000Z',
    end: '2026-07-18T18:00:00.000Z',
    label: 'Past 30 days',
  },
  summary: { headline: 'Private recap', body: 'Private activity' },
  stats: { totalConversations: 0, activeDays: 0, mostActiveDay: null, peakHour: null },
  dailyActivity: [],
  topics: [],
  insights: [],
  sampled: false,
  sampledConversationCount: 0,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function session(userId = 'a', sessionId = 'session-a') {
  const candidate: SessionAuthority = {
    userId,
    sessionId,
    isCurrent: () => fixture.session === candidate,
    getToken: vi.fn(async () => `token-${userId}`),
    subscribe: (listener) => {
      fixture.listeners.add(listener);
      return () => {
        fixture.listeners.delete(listener);
      };
    },
  };
  fixture.session = candidate;
  return candidate;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  observeWorkspaceOwner(null);
  session();
  fixture.data = { scope: 'personal', activeWorkspaceId: 'personal', activeOrganizationId: null };
  fixture.refetch.mockReset();
  fetchMock
    .mockReset()
    .mockImplementation(async (url) =>
      json(
        recap(
          new URL(String(url), 'https://example.test').searchParams.get(
            'range',
          ) as ManagedCloudReflectRange,
        ),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  fixture.session = null;
  fixture.listeners.clear();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

describe('Reflect read ownership', () => {
  it('pins the bearer and explicit personal workspace, without background retries', async () => {
    const { result } = renderHook(() => useReflectRecap('30d', 'UTC'));
    await waitFor(() => expect(result.current.recap?.summary.headline).toBe('Private recap'));
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe('omit');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token-a');
    expect(new Headers(init?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
      MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses an explicit organization rather than the ambient selection', async () => {
    fixture.data = {
      scope: 'organization',
      activeWorkspaceId: 'org-workspace',
      activeOrganizationId: 'org-a',
    };
    const { result } = renderHook(() => useReflectRecap('30d', 'UTC'));
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER),
    ).toBe('org-a');
  });

  it('shows loading while the first token is deferred and cannot dispatch after close', async () => {
    const token = deferred<string>();
    fixture.session!.getToken = () => token.promise;
    const { result, rerender } = renderHook(({ active }) => useReflectRecap('30d', 'UTC', active), {
      initialProps: { active: true },
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    rerender({ active: false });
    await act(async () => {
      token.resolve('old-token');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.recap).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it.each([200, 409])('rejects a late %s body after range replacement', async (status) => {
    const body = deferred<unknown>();
    fetchMock.mockResolvedValueOnce({
      ok: status === 200,
      status,
      json: () => body.promise,
    } as Response);
    const { result, rerender } = renderHook(({ range }) => useReflectRecap(range, 'UTC'), {
      initialProps: { range: '30d' as ManagedCloudReflectRange },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ range: '90d' });
    await waitFor(() => expect(result.current.recap?.range).toBe('90d'));
    await act(async () => {
      body.resolve(status === 200 ? recap() : { error: { code: 'memory_required' } });
    });
    expect(result.current.recap?.range).toBe('90d');
    expect(result.current.memoryRequired).toBe(false);
  });

  it('rejects a valid schema with the wrong requested range', async () => {
    fetchMock.mockResolvedValue(json(recap('30d')));
    const { result } = renderHook(() => useReflectRecap('90d', 'UTC'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.recap).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retires the switching workspace and admits the next organization after a fresh session snapshot', async () => {
    const { result } = renderHook(() => useReflectRecap('30d', 'UTC'));
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    const refresh = result.current.refresh;
    const owner = observeWorkspaceOwner(fixture.session)!;
    let epoch = 0;
    act(() => {
      epoch = beginWorkspaceSwitch(owner, owner.epoch);
    });
    expect(result.current.recap).toBeNull();
    act(() => {
      refresh();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => {
      fixture.data = {
        scope: 'organization',
        activeWorkspaceId: 'next-workspace',
        activeOrganizationId: 'org-next',
      };
      session('a', 'session-a');
      finishWorkspaceSwitch(owner, epoch, false);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER),
    ).toBe('org-next');
    act(() => {
      refresh();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('requires reload for an unexpected same-session workspace scope change', async () => {
    const { result, unmount } = renderHook(() => useReflectRecap('30d', 'UTC'));
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    const owner = observeWorkspaceOwner(fixture.session)!;
    act(() => {
      fixture.data = {
        scope: 'organization',
        activeWorkspaceId: 'unexpected-workspace',
        activeOrganizationId: 'org-other',
      };
      admitWorkspace(
        owner,
        owner.epoch,
        JSON.stringify([
          fixture.data.scope,
          fixture.data.activeWorkspaceId,
          fixture.data.activeOrganizationId,
        ]),
      );
    });
    expect(result.current.recap).toBeNull();
    expect(result.current.error).toMatch(/Reload this page/);
    expect(result.current.canRefresh).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.refresh();
    });
    expect(fixture.refetch).not.toHaveBeenCalled();
    unmount();
    finishWorkspaceSwitch(owner, owner.epoch, false);
  });

  it('masks ready data on a silent same-user session replacement before rendering a new result', async () => {
    const { result, rerender } = renderHook(() => useReflectRecap('30d', 'UTC'));
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    const token = deferred<string>();
    session('a', 'replacement').getToken = () => token.promise;
    rerender();
    expect(result.current.recap).toBeNull();
    expect(result.current.loading).toBe(true);
    await act(async () => {
      token.resolve('replacement-token');
    });
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('authorization')).toBe(
      'Bearer replacement-token',
    );
  });

  it('handles session push after ready and does not keep a recap for a signed-out owner', async () => {
    const { result } = renderHook(() => useReflectRecap('30d', 'UTC'));
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    act(() => {
      fixture.session = null;
      fixture.listeners.forEach((listener) => listener());
    });
    expect(result.current.recap).toBeNull();
    expect(result.current.canRefresh).toBe(false);
  });

  it('reopens with a new read and rejects the old close-generation refresh', async () => {
    const { result, rerender } = renderHook(({ active }) => useReflectRecap('30d', 'UTC', active), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    const oldRefresh = result.current.refresh;
    rerender({ active: false });
    expect(result.current.recap).toBeNull();
    rerender({ active: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    act(() => {
      oldRefresh();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reconciles a silent owner replacement when the visible refresh action is invoked', async () => {
    const { result } = renderHook(() => useReflectRecap('30d', 'UTC'));
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    const refresh = result.current.refresh;
    const token = deferred<string>();
    session('b', 'session-b').getToken = () => token.promise;
    act(() => {
      refresh();
    });
    expect(result.current.recap).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)(
    'reconciles silent replacement after a stale token %s',
    async (outcome) => {
      const token = deferred<string>();
      fixture.session!.getToken = () => token.promise;
      const { result } = renderHook(() => useReflectRecap('30d', 'UTC'));
      session('b', 'session-b');
      await act(async () => {
        if (outcome === 'resolve') token.resolve('old-token');
        else token.reject(new Error('Old failure'));
      });
      await waitFor(() => expect(result.current.recap).not.toBeNull());
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
        'Bearer token-b',
      );
      expect(result.current.loading).toBe(false);
    },
  );

  it('does not dispatch a deferred token after unmount', async () => {
    const token = deferred<string>();
    fixture.session!.getToken = () => token.promise;
    const { unmount } = renderHook(() => useReflectRecap('30d', 'UTC'));
    unmount();
    await act(async () => {
      token.resolve('old-token');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the current memory-required response without inventing a recap', async () => {
    fetchMock.mockResolvedValue(json({ error: { code: 'memory_required' } }, 409));
    const { result } = renderHook(() => useReflectRecap('30d', 'UTC'));
    await waitFor(() => expect(result.current.memoryRequired).toBe(true));
    expect(result.current.recap).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('survives StrictMode replay without dispatching its retired first token', async () => {
    const { result } = renderHook(() => useReflectRecap('30d', 'UTC'), {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a same-view refresh supersedes a pending body immediately', async () => {
    const body = deferred<unknown>();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => body.promise,
    } as Response);
    const { result } = renderHook(() => useReflectRecap('30d', 'UTC'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    await act(async () => {
      body.resolve({ ...recap(), summary: { headline: 'Stale recap', body: 'Old activity' } });
    });
    expect(result.current.recap?.summary.headline).toBe('Private recap');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('an observed account round trip never restores old body or callback authority', async () => {
    const body = deferred<unknown>();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => body.promise,
    } as Response);
    const { result, rerender } = renderHook(() => useReflectRecap('30d', 'UTC'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const oldRefresh = result.current.refresh;
    session('b', 'session-b');
    rerender();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    session('a', 'session-a');
    rerender();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    await act(async () => {
      body.resolve({ ...recap(), summary: { headline: 'Old incarnation', body: 'Old activity' } });
    });
    act(() => {
      oldRefresh();
    });
    expect(result.current.recap?.summary.headline).toBe('Private recap');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('offers a captured retry for unavailable workspace admission', async () => {
    const { result } = renderHook(() => useReflectRecap('30d', 'UTC'));
    await waitFor(() => expect(result.current.recap).not.toBeNull());
    const owner = observeWorkspaceOwner(fixture.session)!;
    act(() => {
      failWorkspaceRead(owner, owner.epoch);
    });
    expect(result.current.canRefresh).toBe(true);
    act(() => {
      result.current.refresh();
    });
    expect(fixture.refetch).toHaveBeenCalledTimes(1);
  });
});

type ImportedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
type ImportedModule1 = typeof import('@/features/workspaces/hooks/use-workspaces');
