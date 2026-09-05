import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { useChatStream } from './useChatStream';

const authMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: authMocks.getToken,
  }),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const TEMP_CONVERSATION = {
  id: 'conv-temp',
  title: 'Temporary chat',
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
  isTemporary: true,
};

function sseEvent(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

function tokenize(text: string, size: number): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    tokens.push(text.slice(index, index + size));
  }
  return tokens;
}

function mockTokenStream(tokens: string[], { abortAfterDelivery = false } = {}): void {
  const encoder = new TextEncoder();
  const body = tokens.map(sseEvent).join('') + (abortAfterDelivery ? '' : 'data: [DONE]\n\n');
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(body));
          if (!abortAfterDelivery) controller.close();
        },
        pull(controller) {
          if (abortAfterDelivery) {
            controller.error(new DOMException('The user aborted a request.', 'AbortError'));
          }
        },
      }),
      { status: 200, headers: new Headers() },
    ),
  );
}

function watchAssistantContentWrites(): { count: () => number; stop: () => void } {
  let writes = 0;
  let lastContent = '';
  const stop = useChatStore.subscribe((state) => {
    const assistant = state.messages.find((message) => message.role === 'assistant');
    if (!assistant || assistant.content === lastContent) return;
    lastContent = assistant.content;
    writes += 1;
  });
  return { count: () => writes, stop };
}

function assistantMessage() {
  return useChatStore.getState().messages.find((message) => message.role === 'assistant');
}

describe('useChatStream frame-coalesced store appends', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useThinkingStore.getState().setEnabled(false);
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
    // This stub hands back a handle but never runs the callback: with the frame
    // loop starved, only a terminal force-flush can reach the store.
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('collapses a whole turn of token deltas into one content write', async () => {
    const answer = 'Frame coalescing keeps the transcript readable while the model streams.';
    mockTokenStream(tokenize(answer, 3));
    const watcher = watchAssistantContentWrites();

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('stream me a long answer', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });
    watcher.stop();

    expect(assistantMessage()?.content).toBe(answer);
    expect(watcher.count()).toBe(1);
  });

  it('keeps thinking and content text intact across a mid-turn transition', async () => {
    const tokens = [
      ...tokenize('Before. ', 2),
      ...tokenize('<thinking>weighing the options</thinking>', 4),
      ...tokenize('After.', 2),
    ];
    mockTokenStream(tokens);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('think then answer', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });

    const assistant = assistantMessage();
    expect(assistant?.content).toBe('Before. After.');
    expect(assistant?.metadata?.thinkingContent).toBe('weighing the options');
  });

  it('loses no buffered text when the turn aborts mid-frame', async () => {
    const partial = 'The answer begins here and then the user presses stop';
    mockTokenStream(tokenize(partial, 4), { abortAfterDelivery: true });

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('stop me halfway', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });

    expect(assistantMessage()?.content).toBe(partial);
    expect(useChatStore.getState().streamingConversationIds).not.toContain(TEMP_CONVERSATION.id);
  });
});
