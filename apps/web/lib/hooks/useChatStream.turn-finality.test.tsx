import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore, selectIsConversationStreaming } from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import { useChatStream } from './useChatStream';

const authMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  userId: 'user-1',
  isSignedIn: true,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: authMocks.getToken,
    userId: authMocks.userId,
    isSignedIn: authMocks.isSignedIn,
    isLoaded: true,
  }),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const CONVERSATION = {
  id: 'conv-finality',
  title: 'Temporary chat',
  createdAt: '2026-10-15T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
  isTemporary: true,
};

const frame = (choice: Record<string, unknown>) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, ...choice }] })}\n\n`;

function serveHeldOpenStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });
  vi.mocked(fetch).mockImplementation(async (input) => {
    if (String(input).includes('/completions')) {
      return new Response(stream, { status: 200, headers: new Headers() });
    }
    return new Response('{}', { status: 200 });
  });
  return {
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  };
}

function assistantMessage() {
  return useChatStore
    .getState()
    .messagesByConversation[CONVERSATION.id]?.find((message) => message.role === 'assistant');
}

const conversationStreaming = () =>
  selectIsConversationStreaming(CONVERSATION.id)(useChatStore.getState());

describe('turn finality across a multi-step tool turn', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useThinkingStore.getState().setEnabled(false);
    useFreeTrialStore.getState().clearLimitReached();
    useChatStore.setState({ activeConversationId: CONVERSATION.id, conversations: [CONVERSATION] });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the reply streaming through a provider step finish until the turn itself ends', async () => {
    const server = serveHeldOpenStream();
    const { result } = renderHook(() => useChatStream());

    let turn!: Promise<unknown>;
    act(() => {
      turn = result.current.sendMessage('Find the latest release notes', {
        conversationId: CONVERSATION.id,
      });
    });

    await vi.waitFor(() => expect(assistantMessage()?.isStreaming).toBe(true));

    server.push(
      frame({
        delta: {
          tool_calls: [
            { index: 0, id: 'call_1', function: { name: 'web_search', arguments: '{}' } },
          ],
        },
        finish_reason: 'tool_calls',
      }),
    );
    server.push(frame({ delta: { content: 'Release 4.2 shipped' } }));
    await vi.waitFor(() => expect(assistantMessage()?.content).toContain('Release 4.2'));

    expect(assistantMessage()?.isStreaming).toBe(true);
    expect(conversationStreaming()).toBe(true);

    server.push(frame({ delta: { content: ' on Tuesday.' }, finish_reason: 'stop' }));
    await vi.waitFor(() => expect(assistantMessage()?.content).toContain('on Tuesday.'));

    expect(assistantMessage()?.isStreaming).toBe(true);
    expect(conversationStreaming()).toBe(true);

    server.push('data: [DONE]\n\n');
    server.close();
    await act(async () => {
      await turn;
    });

    expect(assistantMessage()?.isStreaming).toBe(false);
    expect(assistantMessage()?.metadata?.finishReason).toBe('stop');
    expect(conversationStreaming()).toBe(false);
  });

  it('does not settle a tool-only step that has produced no text yet', async () => {
    const server = serveHeldOpenStream();
    const { result } = renderHook(() => useChatStream());

    let turn!: Promise<unknown>;
    act(() => {
      turn = result.current.sendMessage('Look this up', { conversationId: CONVERSATION.id });
    });
    await vi.waitFor(() => expect(assistantMessage()?.isStreaming).toBe(true));

    server.push(
      frame({
        delta: {
          tool_calls: [
            { index: 0, id: 'call_1', function: { name: 'web_search', arguments: '{}' } },
          ],
        },
        finish_reason: 'tool_calls',
      }),
    );
    server.push(frame({ delta: { x_tool_status: { status: 'searching' } } }));
    await vi.waitFor(() => expect(assistantMessage()?.metadata?.isSearching).toBe(true));

    expect(assistantMessage()?.isStreaming).toBe(true);
    expect(conversationStreaming()).toBe(true);

    server.push(frame({ delta: { content: 'Found it.' }, finish_reason: 'stop' }));
    server.push('data: [DONE]\n\n');
    server.close();
    await act(async () => {
      await turn;
    });

    expect(assistantMessage()?.content).toBe('Found it.');
    expect(assistantMessage()?.isStreaming).toBe(false);
    expect(conversationStreaming()).toBe(false);
  });

  it('settles at end of stream when the producer never sends a terminator', async () => {
    const server = serveHeldOpenStream();
    const { result } = renderHook(() => useChatStream());

    let turn!: Promise<unknown>;
    act(() => {
      turn = result.current.sendMessage('Hi', { conversationId: CONVERSATION.id });
    });
    await vi.waitFor(() => expect(assistantMessage()?.isStreaming).toBe(true));

    server.push(frame({ delta: { content: 'Hello.' }, finish_reason: 'stop' }));
    server.close();
    await act(async () => {
      await turn;
    });

    expect(assistantMessage()?.content).toBe('Hello.');
    expect(assistantMessage()?.isStreaming).toBe(false);
    expect(assistantMessage()?.metadata?.finishReason).toBe('stop');
    expect(conversationStreaming()).toBe(false);
  });
});
