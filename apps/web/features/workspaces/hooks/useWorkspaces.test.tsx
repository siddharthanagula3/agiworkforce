import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import { useAccountWorkspaces, useSelectWorkspace } from './use-workspaces';

const state = vi.hoisted(() => ({ session: null as SessionAuthority | null, serial: 0 }));
const finalizeWorkspaceSwitch = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/features/workspaces/lib/workspace-cache-scope', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  finalizeWorkspaceSwitch,
}));
vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  useSessionSnapshot: () => () => state.session,
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const personal = {
  workspaces: [],
  activeWorkspaceId: null,
  activeOrganizationId: null,
  scope: 'personal',
};
const organization = {
  workspaces: [
    {
      id: ORG,
      organizationId: ORG,
      kind: 'organization',
      name: 'Team',
      slug: 'team',
      isPrimary: true,
      role: 'owner',
    },
  ],
  activeWorkspaceId: ORG,
  activeOrganizationId: ORG,
  scope: 'organization',
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

function replacementSession(userId = `account-${++state.serial}`) {
  const identity: SessionAuthority = {
    userId,
    sessionId: `session-${state.serial}`,
    isCurrent: () => state.session === identity,
    getToken: async () => 'fixture-token',
  };
  state.session = identity;
  return identity;
}

beforeEach(() => {
  vi.clearAllMocks();
  replacementSession();
});
afterEach(() => {
  state.session = null;
  vi.unstubAllGlobals();
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const hook = renderHook(
    () => ({
      read: useAccountWorkspaces(),
      select: useSelectWorkspace(),
      settings: useSelectWorkspace('organization'),
    }),
    { wrapper: Wrapper },
  );
  return { ...hook, client };
}

describe('owned workspace selection', () => {
  it('retires before token resolution and serializes both switching surfaces', async () => {
    const fetcher = vi.fn(async () => json(personal));
    vi.stubGlobal('fetch', fetcher);
    const { result, client } = setup();
    await waitFor(() => expect(result.current.read.data?.scope).toBe('personal'));
    let resolve!: (token: string | null) => void;
    state.session!.getToken = () =>
      new Promise((done) => {
        resolve = done;
      });
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.select.mutateAsync(ORG);
    });
    await waitFor(() => expect(result.current.read.isSwitching).toBe(true));
    expect(result.current.read.data).toBeUndefined();
    await act(async () => {
      await expect(result.current.settings.mutateAsync(null)).rejects.toThrow();
    });
    state.session = null;
    await act(async () => {
      resolve('retired-token');
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(finalizeWorkspaceSwitch).not.toHaveBeenCalled();
    client.clear();
  });

  it.each([
    [400, '<html>bad request</html>', 'We could not switch workspaces. Try again.'],
    [401, '{}', 'Your session has expired. Sign in again to continue.'],
    [503, '<html>unavailable</html>', 'Something went wrong on our side. Try again shortly.'],
    [
      400,
      JSON.stringify({ error: { message: 'Choose a workspace you belong to.' } }),
      'Choose a workspace you belong to.',
    ],
    [
      500,
      JSON.stringify({ error: 'SELECT secret FROM internal' }),
      'Something went wrong on our side. Try again shortly.',
    ],
  ])('normalizes status %s without exposing transport details', async (status, body, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'PUT' ? new Response(body, { status }) : json(personal),
      ),
    );
    const { result, client } = setup();
    await waitFor(() => expect(result.current.read.data?.scope).toBe('personal'));
    await act(async () => {
      await expect(result.current.select.mutateAsync(null)).rejects.toMatchObject({
        message,
        status,
      });
    });
    expect(finalizeWorkspaceSwitch).not.toHaveBeenCalled();
    if (status >= 500) expect(result.current.read.data).toBeUndefined();
    client.clear();
  });

  it('finalizes only canonical GET scope, not the PUT body or requested target', async () => {
    let switched = false;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        switched = true;
        return json({ activeOrganizationId: null });
      }
      return json(switched ? organization : personal);
    });
    vi.stubGlobal('fetch', fetcher);
    const { result, client } = setup();
    await waitFor(() => expect(result.current.read.data?.scope).toBe('personal'));
    await act(async () => {
      await result.current.select.mutateAsync(ORG);
    });
    expect(finalizeWorkspaceSwitch).toHaveBeenCalledWith(
      client,
      ORG,
      expect.objectContaining({ session: state.session }),
    );
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.credentials).toBe('omit');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-token');
    }
    client.clear();
  });

  it('rejects stale confirmation callbacks after replacement account or epoch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(personal)),
    );
    const { result, rerender, client } = setup();
    await waitFor(() => expect(result.current.read.data?.scope).toBe('personal'));
    const captured = result.current.settings.mutateAsync;
    replacementSession();
    rerender();
    await waitFor(() => expect(result.current.read.data?.scope).toBe('personal'));
    await act(async () => {
      await expect(captured(ORG)).rejects.toThrow();
    });
    expect(finalizeWorkspaceSwitch).not.toHaveBeenCalled();
    expect(result.current.settings.error).toBeNull();
    client.clear();
  });

  it('keeps uncertain account blocked after same-account session replacement', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PUT') throw new TypeError('network unavailable');
        return json(personal);
      }),
    );
    const { result, rerender, client } = setup();
    await waitFor(() => expect(result.current.read.data?.scope).toBe('personal'));
    const account = state.session!.userId;
    await act(async () => {
      await expect(result.current.select.mutateAsync(ORG)).rejects.toThrow();
    });
    replacementSession(account);
    rerender();
    expect(result.current.read.data).toBeUndefined();
    expect(result.current.read.requiresReload).toBe(true);
    client.clear();
  });

  it('does not admit a malformed list or infer Personal from missing scope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ workspaces: [] })),
    );
    const { result, client } = setup();
    await waitFor(() => expect(result.current.read.isUnavailable).toBe(true));
    expect(result.current.read.data).toBeUndefined();
    expect(finalizeWorkspaceSwitch).not.toHaveBeenCalled();
    client.clear();
  });
});

type ImportedModule0 = typeof import('@/features/workspaces/lib/workspace-cache-scope');
type ImportedModule1 = typeof import('@/lib/identity/useSessionSnapshot');
