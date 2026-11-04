import { createRequestAuthority } from '@/lib/identity/request-authority';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatProjectStore } from '@agiworkforce/unified-chat';
import { managedCloudConversationPath } from '@agiworkforce/cloud-contracts';
import { getModelsForTierAndSurface } from '@agiworkforce/types';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useChatStore, type Conversation } from '@shared/stores/web-chat-store';
import {
  clearPendingDraftClear,
  markPendingDraftClear,
} from '@/features/chat/lib/pending-draft-clear';
import {
  clearObservedConversationDraftRevisions,
  saveConversationDraft,
} from '@/features/chat/services/conversation-draft';
import {
  __resetConversationListLoadForTests,
  useConversations,
  useProjectConversations,
} from './useConversations';

const authMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  userId: 'user-1',
  sessionId: 'session-1',
  isSignedIn: true,
  isLoaded: true,
  sdk: {
    loaded: true,
    user: null as { id: string } | null,
    session: null as {
      id: string;
      user: { id: string };
      getToken: () => Promise<string | null>;
    } | null,
  },
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: authMocks.getToken,
    isLoaded: authMocks.isLoaded,
    isSignedIn: authMocks.isSignedIn,
    userId: authMocks.userId,
    sessionId: authMocks.sessionId,
  }),
  useClerk: () => authMocks.sdk,
}));

function switchSession(userId: string, sessionId: string, getToken = authMocks.getToken) {
  authMocks.userId = userId;
  authMocks.sessionId = sessionId;
  authMocks.sdk.user = { id: userId };
  authMocks.sdk.session = { id: sessionId, user: authMocks.sdk.user, getToken };
}

beforeEach(() => {
  authMocks.isLoaded = true;
  authMocks.isSignedIn = true;
  authMocks.sdk.loaded = true;
  switchSession('user-1', 'session-1');
});

afterEach(() => __resetConversationListLoadForTests());

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const WIRE_CONVERSATION = {
  id: 'c0ffee00-0000-4000-8000-000000000001',
  title: 'New Chat',
  model: 'auto',
  project_id: null as string | null,
  pinned: false,
  starred: false,
  archived: false,
  is_temporary: false,
  created_at: '2026-07-16T00:00:00.000Z',
  updated_at: '2026-07-16T00:00:00.000Z',
};

const DEEP_LINK_MODEL = getModelsForTierAndSurface('max', 'web/cloud-chat', {
  modelTypes: ['chat', 'code', 'reasoning', 'multimodal', 'search'],
})[0];
if (!DEEP_LINK_MODEL) throw new Error('Expected a selectable Web cloud-chat model fixture');

const DEEP_LINK_CONVERSATION = {
  ...WIRE_CONVERSATION,
  id: 'c0ffee00-0000-4000-8000-000000000099',
  title: 'Older direct link',
  model: DEEP_LINK_MODEL.id,
};

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function deferredBody(status = 200) {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => { resolve = done; });
  const response = new Response(null, { status });
  vi.spyOn(response, 'json').mockImplementation(() => promise);
  return { response, resolve };
}

function conversationListResponse(conversations: (typeof WIRE_CONVERSATION)[] = []) {
  return new Response(JSON.stringify({ conversations, hasMore: false, nextOffset: 0 }), {
    status: 200,
  });
}

function conversationDetailResponse() {
  return new Response(
    JSON.stringify({
      conversation: DEEP_LINK_CONVERSATION,
      messages: [],
      total: 0,
      hasMore: false,
    }),
    { status: 200 },
  );
}

function mockFetchRoutes() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST' && String(input) === '/api/chat/conversations') {
      const body = JSON.parse(String(init.body)) as { projectId?: string };
      return new Response(
        JSON.stringify({
          conversation: { ...WIRE_CONVERSATION, project_id: body.projectId ?? null },
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify({ conversations: [], hasMore: false, nextOffset: 0 }), {
      status: 200,
    });
  });
}

function findPostBody(): Record<string, unknown> {
  const postCall = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
  expect(postCall).toBeDefined();
  return JSON.parse(String(postCall![1]!.body)) as Record<string, unknown>;
}

