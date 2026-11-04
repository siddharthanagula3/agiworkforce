import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_CLOUD_ORGANIZATION_HEADER, MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE } from '@agiworkforce/cloud-contracts';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import { useLocalModelSelection } from '@features/desktop-host';
import { observeWorkspaceOwner, beginWorkspaceSwitch, finishWorkspaceSwitch, failWorkspaceRead } from '@/features/workspaces/lib/workspace-admission';
import { readLocalPersonalContext, useLocalPersonalContextPrefetch } from './local-personal-context';

const state = vi.hoisted(() => ({ session: null as SessionAuthority | null, serial: 0 }));
vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/identity/useSessionSnapshot')>()),
  useSessionSnapshot: () => () => state.session,
}));
const personal = { workspaces: [], activeWorkspaceId: null, activeOrganizationId: null, scope: 'personal' };
const context = { instructions: 'Be brief', memory: null, memoryCitations: [] };
const json = (value: unknown) => new Response(JSON.stringify(value));
const clients: QueryClient[] = [];
function replacement(ids?: { userId: string; sessionId: string }) {
  const serial = ++state.serial;
  const identity: SessionAuthority = {
    userId: ids?.userId ?? `user-${serial}`, sessionId: ids?.sessionId ?? `session-${serial}`,
    isCurrent: () => state.session === identity,
    getToken: vi.fn(async () => 'fixture-token'),
  };
  state.session = identity;
  return identity;
}
function setup(project: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  clients.push(client);
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return renderHook(({ projectId }) => useLocalPersonalContextPrefetch(projectId), {
    initialProps: { projectId: project }, wrapper: Wrapper,
  });
}
function install(read: () => Promise<Response>) {
  const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
    String(url).includes('/memory/local-context') ? read() : json(personal));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
