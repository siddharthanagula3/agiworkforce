import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore, type Conversation } from '@/stores/chatStore';
import { useConversations } from './useConversations';

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
  is_temporary: false,
  created_at: '2026-07-16T00:00:00.000Z',
  updated_at: '2026-07-16T00:00:00.000Z',
};

/**
 * Route the hook's two fetch shapes: the mount-time GET list and the
 * createConversation POST. The POST echoes the request's projectId back as
 * project_id, exactly like the real route's `returning project_id`.
 */
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
});
