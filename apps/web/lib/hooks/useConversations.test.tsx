import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatProjectStore } from '@agiworkforce/unified-chat';
import { managedCloudConversationPath } from '@agiworkforce/cloud-contracts';
import { getModelsForTierAndSurface } from '@agiworkforce/types';
import { useChatStore, type Conversation } from '@shared/stores/web-chat-store';
import { useConversations, useProjectConversations } from './useConversations';

const authMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: authMocks.getToken,
    isLoaded: true,
    isSignedIn: true,
  }),
}));

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
    useChatStore.getState().reset();
    useChatProjectStore.setState({ projects: [], activeProjectId: null });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', mockFetchRoutes());
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

  it('marks the first conversation temporary when armed from the composer before it existed', async () => {
    useChatStore.getState().setPendingTemporaryChat(true);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    await act(async () => {
      await result.current.createConversation('New Chat', 'auto');
    });

    expect(findPostBody()).toMatchObject({ isTemporary: true });
  });

  it('consuming the pending flag at creation clears it for the next chat', async () => {
    useChatStore.getState().setPendingTemporaryChat(true);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    await act(async () => {
      await result.current.createConversation('New Chat', 'auto');
    });

    expect(useChatStore.getState().pendingTemporaryChat).toBe(false);
  });
});

describe('useConversations.updateConversation', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
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
    useChatStore.getState().reset();
    authMocks.getToken.mockResolvedValue('session-token');
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

describe('useProjectConversations', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
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
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
      }),
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
    expect(result.current.error).toBe('Project chats unavailable');
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