describe('useConversations.createConversation', () => {
  beforeEach(() => {
    __resetConversationListLoadForTests();
    clearObservedConversationDraftRevisions();
    useChatStore.getState().reset();
    useSettingsStore.getState().setNewChatsTemporary(false);
    useChatProjectStore.setState({ projects: [], activeProjectId: null });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', mockFetchRoutes());
  });

  it('does not publish a create response decoded after its original session retires', async () => {
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    let decode!: (value: unknown) => void;
    const response = new Response(null, { status: 200 });
    vi.spyOn(response, 'json').mockImplementation(() => new Promise((resolve) => { decode = resolve; }));
    vi.mocked(fetch).mockResolvedValueOnce(response);
    const authority = createRequestAuthority({
      userId: 'user-1', sessionId: 'session-1', isCurrent: () => true,
      getToken: async () => 'original-session-token',
    });
    await act(async () => {
      const creating = result.current.createConversation('New Chat', 'auto', null, { authority });
      const rejected = expect(creating).rejects.toMatchObject({ name: 'AbortError' });
      await vi.waitFor(() => expect(response.json).toHaveBeenCalled());
      authority.retire();
      decode({ conversation: WIRE_CONVERSATION });
      await rejected;
    });
    expect(useChatStore.getState().conversations).toHaveLength(0);
    expect(useChatStore.getState().activeConversationId).toBeNull();
    expect(useChatStore.getState().error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('settles only its own create busy lease when an earlier request retires', async () => {
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const earlierResponse = deferredResponse();
    const laterResponse = deferredResponse();
    vi.mocked(fetch).mockReturnValueOnce(earlierResponse.promise).mockReturnValueOnce(laterResponse.promise);
    const earlierAuthority = createRequestAuthority({
      userId: 'user-1', sessionId: 'session-1', isCurrent: () => true,
      getToken: async () => 'original-session-token',
    });
    const laterAuthority = createRequestAuthority(earlierAuthority.session);
    let earlier!: Promise<Conversation | null>;
    let later!: Promise<Conversation | null>;
    let rejected!: Promise<void>;
    await act(async () => {
      earlier = result.current.createConversation('Earlier', 'auto', null, { authority: earlierAuthority });
      rejected = expect(earlier).rejects.toMatchObject({ name: 'AbortError' });
      await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/chat/conversations', expect.objectContaining({ body: expect.stringContaining('Earlier') }),
      ));
      later = result.current.createConversation('Later', 'auto', null, { authority: laterAuthority });
      await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/chat/conversations', expect.objectContaining({ body: expect.stringContaining('Later') }),
      ));
    });
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      earlierAuthority.retire();
      earlierResponse.resolve(new Response(JSON.stringify({ conversation: WIRE_CONVERSATION })));
      await rejected;
    });
    expect(result.current.isLoading).toBe(true);
    expect(useChatStore.getState().conversations).toHaveLength(0);
    await act(async () => {
      laterResponse.resolve(new Response(JSON.stringify({ conversation: WIRE_CONVERSATION })));
      await later;
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('retains an accepted background creation without activating it after navigation', async () => {
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    const response = deferredResponse();
    vi.mocked(fetch).mockReturnValueOnce(response.promise);
    const authority = createRequestAuthority({
      userId: 'user-1', sessionId: 'session-1', isCurrent: () => true,
      getToken: async () => 'original-session-token',
    });
    let foreground = true;
    await act(async () => {
      const creating = result.current.createConversation('New Chat', 'auto', null, {
        authority, shouldActivate: () => foreground,
      });
      await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/chat/conversations', expect.objectContaining({ method: 'POST' }),
      ));
      foreground = false;
      useChatStore.getState().setActiveConversation('different-chat');
      response.resolve(new Response(JSON.stringify({ conversation: WIRE_CONVERSATION })));
      await expect(creating).resolves.toMatchObject({ id: WIRE_CONVERSATION.id });
    });
    expect(useChatStore.getState().conversations.some((item) => item.id === WIRE_CONVERSATION.id)).toBe(true);
    expect(useChatStore.getState().activeConversationId).toBe('different-chat');
    expect(authority.isCurrent()).toBe(true);
  });

  it('threads the selected projectId into the POST body and returns it on the conversation', async () => {
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const out: { created: Conversation | null } = { created: null };
    await act(async () => {
      out.created = await result.current.createConversation('New Chat', 'auto', 'proj-123');
    });

    expect(findPostBody()).toMatchObject({
      title: 'New Chat',
      model: 'auto',
      projectId: 'proj-123',
    });
    expect(out.created?.projectId).toBe('proj-123');
  });

  it('omits projectId from the POST body when no project is selected', async () => {
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    await act(async () => {
      await result.current.createConversation('New Chat', 'auto');
    });

    expect(findPostBody()).not.toHaveProperty('projectId');
  });

  it('explains a conversation-creation rate limit using the server retry window', async () => {
    const normalFetch = mockFetchRoutes();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST' && String(input) === '/api/chat/conversations') {
          return new Response(JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED' } }), {
            status: 429,
            headers: { 'retry-after': '60' },
          });
        }
        return normalFetch(input, init);
      }),
    );

    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    let created: Conversation | null = null;
    await act(async () => {
      created = await result.current.createConversation('New Chat', 'auto');
    });

    expect(created).toBeNull();
    expect(useChatStore.getState().error).toMatch(/try again in about 60 seconds/i);
  });

  it('inherits the temporary default when there is no per-chat choice', async () => {
    useSettingsStore.getState().setNewChatsTemporary(true);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    await act(async () => {
      await result.current.createConversation('New Chat', 'auto');
    });
    expect(findPostBody()).toMatchObject({ isTemporary: true });
  });

  it('preserves a captured opt-out after the active conversation consumes the pending choice', async () => {
    useSettingsStore.getState().setNewChatsTemporary(true);
    useChatStore.getState().setPendingTemporaryChat(false);
    useChatStore.getState().setActiveConversation('placeholder');
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    await act(async () => {
      await result.current.createConversation('New Chat', 'auto', null, { isTemporary: false });
    });
    expect(findPostBody()).not.toHaveProperty('isTemporary');
  });

  it('lets an explicit composer choice override the temporary default', async () => {
    useSettingsStore.getState().setNewChatsTemporary(true);
    useChatStore.getState().setPendingTemporaryChat(false);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    await act(async () => {
      await result.current.createConversation('New Chat', 'auto');
    });
    expect(findPostBody()).not.toHaveProperty('isTemporary');
  });

  it('marks the first conversation temporary when armed from the composer before it existed', async () => {
    useChatStore.getState().setPendingTemporaryChat(true);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    await act(async () => {
      await result.current.createConversation('New Chat', 'auto');
    });

    expect(findPostBody()).toMatchObject({ isTemporary: true });
  });

  it('honours the temporary intent the caller captured before the active id switch cleared it', async () => {
    useChatStore.getState().setPendingTemporaryChat(true);
    useChatStore.getState().setActiveConversation('placeholder-1');
    expect(useChatStore.getState().pendingTemporaryChat).toBeNull();
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    await act(async () => {
      await result.current.createConversation('New Chat', 'auto', null, { isTemporary: true });
    });

    expect(findPostBody()).toMatchObject({ isTemporary: true });
  });

  it('never quietly saves a chat the caller asked to keep temporary, even inside a project', async () => {
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    await act(async () => {
      await result.current.createConversation('New Chat', 'auto', 'proj-123', {
        isTemporary: true,
      });
    });

    expect(findPostBody()).toMatchObject({ projectId: 'proj-123', isTemporary: true });
  });

  it('starts a saved chat inside a project when temporary is only the default', async () => {
    useSettingsStore.getState().setNewChatsTemporary(true);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    await act(async () => {
      await result.current.createConversation('New Chat', 'auto', 'proj-123');
    });

    expect(findPostBody()).toMatchObject({ projectId: 'proj-123' });
    expect(findPostBody()).not.toHaveProperty('isTemporary');
  });

  it('consuming the pending flag at creation clears it for the next chat', async () => {
    useChatStore.getState().setPendingTemporaryChat(true);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    await act(async () => {
      await result.current.createConversation('New Chat', 'auto');
    });

    expect(useChatStore.getState().pendingTemporaryChat).toBeNull();
  });
});

