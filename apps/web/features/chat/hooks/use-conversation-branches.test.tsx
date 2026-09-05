import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => 'test-token'),
  push: vi.fn(),
  addConversation: vi.fn(),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'X-CSRF-Token': 'csrf-token',
  })),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: mocks.getToken,
    isLoaded: true,
    isSignedIn: true,
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: mocks.addCsrfHeaders,
}));
const storeState = vi.hoisted(() => ({
  conversations: [] as Array<{ id: string }>,
}));
vi.mock('@shared/stores/web-chat-store', () => {
  const useChatStore = (selector?: (state: unknown) => unknown) =>
    selector ? selector(storeState) : storeState;
  useChatStore.getState = () => ({ addConversation: mocks.addConversation });
  return { useChatStore };
});
vi.mock('sonner', () => ({
  toast: {
    success: mocks.success,
    error: mocks.error,
  },
}));

const { useConversationBranches } = await import('./use-conversation-branches');

const conversationId = '0190a000-0000-7000-8000-0000000000aa';
const messageId = '0190a000-0000-7000-8000-0000000000bb';
const branchId = '0190a000-0000-7000-8000-0000000000cc';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useConversationBranches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(branchId);
  });

  it('never asks about a conversation the store does not list', async () => {
    storeState.conversations = [{ id: 'some-other-conversation' }];
    try {
      const { result } = renderHook(() => useConversationBranches(conversationId));
      await waitFor(() => expect(result.current.groupsByMessageId).toEqual({}));
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      storeState.conversations = [];
    }
  });

  it('treats a conversation the server has not persisted as having no branches', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Conversation not found' } }), {
        status: 404,
      }),
    );

    try {
      const { result } = renderHook(() => useConversationBranches(conversationId));

      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(result.current.groupsByMessageId).toEqual({});
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it('loads message-scoped sibling groups for the active conversation', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        groups: [
          {
            messageId,
            activeConversationId: conversationId,
            branches: [
              { conversationId, title: 'Original' },
              { conversationId: branchId, title: 'Alternative' },
            ],
          },
        ],
      }),
    );

    const { result } = renderHook(() => useConversationBranches(conversationId));

    await waitFor(() => {
      expect(result.current.groupsByMessageId[messageId]?.branches).toHaveLength(2);
    });
    expect(fetch).toHaveBeenCalledWith(
      `/api/chat/conversations/${conversationId}/branches`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('creates an idempotent branch, adds it to the store, and navigates to it', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ groups: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            conversation: {
              id: branchId,
              title: 'Original (branch)',
              model: 'auto',
              project_id: null,
              pinned: false,
              starred: false,
              archived: false,
              is_temporary: false,
              created_at: '2026-07-30T00:00:00.000Z',
              updated_at: '2026-07-30T00:00:00.000Z',
            },
          },
          201,
        ),
      );

    const { result } = renderHook(() => useConversationBranches(conversationId));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.createBranch(messageId);
    });

    const postCall = vi.mocked(fetch).mock.calls[1]!;
    expect(postCall[0]).toBe(`/api/chat/conversations/${conversationId}/branches`);
    expect(postCall[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }),
        body: JSON.stringify({ messageId, requestId: branchId }),
      }),
    );
    expect(mocks.addConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: branchId, title: 'Original (branch)' }),
    );
    expect(mocks.success).toHaveBeenCalledWith('Conversation branch created');
    expect(mocks.push).toHaveBeenCalledWith(`/chat/${branchId}`);
    expect(result.current.branchingMessageId).toBeNull();
  });

  it('switches to a sibling but does not reload the already-active branch', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ groups: [] }));
    const { result } = renderHook(() => useConversationBranches(conversationId));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    act(() => result.current.switchBranch(conversationId));
    expect(mocks.push).not.toHaveBeenCalled();

    act(() => result.current.switchBranch(branchId));
    expect(mocks.push).toHaveBeenCalledWith(`/chat/${branchId}`);
  });
});
