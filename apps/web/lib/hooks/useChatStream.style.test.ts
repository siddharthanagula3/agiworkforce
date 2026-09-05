import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useChatStream } from './useChatStream';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: authMocks.getToken }) }));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
}));

const CONVERSATION_ID = 'conv-style';

function completedStream(): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: new Headers() });
}

function sentMessages(): Array<{ role: string; content: unknown }> {
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([url]) => String(url).includes('/api/llm/v1/chat/completions'));
  const request = JSON.parse(String(call?.[1]?.body)) as {
    messages: Array<{ role: string; content: unknown }>;
  };
  return request.messages;
}

describe('useChatStream response-style instruction', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useChatStore.setState({
      activeConversationId: CONVERSATION_ID,
      conversations: [
        {
          id: CONVERSATION_ID,
          title: 'Style chat',
          createdAt: '2026-07-21T00:00:00.000Z',
          updatedAt: '2026-07-21T00:00:00.000Z',
          isTemporary: true,
        },
      ],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completedStream()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prepends the StyleSelector instruction as a leading system message', async () => {
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Explain quantum computing', {
        conversationId: CONVERSATION_ID,
        styleInstruction: 'Write like a pirate.',
      });
    });

    const messages = sentMessages();
    expect(messages[0]).toEqual({ role: 'system', content: 'Write like a pirate.' });
    expect(messages[messages.length - 1]).toEqual(
      expect.objectContaining({ role: 'user', content: 'Explain quantum computing' }),
    );
  });

  it('lets the StyleSelector instruction take precedence over the styleMode hint', async () => {
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Summarize this', {
        conversationId: CONVERSATION_ID,
        styleInstruction: 'Respond only in haiku.',
        styleMode: 'concise',
      });
    });

    const systemMessages = sentMessages().filter((m) => m.role === 'system');
    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0]?.content).toBe('Respond only in haiku.');
  });
});