describe('useConversations.updateConversation', () => {
  beforeEach(() => {
    __resetConversationListLoadForTests();
    useChatStore.getState().reset();
    useSettingsStore.getState().setNewChatsTemporary(false);
    useChatProjectStore.setState({
      projects: [
        {
          id: 'proj-123',
          name: 'Investor Demo Recall',
          createdAt: '2026-07-16T00:00:00.000Z',
          updatedAt: '2026-07-16T00:00:00.000Z',
          conversationIds: [],
        },
      ],
      activeProjectId: null,
    });
    authMocks.getToken.mockResolvedValue('session-token');
  });

  it('updates the shared project count after a conversation move succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          return new Response(
            JSON.stringify({
              conversation: { ...WIRE_CONVERSATION, project_id: 'proj-123' },
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ conversations: [WIRE_CONVERSATION], hasMore: false, nextOffset: 0 }),
          { status: 200 },
        );
      }),
    );

    const { result } = renderHook(() => useConversations());
    await waitFor(() =>
      expect(
        useChatStore.getState().conversations.some(({ id }) => id === WIRE_CONVERSATION.id),
      ).toBe(true),
    );
    await act(async () => {
      await result.current.updateConversation(WIRE_CONVERSATION.id, {
        projectId: 'proj-123',
      });
    });

    expect(useChatProjectStore.getState().projects[0]?.conversationIds).toEqual([
      WIRE_CONVERSATION.id,
    ]);
  });

  it('persists a catalog model change and mirrors the server value into the conversation', async () => {
    const selectedModel = getModelsForTierAndSurface('max', 'web/cloud-chat', {
      modelTypes: ['chat', 'code', 'reasoning', 'multimodal', 'search'],
    })[0];
    expect(selectedModel).toBeDefined();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          expect(JSON.parse(String(init.body))).toMatchObject({ model: selectedModel!.id });
          return new Response(
            JSON.stringify({
              conversation: { ...WIRE_CONVERSATION, model: selectedModel!.id },
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ conversations: [WIRE_CONVERSATION], hasMore: false, nextOffset: 0 }),
          { status: 200 },
        );
      }),
    );

    const { result } = renderHook(() => useConversations());
    await waitFor(() =>
      expect(
        useChatStore.getState().conversations.some(({ id }) => id === WIRE_CONVERSATION.id),
      ).toBe(true),
    );
    await act(async () => {
      expect(
        await result.current.updateConversation(WIRE_CONVERSATION.id, {
          model: selectedModel!.id,
        }),
      ).toBe(true);
    });

    expect(
      useChatStore.getState().conversations.find(({ id }) => id === WIRE_CONVERSATION.id)?.model,
    ).toBe(selectedModel!.id);
  });
});