beforeEach(() => {
  state.session = null;
  observeWorkspaceOwner(null);
  replacement();
  useLocalModelSelection.getState().select({ id: 'local:ollama/tiny:1b', serverId: 'ollama', serverLabel: 'Ollama', name: 'tiny:1b' });
});
afterEach(() => {
  state.session = null;
  observeWorkspaceOwner(null);
  clients.splice(0).forEach((client) => client.clear());
  useLocalModelSelection.getState().select(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Local optional personal context ownership', () => {
  it('bootstraps admission, sends explicit bearer and Personal scope, and reads without network or tokens', async () => {
    const fetcher = install(async () => json(context));
    setup();
    await waitFor(() => expect(readLocalPersonalContext(null, state.session)).toEqual(context));
    const call = fetcher.mock.calls.find(([url]) => String(url).includes('/memory/local-context'))!;
    expect(call[1]?.credentials).toBe('omit');
    expect(new Headers(call[1]?.headers).get('Authorization')).toBe('Bearer fixture-token');
    expect(new Headers(call[1]?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE);
    fetcher.mockClear();
    vi.mocked(state.session!.getToken).mockClear();
    expect(readLocalPersonalContext(null, state.session)).toEqual(context);
    expect(readLocalPersonalContext('other-project', state.session)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(state.session!.getToken).not.toHaveBeenCalled();
  });

  it('sends the admitted organization selector rather than ambient workspace selection', async () => {
    const org = '11111111-1111-4111-8111-111111111111';
    const organization = {
      workspaces: [{ id: org, organizationId: org, kind: 'organization', name: 'Team', slug: 'team', isPrimary: true, role: 'owner' }],
      activeWorkspaceId: org, activeOrganizationId: org, scope: 'organization',
    };
    const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      json(String(url).includes('/memory/local-context') ? context : organization));
    vi.stubGlobal('fetch', fetcher);
    setup();
    await waitFor(() => expect(readLocalPersonalContext(null, state.session)).toEqual(context));
    const call = fetcher.mock.calls.find(([url]) => String(url).includes('/memory/local-context'))!;
    expect(new Headers(call[1]?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(org);
    expect(new Headers(call[1]?.headers).get('Authorization')).toBe('Bearer fixture-token');
    expect(call[1]?.credentials).toBe('omit');
  });

  it('does not adopt cached data after a same-user same-session authority replacement', async () => {
    let allowReplacementRead = true;
    install(async () => {
      if (!allowReplacementRead) throw new Error('offline');
      return json(context);
    });
    const hook = setup();
    const previous = state.session!;
    await waitFor(() => expect(readLocalPersonalContext(null, previous)).toEqual(context));
    const oldOwner = observeWorkspaceOwner(previous)!;
    allowReplacementRead = false;
    replacement({ userId: previous.userId, sessionId: previous.sessionId });
    const current = state.session!;
    const nextOwner = observeWorkspaceOwner(current)!;
    expect(nextOwner.incarnation).not.toBe(oldOwner.incarnation);
    hook.rerender({ projectId: null });
    await waitFor(() => expect(nextOwner.phase).toBe('admitted'));
    expect(readLocalPersonalContext(null, current)).toBeNull();
    expect(readLocalPersonalContext(null, previous)).toBeNull();
    expect(observeWorkspaceOwner(current)).toBe(nextOwner);
  });

  it('deduplicates a pending project refresh across focus events and isolates another project', async () => {
    let release!: (value: unknown) => void;
    const body = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const fetcher = install(async () => ({ ok: true, status: 200, json: body }) as unknown as Response);
    setup('project-a');
    await waitFor(() => expect(body).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/memory/local-context'))).toHaveLength(1);
    await act(async () => { release(context); });
    expect(readLocalPersonalContext('project-a', state.session)).toEqual(context);
    expect(readLocalPersonalContext('project-b', state.session)).toBeNull();
  });

  it('retains same-owner data across an offline refresh and has no read TTL', async () => {
    let offline = false;
    const fetcher = install(async () => { if (offline) throw new Error('offline'); return json(context); });
    setup();
    await waitFor(() => expect(readLocalPersonalContext(null, state.session)).toEqual(context));
    offline = true;
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 120_000);
    const calls = fetcher.mock.calls.length;
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(calls));
    expect(readLocalPersonalContext(null, state.session)).toEqual(context);
  });

  it.each([401, 403])('clears only the denied project for status %s without parsing its malformed body', async (status) => {
    let denied = false;
    const body = vi.fn(async () => { throw new Error('malformed'); });
    install(async () => denied ? { ok: false, status, json: body } as unknown as Response : json(context));
    const hook = setup('project-a');
    await waitFor(() => expect(readLocalPersonalContext('project-a', state.session)).toEqual(context));
    hook.rerender({ projectId: 'project-b' });
    await waitFor(() => expect(readLocalPersonalContext('project-b', state.session)).toEqual(context));
    denied = true;
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 120_000);
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(readLocalPersonalContext('project-b', state.session)).toBeNull());
    expect(readLocalPersonalContext('project-a', state.session)).toEqual(context);
    expect(body).not.toHaveBeenCalled();
  });

  it('fences late JSON and never lets a stale turn replace the canonical owner', async () => {
    let release!: (value: unknown) => void;
    const body = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    install(async () => ({ ok: true, status: 200, json: body }) as unknown as Response);
    setup();
    await waitFor(() => expect(body).toHaveBeenCalled());
    const old = state.session;
    replacement();
    const next = observeWorkspaceOwner(state.session);
    await act(async () => { release(context); });
    expect(readLocalPersonalContext(null, old)).toBeNull();
    expect(readLocalPersonalContext(null, state.session)).toBeNull();
    expect(observeWorkspaceOwner(state.session)).toBe(next);
  });

  it.each(['unavailable', 'uncertain'] as const)('omits cached context after workspace becomes %s', async (phase) => {
    install(async () => json(context));
    setup();
    await waitFor(() => expect(readLocalPersonalContext(null, state.session)).toEqual(context));
    const owner = observeWorkspaceOwner(state.session)!;
    act(() => {
      if (phase === 'unavailable') failWorkspaceRead(owner, owner.epoch);
      else {
        const epoch = beginWorkspaceSwitch(owner, owner.epoch);
        finishWorkspaceSwitch(owner, epoch, true);
      }
    });
    expect(readLocalPersonalContext(null, state.session)).toBeNull();
  });

  it('does not fetch or expose context for anonymous identity', () => {
    state.session = null;
    const fetcher = install(async () => json(context));
    setup();
    expect(readLocalPersonalContext(null, null)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
