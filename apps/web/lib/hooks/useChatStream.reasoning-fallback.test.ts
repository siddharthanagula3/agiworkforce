import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { listCanonicalModels } from '@agiworkforce/types';
import { useChatStream } from './useChatStream';

const WAIT_WITHOUT_EVENTS_MS = 60_000;

const REASONING_CHAT_MODEL = (() => {
  const model = listCanonicalModels().find((candidate) => candidate.reasoning?.capable === true);
  if (!model) throw new Error('Canonical reasoning-capable fixture is missing');
  return model.id;
})();

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

function pendingStream(): {
  response: Response;
  deliver: (text: string) => void;
  finish: () => void;
} {
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  const encoder = new TextEncoder();
  return {
    response: new Response(stream, { status: 200, headers: new Headers() }),
    deliver: (text: string) => controllerRef.enqueue(encoder.encode(text)),
    finish: () => controllerRef.close(),
  };
}

function sseEvent(content: string, finishReason?: string): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content }, ...(finishReason ? { finish_reason: finishReason } : {}) }],
  })}\n\n`;
}

function assistantMessage() {
  return useChatStore.getState().messages.find((message) => message.role === 'assistant');
}

describe('useChatStream reports observed activity', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useThinkingStore.getState().setEnabled(false);
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('never calls elapsed waiting time reasoning, even for a reasoning-capable model', async () => {
    const stream = pendingStream();
    vi.mocked(fetch).mockResolvedValueOnce(stream.response);

    const { result } = renderHook(() => useChatStream());
    let send: Promise<boolean> | undefined;
    act(() => {
      send = result.current.sendMessage('why is the sky blue', {
        conversationId: TEMP_CONVERSATION.id,
        model: REASONING_CHAT_MODEL,
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WAIT_WITHOUT_EVENTS_MS);
    });

    expect(
      assistantMessage()?.metadata?.agentActivity?.entries.some(
        (entry) => entry.kind === 'progress' && entry.summary === 'Thinking',
      ),
    ).toBe(false);
    expect(assistantMessage()?.metadata?.isThinkingStreaming).not.toBe(true);

    await act(async () => {
      stream.deliver(sseEvent('Rayleigh scattering.', 'stop'));
      stream.deliver('data: [DONE]\n\n');
      stream.finish();
      await send;
    });

    expect(assistantMessage()?.content).toContain('Rayleigh scattering.');
  });

  it('keeps ordinary text generation separate from reasoning', async () => {
    const stream = pendingStream();
    vi.mocked(fetch).mockResolvedValueOnce(stream.response);

    const { result } = renderHook(() => useChatStream());
    let send: Promise<boolean> | undefined;
    act(() => {
      send = result.current.sendMessage('fast answer please', {
        conversationId: TEMP_CONVERSATION.id,
        model: REASONING_CHAT_MODEL,
      });
    });

    await act(async () => {
      stream.deliver(sseEvent('Quick reply.'));
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WAIT_WITHOUT_EVENTS_MS);
    });

    expect(
      assistantMessage()?.metadata?.agentActivity?.entries.some(
        (entry) => entry.kind === 'progress' && entry.summary === 'Thinking',
      ),
    ).toBe(false);

    await act(async () => {
      stream.deliver(sseEvent('', 'stop'));
      stream.deliver('data: [DONE]\n\n');
      stream.finish();
      await send;
    });

    expect(assistantMessage()?.content).toContain('Quick reply.');
  });

  it('does not invent reasoning for a non-reasoning model', async () => {
    const nonReasoningModel = listCanonicalModels().find(
      (candidate) => candidate.reasoning?.capable !== true,
    );
    if (!nonReasoningModel) throw new Error('Canonical non-reasoning fixture is missing');

    const stream = pendingStream();
    vi.mocked(fetch).mockResolvedValueOnce(stream.response);

    const { result } = renderHook(() => useChatStream());
    let send: Promise<boolean> | undefined;
    act(() => {
      send = result.current.sendMessage('a plain question', {
        conversationId: TEMP_CONVERSATION.id,
        model: nonReasoningModel.id,
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WAIT_WITHOUT_EVENTS_MS);
    });

    expect(
      assistantMessage()?.metadata?.agentActivity?.entries.some(
        (entry) => entry.kind === 'progress' && entry.summary === 'Thinking',
      ),
    ).toBe(false);

    await act(async () => {
      stream.deliver(sseEvent('Answer.', 'stop'));
      stream.deliver('data: [DONE]\n\n');
      stream.finish();
      await send;
    });
  });
});