describe('useConversations.loadConversation pagination races', () => {
  beforeEach(() => {
    __resetConversationListLoadForTests();
    useChatStore.getState().reset();
    useSettingsStore.getState().setNewChatsTemporary(false);
    authMocks.getToken.mockResolvedValue('session-token');
    clearPendingDraftClear(DEEP_LINK_CONVERSATION.id);
  });

  it('does not resurrect a cleared local draft from an older server snapshot after reload', async () => {
    markPendingDraftClear(DEEP_LINK_CONVERSATION.id);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes(DEEP_LINK_CONVERSATION.id)
          ? new Response(
              JSON.stringify({
                conversation: { ...DEEP_LINK_CONVERSATION, draft: 'cleared before refresh' },
                messages: [],
                total: 0,
                hasMore: false,
              }),
              { status: 200 },
            )
          : conversationListResponse([WIRE_CONVERSATION]),
      ),
    );
    const { result } = renderHook(() => useConversations());

    await act(async () => {
      expect(await result.current.loadConversation(DEEP_LINK_CONVERSATION.id)).toBe(true);
    });

    expect(useChatStore.getState().getDraftContent(DEEP_LINK_CONVERSATION.id)).toBe('');
    expect(useChatStore.getState().draftsByConversation[DEEP_LINK_CONVERSATION.id]).toBe('');
  });

  it('carries the loaded server draft revision into the next save', async () => {
    const revision = '2026-09-23T00:00:00.000Z';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return new Response(
          JSON.stringify({ saved: true, draftUpdatedAt: '2026-09-23T00:00:01.000Z' }),
          { status: 200 },
        );
      }
      return String(input).includes(DEEP_LINK_CONVERSATION.id)
        ? new Response(
            JSON.stringify({
              conversation: {
                ...DEEP_LINK_CONVERSATION,
                draft: 'an earlier draft',
                draft_updated_at: revision,
              },
              messages: [],
              total: 0,
              hasMore: false,
            }),
            { status: 200 },
          )
        : conversationListResponse([WIRE_CONVERSATION]);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useConversations());

    await act(async () => {
      expect(await result.current.loadConversation(DEEP_LINK_CONVERSATION.id)).toBe(true);
    });
    expect(
      await saveConversationDraft(DEEP_LINK_CONVERSATION.id, 'edited draft', {
        userId: authMocks.userId,
        sessionId: authMocks.sessionId,
        isCurrent: () => true,
        getToken: authMocks.getToken,
      }, () => true),
    ).toBe('saved');

    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(JSON.parse(String(putCall![1]?.body)).draftUpdatedAt).toBe(revision);
  });

  it('does not erase a live local draft when another tab has a pending clear marker', async () => {
    markPendingDraftClear(DEEP_LINK_CONVERSATION.id);
    useChatStore.getState().setDraftContent('newer text in this tab', DEEP_LINK_CONVERSATION.id);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes(DEEP_LINK_CONVERSATION.id)
          ? new Response(
              JSON.stringify({
                conversation: { ...DEEP_LINK_CONVERSATION, draft: 'older server text' },
                messages: [],
                total: 0,
                hasMore: false,
              }),
              { status: 200 },
            )
          : conversationListResponse([WIRE_CONVERSATION]),
      ),
    );
    const { result } = renderHook(() => useConversations());

    await act(async () => {
      expect(await result.current.loadConversation(DEEP_LINK_CONVERSATION.id)).toBe(true);
    });

    expect(useChatStore.getState().getDraftContent(DEEP_LINK_CONVERSATION.id)).toBe(
      'newer text in this tab',
    );
  });

  it('upserts a deep-linked detail after the first sidebar page has loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes(DEEP_LINK_CONVERSATION.id)
          ? conversationDetailResponse()
          : conversationListResponse([WIRE_CONVERSATION]),
      ),
    );
    const { result } = renderHook(() => useConversations());
    await waitFor(() =>
      expect(useChatStore.getState().conversations).toContainEqual(
        expect.objectContaining({ id: WIRE_CONVERSATION.id }),
      ),
    );

    await act(async () => {
      expect(await result.current.loadConversation(DEEP_LINK_CONVERSATION.id)).toBe(true);
    });

    expect(useChatStore.getState().conversations).toContainEqual(
      expect.objectContaining({
        id: DEEP_LINK_CONVERSATION.id,
        model: DEEP_LINK_CONVERSATION.model,
      }),
    );
  });

  it('loads every message page before installing the transcript', async () => {
    const wireMessage = (id: string, content: string) => ({
      id,
      role: 'assistant' as const,
      content,
      model: null,
      provider: null,
      input_tokens: 0,
      output_tokens: 0,
      created_at: '2026-07-16T00:02:00.000Z',
      metadata: null,
    });
    const firstMessages = [
      wireMessage('10000000-0000-4000-8000-000000000001', 'first'),
      wireMessage('10000000-0000-4000-8000-000000000002', 'second'),
    ];
    const finalMessage = wireMessage('10000000-0000-4000-8000-000000000003', 'third');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (!url.includes(DEEP_LINK_CONVERSATION.id)) {
          return conversationListResponse([WIRE_CONVERSATION]);
        }
        const secondPage = url.includes('offset=2');
        return new Response(
          JSON.stringify({
            conversation: DEEP_LINK_CONVERSATION,
            messages: secondPage ? [finalMessage] : firstMessages,
            total: 3,
            hasMore: !secondPage,
          }),
          { status: 200 },
        );
      }),
    );
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    await act(async () => {
      expect(await result.current.loadConversation(DEEP_LINK_CONVERSATION.id)).toBe(true);
    });

    expect(
      useChatStore
        .getState()
        .messagesByConversation[DEEP_LINK_CONVERSATION.id]?.map(({ content }) => content),
    ).toEqual(['first', 'second', 'third']);
    const detailUrls = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => String(input))
      .filter((url) => url.includes(DEEP_LINK_CONVERSATION.id));
    expect(detailUrls).toEqual([
      `${managedCloudConversationPath(DEEP_LINK_CONVERSATION.id)}?limit=500&offset=0`,
      `${managedCloudConversationPath(DEEP_LINK_CONVERSATION.id)}?limit=500&offset=2`,
    ]);
  });

  describe('reopening a cached transcript', () => {
    const cachedId = '10000000-0000-4000-8000-000000000011';
    const newerId = '10000000-0000-4000-8000-000000000012';
    const wireMessage = (id: string, content: string, parentId: string | null) => ({
      id,
      role: 'assistant' as const,
      content,
      model: null,
      provider: null,
      input_tokens: 0,
      output_tokens: 0,
      created_at: '2026-07-16T00:02:00.000Z',
      parent_id: parentId,
      metadata: null,
    });

    beforeEach(() => {
      useChatStore.getState().setActiveConversationWithMessages(
        DEEP_LINK_CONVERSATION.id,
        [
          {
            id: cachedId,
            role: 'assistant',
            content: 'cached locally',
            createdAt: '2026-07-16T00:02:00.000Z',
            parentId: null,
          },
        ],
        null,
      );
      useChatStore.getState().setActiveConversation(null);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).includes(DEEP_LINK_CONVERSATION.id)
            ? new Response(
                JSON.stringify({
                  conversation: { ...DEEP_LINK_CONVERSATION, active_leaf_message_id: newerId },
                  messages: [
                    wireMessage(cachedId, 'server copy', null),
                    wireMessage(newerId, 'persisted elsewhere', cachedId),
                  ],
                  total: 2,
                  hasMore: false,
                }),
                { status: 200 },
              )
            : conversationListResponse([WIRE_CONVERSATION]),
        ),
      );
    });

    it('takes newer persisted messages while keeping the cached rows', async () => {
      const { result } = renderHook(() => useConversations());

      await act(async () => {
        expect(await result.current.loadConversation(DEEP_LINK_CONVERSATION.id)).toBe(true);
      });

      const state = useChatStore.getState();
      expect(state.activeConversationId).toBe(DEEP_LINK_CONVERSATION.id);
      expect(state.messages.map(({ content }) => content)).toEqual([
        'cached locally',
        'persisted elsewhere',
      ]);
      expect(state.activeLeafByConversation[DEEP_LINK_CONVERSATION.id]).toBe(newerId);
    });

    it('keeps the cached transcript while a turn is streaming in it', async () => {
      useChatStore.setState({ streamingConversationIds: [DEEP_LINK_CONVERSATION.id] });
      const { result } = renderHook(() => useConversations());

      await act(async () => {
        expect(await result.current.loadConversation(DEEP_LINK_CONVERSATION.id)).toBe(true);
      });

      expect(
        useChatStore
          .getState()
          .messagesByConversation[DEEP_LINK_CONVERSATION.id]?.map(({ content }) => content),
      ).toEqual(['cached locally']);
    });

    it('quietly takes a turn added on another surface into the open conversation', async () => {
      useChatStore.getState().setActiveConversation(DEEP_LINK_CONVERSATION.id);
      const { result } = renderHook(() => useConversations());

      await act(async () => {
        expect(await result.current.refreshOpenConversation(DEEP_LINK_CONVERSATION.id)).toBe(true);
      });

      const state = useChatStore.getState();
      expect(state.messages.map(({ content }) => content)).toEqual([
        'cached locally',
        'persisted elsewhere',
      ]);
      expect(result.current.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('does not refresh a conversation that is not open or has a turn in flight', async () => {
      const { result } = renderHook(() => useConversations());
      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
      vi.mocked(fetch).mockClear();

      await act(async () => {
        expect(await result.current.refreshOpenConversation(DEEP_LINK_CONVERSATION.id)).toBe(false);
      });
      useChatStore.getState().setActiveConversation(DEEP_LINK_CONVERSATION.id);
      useChatStore.setState({ streamingConversationIds: [DEEP_LINK_CONVERSATION.id] });
      await act(async () => {
        expect(await result.current.refreshOpenConversation(DEEP_LINK_CONVERSATION.id)).toBe(false);
      });

      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([input]) => String(input).includes(DEEP_LINK_CONVERSATION.id)),
      ).toHaveLength(0);
    });

    it('keeps a failed refresh silent', async () => {
      useChatStore.getState().setActiveConversation(DEEP_LINK_CONVERSATION.id);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).includes(DEEP_LINK_CONVERSATION.id)
            ? new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })
            : conversationListResponse([WIRE_CONVERSATION]),
        ),
      );
      const { result } = renderHook(() => useConversations());

      await act(async () => {
        expect(await result.current.refreshOpenConversation(DEEP_LINK_CONVERSATION.id)).toBe(false);
      });

      expect(useChatStore.getState().error).toBeNull();
      expect(result.current.getConversationLoadError()).toBeNull();
      expect(
        useChatStore
          .getState()
          .messagesByConversation[DEEP_LINK_CONVERSATION.id]?.map(({ content }) => content),
      ).toEqual(['cached locally']);
    });
  });

  it('preserves a deep-linked detail when the first sidebar page resolves later', async () => {
    const list = deferredResponse();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes(DEEP_LINK_CONVERSATION.id)
          ? Promise.resolve(conversationDetailResponse())
          : list.promise,
      ),
    );
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));

    await act(async () => {
      expect(await result.current.loadConversation(DEEP_LINK_CONVERSATION.id)).toBe(true);
    });
    await act(async () => {
      list.resolve(conversationListResponse([WIRE_CONVERSATION]));
      await list.promise;
    });

    await waitFor(() =>
      expect(useChatStore.getState().conversations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: DEEP_LINK_CONVERSATION.id,
            model: DEEP_LINK_CONVERSATION.model,
          }),
          expect.objectContaining({ id: WIRE_CONVERSATION.id }),
        ]),
      ),
    );
  });
});

