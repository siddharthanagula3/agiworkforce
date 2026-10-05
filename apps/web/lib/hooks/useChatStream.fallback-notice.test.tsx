import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProviderOfferings, getRoutingSlotModel } from '@agiworkforce/types';
import { useChatStore, type MessageMetadata } from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import { chatCompletionEndpoint } from '@/features/chat/lib/free-quota-selection';
import { useChatStream } from './useChatStream';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: authMocks.getToken,
    userId: 'user-1',
    isSignedIn: true,
    isLoaded: true,
  }),
}));

type ClientCsrfModule = typeof import('@/lib/client/csrf');

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ClientCsrfModule>()),
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const CONVERSATION = {
  id: 'conv-free-fallback',
  title: 'Saved chat',
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  isTemporary: false,
};
const USER_MESSAGE_ID = '0190a000-0000-7000-8000-0000000000f1';
const ASSISTANT_MESSAGE_ID = '0190a000-0000-7000-8000-0000000000fa';
const FREE_LIMIT_REACHED = 'free_limit_reached';

const [FALLBACK_MODEL] = Object.entries(getProviderOfferings()).find(
  ([, offering]) => offering.provider === 'qwen' && offering.quotaProbeProtocol === 'chat',
)!;
const FREE_AUTO = getRoutingSlotModel('router_zero_cost');
const TURN_ENDPOINTS = new Set([
  chatCompletionEndpoint(FREE_AUTO),
  chatCompletionEndpoint(FALLBACK_MODEL),
]);
const FALLBACK_HEADERS = {
  'X-AGI-Fallback-Reason': FREE_LIMIT_REACHED,
  'X-AGI-Resolved-Model': FALLBACK_MODEL,
};

type SavedMessage = Record<string, unknown>;
type StreamEnding = 'done' | 'stopped' | 'dropped';

