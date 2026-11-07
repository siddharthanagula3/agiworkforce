import { createElement, StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  MANAGED_CLOUD_WORKSPACES_PATH,
  conversationSharesPath,
} from '@agiworkforce/cloud-contracts';
import { useChatStore } from '@shared/stores/web-chat-store';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import {
  beginWorkspaceSwitch,
  finishWorkspaceSwitch,
  observeWorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';
import { SHARE_CONVERSATION_CLIENT_DEADLINE_MS } from '@/lib/deadline-policy';
import { useShareConversation } from './use-share-conversation';

const boundary = vi.hoisted(() => ({
  session: null as SessionAuthority | null,
  csrf: vi.fn<(headers?: HeadersInit) => Promise<HeadersInit>>(),
}));

vi.mock('@/lib/identity/useSessionSnapshot', () => ({
  useSessionSnapshot: () => () => boundary.session,
}));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: (headers?: HeadersInit) => boundary.csrf(headers),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const OTHER_CONVERSATION = '22222222-2222-4222-8222-222222222222';
const ORGANIZATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORGANIZATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MESSAGE = {
  id: 'msg-1', role: 'user' as const, content: 'hello',
  createdAt: '2026-11-07T00:00:00.000Z',
};
const EXPIRES_AT = '2026-12-07T00:00:00.000Z';
const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
let identity = 0;
let organization: string | null;
let listedTokens: string[];
let token: ReturnType<typeof vi.fn<SessionAuthority['getToken']>>;
let onShareRequest: (url: string, init: RequestInit) => Promise<Response>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

function created(shareToken = 'created') {
  return {
    token: shareToken, shareUrl: `https://example.test/share/${shareToken}`,
    expiresAt: EXPIRES_AT, messageCount: 1, visibility: 'public',
    workspace: organization ? { memberCount: 2 } : null,
  };
}

function list() {
  return {
    shares: listedTokens.map((shareToken) => ({
      ...created(shareToken), title: 'Session', modelId: null, provider: null,
      createdAt: MESSAGE.createdAt, expired: false,
    })),
    workspace: organization ? { memberCount: 2 } : null,
  };
}

function workspace() {
  return {
    workspaces: organization ? [{
      id: `workspace-${organization}`, kind: 'organization', organizationId: organization,
      name: 'Test workspace', slug: 'test', isPrimary: true, role: 'owner',
    }] : [],
    activeWorkspaceId: organization ? `workspace-${organization}` : null,
    activeOrganizationId: organization, scope: organization ? 'organization' : 'personal',
  };
}

function installSession(userId = `user-${++identity}`, sessionId = `session-${identity}`) {
  const current: SessionAuthority = {
    userId, sessionId, isCurrent: () => boundary.session === current,
    getToken: (...args) => token(...args),
  };
  boundary.session = current;
  return current;
}

function shareCalls(method?: string) {
  return fetchMock.mock.calls.filter(([input, init]) =>
    String(input).startsWith('/api/share') && (!method || (init?.method ?? 'GET') === method),
  );
}

function wrapper(strict = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  return ({ children }: { children: ReactNode }) => createElement(
    QueryClientProvider, { client }, strict ? createElement(StrictMode, null, children) : children,
  );
}

function mount(strict = false) {
  return renderHook(
    ({ open, conversationId }) => useShareConversation('My session', undefined, conversationId, open),
    { initialProps: { open: true, conversationId: CONVERSATION }, wrapper: wrapper(strict) },
  );
}

async function ready(hook: ReturnType<typeof mount>) {
  await waitFor(() => {
    expect(hook.result.current.workspacePending).toBe(false);
    expect(hook.result.current.workspaceUnavailable).toBe(false);
    expect(hook.result.current.checkingShare).toBe(false);
    expect(hook.result.current.isViewCurrent()).toBe(true);
  });
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

describe('useShareConversation captured workspace and view lifetime (source-only fixtures)', () => {
  beforeEach(() => {
    organization = ORGANIZATION_A;
    listedTokens = [];
    token = vi.fn<SessionAuthority['getToken']>().mockResolvedValue('captured-session-token');
    installSession();
    boundary.csrf.mockReset().mockImplementation(async (headers = {}) => {
      const result = new Headers(headers);
      result.set('x-csrf-token', 'csrf-token');
      return result;
    });
    useChatStore.setState({ activeConversationId: CONVERSATION, messages: [MESSAGE], conversations: [] });
    onShareRequest = async (url, init) => {
      switch (init.method ?? 'GET') {
        case 'GET': return json(list());
        case 'POST': return json(created(), 201);
        case 'PUT': return json({ refreshed: 1, tokens: listedTokens, messageCount: 1 });
        case 'DELETE': return json({ success: true, revoked: listedTokens.length });
        case 'PATCH': return json({
          token: url.split('/').at(-1), shareUrl: `https://example.test${url}`,
          visibility: 'organization', organizationId: organization, expiresAt: EXPIRES_AT,
        });
        default: throw new Error(`Unexpected method ${init.method}`);
      }
    };
    fetchMock.mockReset().mockImplementation(async (input, init = {}) => {
      const url = String(input);
      if (url === MANAGED_CLOUD_WORKSPACES_PATH) return json(workspace());
      if (url.startsWith('/api/share')) return onShareRequest(url, init);
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    for (const client of clients.splice(0)) client.clear();
    boundary.session = null;
    observeWorkspaceOwner(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    useChatStore.setState({ activeConversationId: null, messages: [], conversations: [] });
  });

  it.each([
    [ORGANIZATION_A, ORGANIZATION_B], [ORGANIZATION_A, null], [null, ORGANIZATION_B],
  ])('pins selector %s and bearer despite an unobserved saved selection %s', async (scope, savedSelection) => {
    organization = scope;
    listedTokens = ['existing'];
    const hook = mount();
    await ready(hook);
    // A saved server selection changing elsewhere must not retarget this admitted view.
    organization = savedSelection;
    await act(async () => { expect(await hook.result.current.share(30)).toBe(true); });
    await act(async () => { expect(await hook.result.current.updateLink()).toBe(true); });
    await act(async () => { expect(await hook.result.current.setAudience('organization')).toBe(true); });
    await act(async () => { expect(await hook.result.current.revoke()).toBe(true); });
    expect(new Set(shareCalls().map(([, init]) => init?.method ?? 'GET')))
      .toEqual(new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']));
    for (const [, init] of shareCalls()) {
      expect(init?.credentials).toBe('omit');
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer captured-session-token');
      expect(headers.get(MANAGED_CLOUD_ORGANIZATION_HEADER))
        .toBe(scope ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE);
    }
    expect(shareCalls('POST')[0]?.[0]).toBe('/api/share');
    const body = JSON.parse(shareCalls('POST')[0]?.[1]?.body as string);
    expect(body).toMatchObject({ conversation_id: CONVERSATION, expires_in_days: 30 });
    expect(body.messages[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(shareCalls('DELETE')[0]?.[0]).toBe(conversationSharesPath(CONVERSATION));
    expect(hook.result.current.activeShare).toBeNull();
  });

  it('permanently retires idle callbacks on same-ID close and reopen', async () => {
    listedTokens = ['existing'];
    const hook = mount();
    await ready(hook);
    const old = hook.result.current;
    hook.rerender({ open: false, conversationId: CONVERSATION });
    expect(old.isViewCurrent()).toBe(false);
    hook.rerender({ open: true, conversationId: CONVERSATION });
    await ready(hook);
    expect(hook.result.current.view).not.toBe(old.view);
    const count = shareCalls().length;
    await act(async () => {
      expect(await old.share(7)).toBe(false);
      expect(await old.updateLink()).toBe(false);
      expect(await old.revoke()).toBe(false);
      expect(await old.setAudience('organization')).toBe(false);
    });
    expect(shareCalls()).toHaveLength(count);
    expect(hook.result.current.error).toBeNull();
    await act(async () => { expect(await hook.result.current.share(7)).toBe(true); });
  });

  it.each(['owner epoch', 'account', 'session', 'conversation'] as const)(
    'retires captured callbacks when the %s changes', async (change) => {
      listedTokens = ['existing'];
      const hook = mount();
      await ready(hook);
      const old = hook.result.current;
      if (change === 'owner epoch') {
        const owner = observeWorkspaceOwner(boundary.session)!;
        act(() => {
          const epoch = beginWorkspaceSwitch(owner, owner.epoch);
          finishWorkspaceSwitch(owner, epoch, true);
        });
      } else if (change === 'conversation') {
        act(() => useChatStore.setState({ activeConversationId: OTHER_CONVERSATION, messages: [MESSAGE] }));
        hook.rerender({ open: true, conversationId: OTHER_CONVERSATION });
      } else {
        installSession(change === 'session' ? boundary.session!.userId : undefined, `replacement-${++identity}`);
        hook.rerender({ open: true, conversationId: CONVERSATION });
      }
      expect(old.isViewCurrent()).toBe(false);
      const mutations = shareCalls().filter(([, init]) => init?.method).length;
      await act(async () => {
        expect(await old.share(7)).toBe(false);
        expect(await old.revoke()).toBe(false);
        expect(await old.updateLink()).toBe(false);
        expect(await old.setAudience('organization')).toBe(false);
      });
      expect(shareCalls().filter(([, init]) => init?.method)).toHaveLength(mutations);
    },
  );

  it.each([
    ['csrf', 'POST'], ['token', 'POST'], ['csrf', 'PUT'], ['token', 'PUT'],
    ['csrf', 'DELETE'], ['token', 'DELETE'], ['csrf', 'PATCH'], ['token', 'PATCH'],
  ] as const)('does not dispatch after retirement during the %s wait for %s', async (boundaryName, method) => {
    listedTokens = ['existing'];
    const hook = mount();
    await ready(hook);
    const csrfWait = deferred<HeadersInit>();
    const tokenWait = deferred<string | null>();
    if (boundaryName === 'csrf') boundary.csrf.mockReturnValueOnce(csrfWait.promise);
    else token.mockReturnValueOnce(tokenWait.promise);
    let pending!: Promise<boolean>;
    act(() => {
      pending = method === 'POST' ? hook.result.current.share(7)
        : method === 'PUT' ? hook.result.current.updateLink()
        : method === 'DELETE' ? hook.result.current.revoke()
        : hook.result.current.setAudience('organization');
    });
    await flush();
    hook.rerender({ open: false, conversationId: CONVERSATION });
    await act(async () => {
      csrfWait.resolve({ 'x-csrf-token': 'csrf-token' });
      tokenWait.resolve('obsolete-token');
      expect(await pending).toBe(false);
    });
    expect(shareCalls(method)).toHaveLength(0);
  });

  it('rejects a replaced session during token resolution even before another render', async () => {
    const hook = mount();
    await ready(hook);
    const waitingToken = deferred<string | null>();
    token.mockReturnValueOnce(waitingToken.promise);
    const callsBefore = token.mock.calls.length;
    let pending!: Promise<boolean>;
    act(() => { pending = hook.result.current.share(7); });
    await waitFor(() => expect(token.mock.calls.length).toBeGreaterThan(callsBefore));
    installSession();
    await act(async () => { waitingToken.resolve('old-account-token'); expect(await pending).toBe(false); });
    expect(shareCalls('POST')).toHaveLength(0);
  });

  it.each([200, 503])('does not let an old lookup %s response replace a reopened view', async (status) => {
    const late = deferred<Response>();
    const normal = onShareRequest;
    let gets = 0;
    onShareRequest = (url, init) => {
      if ((init.method ?? 'GET') === 'GET' && ++gets === 1) return late.promise;
      return normal(url, init);
    };
    const hook = mount();
    await waitFor(() => expect(shareCalls('GET')).toHaveLength(1));
    const oldSignal = shareCalls('GET')[0]?.[1]?.signal;
    hook.rerender({ open: false, conversationId: CONVERSATION });
    listedTokens = ['current'];
    hook.rerender({ open: true, conversationId: CONVERSATION });
    await ready(hook);
    expect(hook.result.current.activeShare?.token).toBe('current');
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      late.resolve(json(status === 200 ? { shares: [], workspace: null } : { error: 'obsolete' }, status));
    });
    expect(hook.result.current.activeShare?.token).toBe('current');
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.checkingShare).toBe(false);
  });

  it('ignores a retired lookup body after fetch itself has completed', async () => {
    const body = deferred<unknown>();
    const readBody = vi.fn(() => body.promise);
    const normal = onShareRequest;
    let gets = 0;
    onShareRequest = async (url, init) => {
      if ((init.method ?? 'GET') !== 'GET' || ++gets !== 1) return normal(url, init);
      const response = json({});
      vi.spyOn(response, 'json').mockImplementation(readBody);
      return response;
    };
    const hook = mount();
    await waitFor(() => expect(readBody).toHaveBeenCalledOnce());
    hook.rerender({ open: false, conversationId: CONVERSATION });
    listedTokens = ['current'];
    hook.rerender({ open: true, conversationId: CONVERSATION });
    await ready(hook);
    await act(async () => { body.resolve({ shares: [], workspace: null }); });
    expect(hook.result.current.activeShare?.token).toBe('current');
    expect(hook.result.current.error).toBeNull();
  });

  it.each([201, 403])('ignores a retired %s response body and cannot clear a newer busy state', async (status) => {
    const body = deferred<unknown>();
    const newer = deferred<Response>();
    const readBody = vi.fn(() => body.promise);
    const normal = onShareRequest;
    let posts = 0;
    onShareRequest = async (url, init) => {
      if (init.method !== 'POST') return normal(url, init);
      if (++posts > 1) return newer.promise;
      const response = json({}, status);
      vi.spyOn(response, 'json').mockImplementation(readBody);
      return response;
    };
    const hook = mount();
    await ready(hook);
    const oldCallbacks = hook.result.current;
    let old!: Promise<boolean>;
    act(() => { old = hook.result.current.share(7); });
    await waitFor(() => expect(readBody).toHaveBeenCalledOnce());
    hook.rerender({ open: false, conversationId: CONVERSATION });
    hook.rerender({ open: true, conversationId: CONVERSATION });
    await ready(hook);
    let current!: Promise<boolean>;
    act(() => { current = hook.result.current.share(7); });
    await waitFor(() => expect(shareCalls('POST')).toHaveLength(2));
    act(() => oldCallbacks.cancelPending());
    expect(shareCalls('POST')[1]?.[1]?.signal?.aborted).toBe(false);
    expect(hook.result.current.isSharing).toBe(true);
    await act(async () => {
      body.resolve(status === 201 ? created('obsolete') : { error: { message: 'obsolete failure' } });
      expect(await old).toBe(false);
    });
    expect(hook.result.current.isSharing).toBe(true);
    expect(hook.result.current.activeShare).toBeNull();
    expect(hook.result.current.error).toBeNull();
    await act(async () => { newer.resolve(json(created('current'), 201)); expect(await current).toBe(true); });
    expect(hook.result.current.activeShare?.token).toBe('current');
  });

  it('ignores a late response from a transport that does not honor abort', async () => {
    const late = deferred<Response>();
    const normal = onShareRequest;
    onShareRequest = (url, init) => init.method === 'POST' ? late.promise : normal(url, init);
    const hook = mount();
    await ready(hook);
    let pending!: Promise<boolean>;
    act(() => { pending = hook.result.current.share(7); });
    await waitFor(() => expect(shareCalls('POST')).toHaveLength(1));
    const signal = shareCalls('POST')[0]?.[1]?.signal;
    act(() => hook.result.current.cancelPending());
    hook.rerender({ open: false, conversationId: CONVERSATION });
    expect(signal?.aborted).toBe(true);
    await act(async () => { late.resolve(json(created('late'), 201)); expect(await pending).toBe(false); });
    expect(hook.result.current.activeShare).toBeNull();
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.isSharing).toBe(false);
  });

  it('stops before the next audience mutation if the view retires while the first body waits', async () => {
    listedTokens = ['first', 'second'];
    const firstBody = deferred<unknown>();
    const readBody = vi.fn(() => firstBody.promise);
    const normal = onShareRequest;
    onShareRequest = async (url, init) => {
      if (init.method !== 'PATCH') return normal(url, init);
      const response = json({});
      vi.spyOn(response, 'json').mockImplementation(readBody);
      return response;
    };
    const hook = mount();
    await ready(hook);
    let pending!: Promise<boolean>;
    act(() => { pending = hook.result.current.setAudience('organization'); });
    await waitFor(() => expect(readBody).toHaveBeenCalledOnce());
    hook.rerender({ open: false, conversationId: CONVERSATION });
    await act(async () => {
      firstBody.resolve({ token: 'first', shareUrl: created('first').shareUrl,
        visibility: 'organization', organizationId: ORGANIZATION_A, expiresAt: EXPIRES_AT });
      expect(await pending).toBe(false);
    });
    expect(shareCalls('PATCH')).toHaveLength(1);
  });

  it('publishes a usable fresh activation under StrictMode effect replay', async () => {
    const hook = mount(true);
    await ready(hook);
    expect(hook.result.current.view).not.toBeNull();
    await act(async () => { expect(await hook.result.current.share(7)).toBe(true); });
    expect(shareCalls('POST')).toHaveLength(1);
    expect(hook.result.current.activeShare?.token).toBe('created');
  });

  it('blocks all mutations when workspace admission fails', async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === MANAGED_CLOUD_WORKSPACES_PATH) return json({}, 503);
      throw new Error('Share traffic must not escape unavailable admission');
    });
    const hook = mount();
    await waitFor(() => expect(hook.result.current.workspaceUnavailable).toBe(true));
    await act(async () => {
      expect(await hook.result.current.share(7)).toBe(false);
      expect(await hook.result.current.updateLink()).toBe(false);
      expect(await hook.result.current.revoke()).toBe(false);
      expect(await hook.result.current.setAudience('organization')).toBe(false);
    });
    expect(shareCalls()).toHaveLength(0);
    expect(hook.result.current.error).toEqual(expect.any(String));
  });

  it('retains ordinary list-error fallback inside an admitted view', async () => {
    const normal = onShareRequest;
    onShareRequest = (url, init) => (init.method ?? 'GET') === 'GET'
      ? Promise.resolve(json({}, 503)) : normal(url, init);
    const hook = mount();
    await ready(hook);
    expect(hook.result.current.error).toEqual(expect.any(String));
    await act(async () => { expect(await hook.result.current.share(7)).toBe(true); });
    expect(hook.result.current.activeShare?.mayHaveUnlistedLinks).toBe(true);
  });

  it('preserves timeout guidance and allows retry in the current view', async () => {
    const hook = mount();
    await ready(hook);
    const normal = onShareRequest;
    let posts = 0;
    onShareRequest = (url, init) => {
      if (init.method === 'POST' && ++posts === 1) return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
      return normal(url, init);
    };
    vi.useFakeTimers();
    let pending!: Promise<boolean>;
    act(() => { pending = hook.result.current.share(7); });
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SHARE_CONVERSATION_CLIENT_DEADLINE_MS);
      expect(await pending).toBe(false);
    });
    expect(hook.result.current.error).toMatch(/took too long/i);
    expect(hook.result.current.isViewCurrent()).toBe(true);
    await act(async () => { expect(await hook.result.current.share(7)).toBe(true); });
    expect(hook.result.current.error).toBeNull();
  });

  it('refuses temporary chats and unavailable transcripts without posting', async () => {
    useChatStore.setState({ conversations: [{ id: CONVERSATION, title: 'Scratch', isTemporary: true } as never] });
    const hook = mount();
    await ready(hook);
    await act(async () => { expect(await hook.result.current.share(7)).toBe(false); });
    expect(hook.result.current.error).toMatch(/temporary chat cannot be shared/i);
    act(() => useChatStore.setState({ conversations: [], activeConversationId: OTHER_CONVERSATION }));
    await ready(hook);
    await act(async () => { expect(await hook.result.current.share(7)).toBe(false); });
    expect(hook.result.current.error).toMatch(/still loading/i);
    expect(shareCalls('POST')).toHaveLength(0);
  });

  it('captures the transcript and safe attachment descriptors before awaiting CSRF', async () => {
    const message = { ...MESSAGE, attachments: [{
      id: 'attachment', assetId: 'asset', type: 'image' as const, name: 'diagram.png',
      mimeType: 'image/png', url: '/api/files/asset',
    }] };
    useChatStore.setState({ messages: [message] });
    const hook = mount();
    await ready(hook);
    const csrf = deferred<HeadersInit>();
    boundary.csrf.mockReturnValueOnce(csrf.promise);
    let pending!: Promise<boolean>;
    act(() => { pending = hook.result.current.share(30); });
    message.content = 'edited while CSRF waits';
    message.attachments[0]!.name = 'changed.png';
    await act(async () => { csrf.resolve({}); expect(await pending).toBe(true); });
    const body = JSON.parse(shareCalls('POST')[0]?.[1]?.body as string);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe('hello');
    expect(body.messages[0].attachments).toEqual([
      { name: 'diagram.png', type: 'image', mimeType: 'image/png' },
    ]);
  });
});