describe('WEB-WEB-CHAT-PAGE-SIDEBAR-RECENTS-LIST-HARD-01', () => {
  const PAGE = [
    WIRE_CONVERSATION,
    { ...WIRE_CONVERSATION, id: 'c0ffee00-0000-4000-8000-000000000011' },
    { ...WIRE_CONVERSATION, id: 'c0ffee00-0000-4000-8000-000000000012' },
  ];

  beforeEach(() => {
    __resetConversationListLoadForTests();
    useChatStore.getState().reset();
    useSettingsStore.getState().setNewChatsTemporary(false);
    useChatProjectStore.setState({ projects: [], activeProjectId: null });
    authMocks.getToken.mockResolvedValue('session-token');
  });

  function stubPagedList(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ conversations: PAGE, hasMore: true, nextOffset: PAGE.length }),
          { status: 200 },
        );
      }),
    );
  }

  it('resumes after the rows still held, so deleting one skips none of the rest', async () => {
    stubPagedList();
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.hasMoreConversations).toBe(true));

    act(() => {
      useChatStore.getState().deleteConversation(PAGE[1]!.id);
    });
    await act(async () => {
      await result.current.loadMoreConversations();
    });

    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining(`offset=${PAGE.length - 1}`),
      expect.any(Object),
    );
  });

  it('resumes at the served count when nothing was removed', async () => {
    stubPagedList();
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.hasMoreConversations).toBe(true));

    await act(async () => {
      await result.current.loadMoreConversations();
    });

    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining(`offset=${PAGE.length}`),
      expect.any(Object),
    );
  });
});

describe('useProjectConversations', () => {
  beforeEach(() => {
    __resetConversationListLoadForTests();
    useChatStore.getState().reset();
    useSettingsStore.getState().setNewChatsTemporary(false);
    authMocks.getToken.mockResolvedValue('session-token');
  });

  it('loads the canonical server project_id listing without reading project.conversationIds', async () => {
    const projectConversation = {
      ...WIRE_CONVERSATION,
      id: 'c0ffee00-0000-4000-8000-000000000002',
      title: 'Project planning',
      project_id: 'proj-123',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              conversations: [projectConversation],
              hasMore: false,
              nextOffset: 1,
            }),
            { status: 200 },
          ),
      ),
    );

    const { result } = renderHook(() => useProjectConversations('proj-123'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetch).toHaveBeenCalledWith(
      '/api/chat/conversations?projectId=proj-123&limit=100&offset=0',
      expect.objectContaining({ credentials: 'omit' }),
    );
    expect(new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer session-token',
    );
    expect(result.current.conversations).toEqual([
      expect.objectContaining({
        id: projectConversation.id,
        projectId: 'proj-123',
        title: 'Project planning',
      }),
    ]);
    expect(result.current.error).toBeNull();
  });

  it('exposes a user-safe error when the project conversation list fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Project chats unavailable' } }), {
            status: 503,
          }),
      ),
    );

    const { result } = renderHook(() => useProjectConversations('proj-123'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.conversations).toEqual([]);
    expect(result.current.error).toBe('Something went wrong on our side. Try again shortly.');
    expect(result.current.error).not.toContain('Project chats unavailable');
  });

  it('pages and deduplicates older project chats through the same filtered route', async () => {
    const first = { ...WIRE_CONVERSATION, project_id: 'proj-123' };
    const second = {
      ...WIRE_CONVERSATION,
      id: 'c0ffee00-0000-4000-8000-000000000003',
      project_id: 'proj-123',
    };
    let requestCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        requestCount += 1;
        return new Response(
          JSON.stringify({
            conversations: requestCount === 1 ? [first] : [first, second],
            hasMore: requestCount === 1,
            nextOffset: requestCount === 1 ? 100 : 102,
          }),
          { status: 200 },
        );
      }),
    );

    const { result } = renderHook(() => useProjectConversations('proj-123'));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(async () => result.current.loadMore());

    expect(fetch).toHaveBeenLastCalledWith(
      '/api/chat/conversations?projectId=proj-123&limit=100&offset=100',
      expect.any(Object),
    );
    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(result.current.hasMore).toBe(false);
  });
});