const frame = (delta: Record<string, unknown>) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`;

function isCompletionsTurn(url: string): boolean {
  return TURN_ENDPOINTS.has(new URL(url, 'http://localhost').pathname);
}

function endStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  ending: StreamEnding,
): void {
  if (ending === 'stopped') {
    controller.error(new DOMException('The user aborted a request.', 'AbortError'));
    return;
  }
  if (ending === 'dropped') {
    controller.error(new TypeError('network connection lost'));
    return;
  }
  controller.close();
}

function serve(
  body: string,
  options: { headers?: Record<string, string>; ending?: StreamEnding } = {},
) {
  const saves: SavedMessage[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/messages')) {
      const saved = JSON.parse(String(init?.body ?? '{}')) as SavedMessage;
      saves.push(saved);
      return new Response(JSON.stringify({ message: { id: saved['id'] } }), { status: 200 });
    }
    if (url.includes('/resume/stream')) {
      return new Response('{}', { status: 500 });
    }
    if (isCompletionsTurn(url)) {
      const encoder = new TextEncoder();
      let pulls = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          if (pulls === 1) {
            controller.enqueue(encoder.encode(body));
            return;
          }
          endStream(controller, options.ending ?? 'done');
        },
      });
      return new Response(stream, { status: 200, headers: new Headers(options.headers) });
    }
    return new Response('{}', { status: 200 });
  });
  return () => saves.filter((saved) => saved['role'] === 'assistant');
}

const savedMetadata = (saved: SavedMessage) =>
  saved['metadata'] as Record<string, unknown> | undefined;

async function sendOnFreeAuto() {
  const { result } = renderHook(() => useChatStream());
  await act(async () => {
    await result.current.sendMessage('Hello', {
      conversationId: CONVERSATION.id,
      model: FREE_AUTO,
    });
  });
}

function seedPartialReply(metadata: MessageMetadata) {
  useChatStore.setState({
    messages: [
      {
        id: USER_MESSAGE_ID,
        role: 'user',
        content: 'Hello',
        createdAt: '2026-10-02T00:00:00.000Z',
      },
      {
        id: ASSISTANT_MESSAGE_ID,
        role: 'assistant',
        content: 'Half an answer',
        createdAt: '2026-10-02T00:00:01.000Z',
        model: FALLBACK_MODEL,
        metadata,
      },
    ],
  });
}

async function continueReply() {
  const { result } = renderHook(() => useChatStream());
  await act(async () => {
    await result.current.continueGeneration(ASSISTANT_MESSAGE_ID);
  });
}

describe('saving a reply another model wrote', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useThinkingStore.getState().setEnabled(false);
    useFreeTrialStore.getState().clearLimitReached();
    useChatStore.setState({
      activeConversationId: CONVERSATION.id,
      conversations: [CONVERSATION],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves the notice with the reply, so a reload or another device still shows it', async () => {
    const assistantSaves = serve(
      `${frame({ content: 'Answered by a free model.' })}data: [DONE]\n\n`,
      { headers: FALLBACK_HEADERS },
    );

    await sendOnFreeAuto();

    await vi.waitFor(() => expect(assistantSaves()).not.toHaveLength(0));
    for (const saved of assistantSaves()) {
      expect(saved['content']).toBe('Answered by a free model.');
      expect(savedMetadata(saved)?.['fallbackReason']).toBe(FREE_LIMIT_REACHED);
    }
  });

  it('keeps the notice on every save of a reply the reader stopped', async () => {
    const assistantSaves = serve(frame({ content: 'Half an answer' }), {
      headers: FALLBACK_HEADERS,
      ending: 'stopped',
    });

    await sendOnFreeAuto();

    await vi.waitFor(() => expect(assistantSaves()).toHaveLength(2));
    for (const saved of assistantSaves()) {
      expect(saved['content']).toBe('Half an answer');
      expect(savedMetadata(saved)?.['finishReason']).toBe('stopped');
      expect(savedMetadata(saved)?.['fallbackReason']).toBe(FREE_LIMIT_REACHED);
    }
  });

  it('keeps the notice when the connection drops after the reply started', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const assistantSaves = serve(frame({ content: 'Half an answer' }), {
      headers: FALLBACK_HEADERS,
      ending: 'dropped',
    });

    await sendOnFreeAuto();

    await vi.waitFor(() => expect(assistantSaves()).not.toHaveLength(0));
    for (const saved of assistantSaves()) {
      expect(String(saved['content'])).toMatch(/^Half an answer\n\nError: /u);
      expect(savedMetadata(saved)?.['fallbackReason']).toBe(FREE_LIMIT_REACHED);
    }
    errorLog.mockRestore();
  });

  it('saves no notice when the free model wrote no text', async () => {
    const assistantSaves = serve(
      `${frame({
        x_stream_error: {
          message: 'The free provider could not complete this answer.',
          code: 'free_model_stream_failed',
          retryable: false,
        },
      })}data: [DONE]\n\n`,
      { headers: FALLBACK_HEADERS },
    );

    await sendOnFreeAuto();

    await vi.waitFor(() => expect(assistantSaves()).not.toHaveLength(0));
    for (const saved of assistantSaves()) {
      expect(savedMetadata(saved)?.['streamError']).toMatchObject({
        code: 'free_model_stream_failed',
      });
      expect(savedMetadata(saved)).not.toHaveProperty('fallbackReason');
    }
  });

  it('saves no notice when the reader stopped before any text arrived', async () => {
    const assistantSaves = serve(frame({}), { headers: FALLBACK_HEADERS, ending: 'stopped' });

    await sendOnFreeAuto();

    await vi.waitFor(() => expect(assistantSaves()).not.toHaveLength(0));
    for (const saved of assistantSaves()) {
      expect(savedMetadata(saved)?.['finishReason']).toBe('stopped');
      expect(savedMetadata(saved)).not.toHaveProperty('fallbackReason');
    }
  });

  it('keeps the saved notice when the reader continues the reply', async () => {
    seedPartialReply({ finishReason: 'stopped', fallbackReason: FREE_LIMIT_REACHED });
    const assistantSaves = serve(`${frame({ content: ' and the rest.' })}data: [DONE]\n\n`);

    await continueReply();

    await vi.waitFor(() => expect(assistantSaves()).not.toHaveLength(0));
    for (const saved of assistantSaves()) {
      expect(saved['content']).toBe('Half an answer and the rest.');
      expect(savedMetadata(saved)?.['fallbackReason']).toBe(FREE_LIMIT_REACHED);
    }
  });

  it('keeps the notice when a continued reply loses its connection', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    seedPartialReply({ finishReason: 'stopped' });
    const assistantSaves = serve(frame({ content: ' and the rest' }), {
      headers: FALLBACK_HEADERS,
      ending: 'dropped',
    });

    await continueReply();

    await vi.waitFor(() => expect(assistantSaves()).not.toHaveLength(0));
    for (const saved of assistantSaves()) {
      expect(String(saved['content'])).toMatch(/^Half an answer and the rest\n\nError: /u);
      expect(savedMetadata(saved)?.['fallbackReason']).toBe(FREE_LIMIT_REACHED);
    }
    errorLog.mockRestore();
  });
});