describe('useConversations list rate limiting', () => {
  const RATE_LIMITED = () =>
    new Response(JSON.stringify({ error: { message: 'Too many requests.' } }), { status: 429 });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    __resetConversationListLoadForTests();
    useChatStore.setState({ conversations: [], activeConversationId: null, error: null });
    authMocks.getToken.mockResolvedValue('token');
  });

  it('keeps the sidebar quiet while a retry is pending, then recovers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(RATE_LIMITED())
      .mockImplementation(async () => conversationListResponse([WIRE_CONVERSATION]));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const { result } = renderHook(() => useConversations());

      let loading!: Promise<void>;
      await act(async () => { loading = result.current.fetchConversations(); });
      expect(result.current.listError).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
        await loading;
      });

      await waitFor(() => expect(result.current.conversations).toHaveLength(1));
      expect(result.current.listError).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('keeps the prior list and hides server details when a retry cannot fix a 500', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(conversationListResponse([WIRE_CONVERSATION]))
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Server exploded.' } }), {
            status: 500,
          }),
      );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const { result } = renderHook(() => useConversations());

      await waitFor(() => expect(result.current.conversations).toHaveLength(1));

      await act(async () => {
        await result.current.fetchConversations();
      });

      await waitFor(() =>
        expect(result.current.listError).toBe(
          'Something went wrong on our side. Try again shortly.',
        ),
      );
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual([
        WIRE_CONVERSATION.id,
      ]);
      expect(result.current.listError).not.toContain('Server exploded');
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

/**
 * AGI-30. One send produced about ten requests under `/api/chat/conversations`
 * and the list was a share of them, because the mount effect is the only list
 * caller but is not the only MOUNT. The first send routes `/chat` to
 * `/chat/<id>`, a different route segment, so the chat page unmounts and mounts
 * again in the middle of the turn and asked the server for a list it had just
 * been given; on shell routes a second copy of the hook mounts alongside the
 * page's and the two race in the same tick.
 *
 * These count requests, not renders: a debounce would have made the same
 * assertions pass while the storm continued underneath.
 */
describe('useConversations list request coalescing', () => {
  beforeEach(() => {
    __resetConversationListLoadForTests();
    useChatStore.getState().reset();
    useSettingsStore.getState().setNewChatsTemporary(false);
    useChatProjectStore.setState({ projects: [], activeProjectId: null });
    authMocks.getToken.mockResolvedValue('session-token');
    authMocks.userId = 'user-1';
  });

  function stubList() {
    const fetchMock = vi.fn(async () => conversationListResponse([WIRE_CONVERSATION]));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function listRequestCount(fetchMock: { mock: { calls: unknown[][] } }): number {
    return fetchMock.mock.calls.filter((call) =>
      String(call[0]).startsWith('/api/chat/conversations?'),
    ).length;
  }

  it('asks for the list once when one copy of the hook mounts', async () => {
    const fetchMock = stubList();
    const { result } = renderHook(() => useConversations());

    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    expect(listRequestCount(fetchMock)).toBe(1);
  });

  it('asks once for two copies mounted in the same tick, and both see the list', async () => {
    const fetchMock = stubList();
    const first = renderHook(() => useConversations());
    const second = renderHook(() => useConversations());

    await waitFor(() => expect(first.result.current.conversations).toHaveLength(1));
    await waitFor(() => expect(second.result.current.conversations).toHaveLength(1));

    expect(listRequestCount(fetchMock)).toBe(1);
  });

  it('does not ask again when the route change inside a turn remounts the hook', async () => {
    const fetchMock = stubList();
    const first = renderHook(() => useConversations());
    await waitFor(() => expect(first.result.current.conversations).toHaveLength(1));
    first.unmount();

    const second = renderHook(() => useConversations());
    await waitFor(() => expect(second.result.current.conversations).toHaveLength(1));

    expect(listRequestCount(fetchMock)).toBe(1);
  });

  it('hands a copy that skipped the request the paging state it would have got', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ conversations: [WIRE_CONVERSATION], hasMore: true, nextOffset: 1 }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const first = renderHook(() => useConversations());
    await waitFor(() => expect(first.result.current.hasMoreConversations).toBe(true));
    first.unmount();

    const second = renderHook(() => useConversations());

    await waitFor(() => expect(second.result.current.hasMoreConversations).toBe(true));
    expect(listRequestCount(fetchMock)).toBe(1);
  });

  it('still goes to the server when the sidebar retry calls fetchConversations', async () => {
    const fetchMock = stubList();
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    await act(async () => {
      await result.current.fetchConversations();
    });

    expect(listRequestCount(fetchMock)).toBe(2);
  });

  it('reloads for a different signed-in user rather than serving the last account list', async () => {
    const fetchMock = stubList();
    const first = renderHook(() => useConversations());
    await waitFor(() => expect(first.result.current.conversations).toHaveLength(1));
    first.unmount();

    switchSession('user-2', 'session-2');
    const second = renderHook(() => useConversations());
    await waitFor(() => expect(second.result.current.conversations).toHaveLength(1));

    expect(listRequestCount(fetchMock)).toBe(2);
  });

  it('shows the failure in a copy that joined an in-flight request it did not start', async () => {
    const list = deferredResponse();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => list.promise),
    );
    const first = renderHook(() => useConversations());
    const second = renderHook(() => useConversations());

    await act(async () => {
      list.resolve(new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 500 }));
      await list.promise;
    });

    await waitFor(() =>
      expect(second.result.current.listError).toBe(
        'Something went wrong on our side. Try again shortly.',
      ),
    );
    expect(first.result.current.listError).toBe(
      'Something went wrong on our side. Try again shortly.',
    );
  });
});

describe('useConversations session-owned reads', () => {
  beforeEach(() => {
    __resetConversationListLoadForTests();
    useChatStore.getState().reset();
    authMocks.getToken.mockResolvedValue('token-a');
  });

  it('does not dispatch a delayed original token after the live account changes', async () => {
    let resolveToken!: (token: string) => void;
    authMocks.getToken.mockReturnValueOnce(new Promise<string>((resolve) => { resolveToken = resolve; }));
    const fetchMock = vi.fn(async () => conversationListResponse([WIRE_CONVERSATION]));
    vi.stubGlobal('fetch', fetchMock);
    const hook = renderHook(() => useConversations());
    await waitFor(() => expect(authMocks.getToken).toHaveBeenCalledOnce());
    const nextToken = vi.fn(async () => 'token-b');

    await act(async () => {
      switchSession('user-2', 'session-2', nextToken);
      resolveToken('token-a');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(nextToken).not.toHaveBeenCalled();

    hook.rerender();
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer token-b');
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.credentials).toBe('omit');
  });

  it.each([
    ['user-2', 'session-2'],
    ['user-1', 'session-new'],
    ['user-1', 'session-1'],
  ])('does not join or publish the old session body after switching to %s/%s', async (userId, sessionId) => {
    const oldBody = deferredBody();
    const currentConversation = { ...WIRE_CONVERSATION, id: DEEP_LINK_CONVERSATION.id, title: 'Current account' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(oldBody.response)
      .mockImplementation(async () => conversationListResponse([currentConversation]));
    vi.stubGlobal('fetch', fetchMock);
    const hook = renderHook(() => useConversations());
    await waitFor(() => expect(oldBody.response.json).toHaveBeenCalled());

    switchSession(userId, sessionId, vi.fn(async () => 'token-new'));
    hook.rerender();
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      oldBody.resolve({ conversations: [WIRE_CONVERSATION], hasMore: true, nextOffset: 99 });
    });
    expect(hook.result.current.conversations.map(({ id }) => id)).toEqual([currentConversation.id]);
    expect(hook.result.current.hasMoreConversations).toBe(false);
    expect(hook.result.current.listError).toBeNull();
    hook.unmount();
    const remount = renderHook(() => useConversations());
    await waitFor(() => expect(remount.result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a shared request alive when its initiating hook unmounts', async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal('fetch', fetchMock);
    const first = renderHook(() => useConversations());
    const second = renderHook(() => useConversations());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    first.unmount();
    expect(signal?.aborted).toBe(false);
    await act(async () => { pending.resolve(conversationListResponse([WIRE_CONVERSATION])); });
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.conversations).toHaveLength(1);
    expect(second.result.current.listError).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([200, 500])('does not let a superseded same-chat %s completion clear the new opening', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => conversationListResponse()));
    const hook = renderHook(() => useConversations());
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    const earlier = deferredBody(status);
    const later = deferredResponse();
    vi.mocked(fetch).mockResolvedValueOnce(earlier.response).mockReturnValueOnce(later.promise);
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => { first = hook.result.current.loadConversation(DEEP_LINK_CONVERSATION.id); });
    await waitFor(() => expect(earlier.response.json).toHaveBeenCalled());
    await act(async () => { second = hook.result.current.loadConversation(DEEP_LINK_CONVERSATION.id); });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3));
    await act(async () => {
      earlier.resolve(status === 200
        ? { conversation: DEEP_LINK_CONVERSATION, messages: [], total: 0, hasMore: false }
        : { error: 'Original request failed' });
      expect(await first).toBe(true);
    });
    expect(hook.result.current.isLoading).toBe(true);
    expect(hook.result.current.getConversationLoadError()).toBeNull();
    expect(useChatStore.getState().error).toBeNull();
    expect(useChatStore.getState().activeConversationId).toBeNull();
    await act(async () => {
      later.resolve(conversationDetailResponse());
      expect(await second).toBe(true);
    });
    expect(hook.result.current.isLoading).toBe(false);
    expect(useChatStore.getState().activeConversationId).toBe(DEEP_LINK_CONVERSATION.id);
  });

  it.each([false, true])('stops detail pagination and draft hydration after live signout, quiet=%s', async (quiet) => {
    vi.stubGlobal('fetch', vi.fn(async () => conversationListResponse()));
    const hook = renderHook(() => useConversations());
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    if (quiet) useChatStore.getState().setActiveConversation(DEEP_LINK_CONVERSATION.id);
    const body = deferredBody();
    vi.mocked(fetch).mockResolvedValueOnce(body.response);
    let loading!: Promise<boolean>;
    await act(async () => {
      loading = quiet
        ? hook.result.current.refreshOpenConversation(DEEP_LINK_CONVERSATION.id)
        : hook.result.current.loadConversation(DEEP_LINK_CONVERSATION.id);
    });
    await waitFor(() => expect(body.response.json).toHaveBeenCalled());
    await act(async () => {
      authMocks.sdk.session = null;
      authMocks.sdk.user = null;
      body.resolve({
        conversation: { ...DEEP_LINK_CONVERSATION, draft: 'private old draft' },
        messages: [{
          id: '10000000-0000-4000-8000-000000000031', role: 'assistant', content: 'private old turn',
          model: null, provider: null, input_tokens: 0, output_tokens: 0,
          created_at: WIRE_CONVERSATION.created_at, metadata: null,
        }],
        total: 2,
        hasMore: true,
      });
      expect(await loading).toBe(true);
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(useChatStore.getState().conversations).toHaveLength(0);
    expect(useChatStore.getState().getDraftContent(DEEP_LINK_CONVERSATION.id)).toBe('');
    expect(useChatStore.getState().messagesByConversation[DEEP_LINK_CONVERSATION.id]).toBeUndefined();
    expect(useChatStore.getState().error).toBeNull();
    expect(hook.result.current.getConversationLoadError()).toBeNull();
  });

  it('does not publish an unmounted detail read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => conversationListResponse()));
    const hook = renderHook(() => useConversations());
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    const body = deferredBody();
    vi.mocked(fetch).mockResolvedValueOnce(body.response);
    let loading!: Promise<boolean>;
    await act(async () => { loading = hook.result.current.loadConversation(DEEP_LINK_CONVERSATION.id); });
    await waitFor(() => expect(body.response.json).toHaveBeenCalled());
    hook.unmount();
    await act(async () => {
      body.resolve({ conversation: DEEP_LINK_CONVERSATION, messages: [], total: 0, hasMore: false });
      expect(await loading).toBe(true);
    });
    expect(useChatStore.getState().conversations).toHaveLength(0);
    expect(useChatStore.getState().activeConversationId).toBeNull();
  });

  it.each([200, 503])('ignores an old account pagination %s body without clearing the new request', async (status) => {
    const list = () => new Response(JSON.stringify({ conversations: [WIRE_CONVERSATION], hasMore: true, nextOffset: 1 }));
    vi.stubGlobal('fetch', vi.fn(async () => list()));
    const hook = renderHook(() => useConversations());
    await waitFor(() => expect(hook.result.current.hasMoreConversations).toBe(true));
    const oldPage = deferredBody(status);
    vi.mocked(fetch).mockResolvedValueOnce(oldPage.response);
    let loading!: Promise<void>;
    await act(async () => { loading = hook.result.current.loadMoreConversations(); });
    await waitFor(() => expect(oldPage.response.json).toHaveBeenCalled());
    switchSession('user-2', 'session-2', vi.fn(async () => 'token-b'));
    hook.rerender();
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    const currentPage = deferredResponse();
    vi.mocked(fetch).mockReturnValueOnce(currentPage.promise);
    let currentLoading!: Promise<void>;
    await act(async () => { currentLoading = hook.result.current.loadMoreConversations(); });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4));
    await act(async () => {
      oldPage.resolve(status === 200
        ? { conversations: [DEEP_LINK_CONVERSATION], hasMore: false, nextOffset: 2 }
        : { error: 'Old account page failed' });
      await loading;
    });
    expect(hook.result.current.isLoadingMoreConversations).toBe(true);
    expect(hook.result.current.conversations.map(({ id }) => id)).toEqual([WIRE_CONVERSATION.id]);
    expect(useChatStore.getState().error).toBeNull();
    await act(async () => {
      currentPage.resolve(conversationListResponse());
      await currentLoading;
    });
    expect(hook.result.current.isLoadingMoreConversations).toBe(false);
  });

  it('does not retry a captured session after live signout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const limited = deferredBody(429);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(limited.response));
    try {
      const hook = renderHook(() => useConversations());
      await waitFor(() => expect(limited.response.json).toHaveBeenCalled());
      await act(async () => { limited.resolve({ error: 'Rate limited' }); });
      expect(hook.result.current.listError).toBeNull();
      authMocks.sdk.session = null;
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
      expect(authMocks.getToken).toHaveBeenCalledOnce();
      expect(hook.result.current.isLoading).toBe(false);
      expect(hook.result.current.listError).toBeNull();
    } finally {
      __resetConversationListLoadForTests();
      vi.useRealTimers();
    }
  });

  it('continues a shared rate-limit retry after the initiating hook unmounts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const limited = deferredBody(429);
    const retried = deferredResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(limited.response)
      .mockReturnValueOnce(retried.promise));
    try {
      const first = renderHook(() => useConversations());
      await waitFor(() => expect(limited.response.json).toHaveBeenCalled());
      let settled = false;
      let loading!: Promise<void>;
      await act(async () => {
        loading = first.result.current.fetchConversations().then(() => { settled = true; });
        limited.resolve({ error: 'Rate limited' });
      });
      expect(first.result.current.isLoading).toBe(false);
      expect(settled).toBe(false);
      const second = renderHook(() => useConversations());
      expect(second.result.current.isLoading).toBe(false);
      first.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
      expect(second.result.current.isLoading).toBe(true);
      expect(settled).toBe(false);
      await act(async () => {
        retried.resolve(conversationListResponse([WIRE_CONVERSATION]));
        await loading;
      });
      expect(second.result.current.conversations).toHaveLength(1);
      expect(second.result.current.isLoading).toBe(false);
      expect(second.result.current.listError).toBeNull();
      expect(settled).toBe(true);
    } finally {
      __resetConversationListLoadForTests();
      vi.useRealTimers();
    }
  });
});

describe('useProjectConversations session-owned reads', () => {
  beforeEach(() => {
    authMocks.getToken.mockResolvedValue('token-a');
  });

  it.each([200, 503])('ignores an old account project %s body and retains the current loading owner', async (status) => {
    const original = deferredBody(status);
    const current = deferredResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(original.response).mockReturnValueOnce(current.promise));
    const hook = renderHook(() => useProjectConversations('project-1'));
    await waitFor(() => expect(original.response.json).toHaveBeenCalled());
    switchSession('user-2', 'session-2', vi.fn(async () => 'token-b'));
    hook.rerender();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2));
    await act(async () => {
      original.resolve(status === 200
        ? { conversations: [WIRE_CONVERSATION], hasMore: true, nextOffset: 1 }
        : { error: 'Private old project error' });
    });
    expect(hook.result.current.isLoading).toBe(true);
    expect(hook.result.current.conversations).toHaveLength(0);
    expect(hook.result.current.error).toBeNull();
    await act(async () => { current.resolve(conversationListResponse([DEEP_LINK_CONVERSATION])); });
    expect(hook.result.current.isLoading).toBe(false);
    expect(hook.result.current.conversations.map(({ id }) => id)).toEqual([DEEP_LINK_CONVERSATION.id]);
  });

  it('does not dispatch a project request whose token resolves after navigation', async () => {
    let resolveToken!: (token: string) => void;
    authMocks.getToken.mockReturnValueOnce(new Promise<string>((resolve) => { resolveToken = resolve; }));
    vi.stubGlobal('fetch', vi.fn(async () => conversationListResponse()));
    const hook = renderHook(({ projectId }) => useProjectConversations(projectId), {
      initialProps: { projectId: 'project-1' },
    });
    await waitFor(() => expect(authMocks.getToken).toHaveBeenCalledOnce());
    hook.rerender({ projectId: 'project-2' });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(async () => { resolveToken('token-a'); });
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('projectId=project-2');
  });

  it('aborts only its own pending project read on unmount', async () => {
    const pending = deferredBody();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pending.response));
    const hook = renderHook(() => useProjectConversations('project-1'));
    await waitFor(() => expect(pending.response.json).toHaveBeenCalled());
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    hook.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve({ conversations: [WIRE_CONVERSATION], hasMore: false, nextOffset: 0 }); });
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
  });
});
