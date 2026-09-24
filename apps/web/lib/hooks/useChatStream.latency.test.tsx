import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_LATENCY_POINT, chatLatencyMarkName } from '@/lib/client/chat-latency';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { useChatStream } from './useChatStream';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: authMocks.getToken }),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const CONVERSATION = {
  id: 'latency-conversation',
  title: 'Latency measurement',
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
  isTemporary: true,
};

describe('useChatStream latency instrumentation', () => {
  const frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    frames.length = 0;
    useChatStore.getState().reset();
    useThinkingStore.getState().setEnabled(false);
    useChatStore.setState({
      activeConversationId: CONVERSATION.id,
      conversations: [CONVERSATION],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('joins the server trace and marks first byte, rendered text and completion', async () => {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(streamController) {
            controller = streamController;
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const mark = vi.spyOn(performance, 'mark');
    const { result } = renderHook(() => useChatStream());
    let sendPromise!: Promise<boolean>;

    await act(async () => {
      sendPromise = result.current.sendMessage('Measure this turn.', {
        conversationId: CONVERSATION.id,
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    const traceparent = requestHeaders.get('traceparent');
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/u);
    const traceId = traceparent?.split('-')[1] ?? '';

    await act(async () => {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'Ready now.' } }] })}\n\n`,
        ),
      );
      await Promise.resolve();
    });

    expect(mark).toHaveBeenCalledWith(chatLatencyMarkName(traceId, CHAT_LATENCY_POINT.firstChunk));
    expect(frames).toHaveLength(1);

    await act(async () => {
      frames.shift()?.(performance.now());
      await Promise.resolve();
    });
    expect(frames).toHaveLength(1);

    await act(async () => {
      frames.shift()?.(performance.now());
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
      await sendPromise;
    });

    expect(mark).toHaveBeenCalledWith(chatLatencyMarkName(traceId, CHAT_LATENCY_POINT.firstPaint));
    expect(mark).toHaveBeenCalledWith(
      chatLatencyMarkName(traceId, CHAT_LATENCY_POINT.firstSentence),
    );
    expect(mark).toHaveBeenCalledWith(chatLatencyMarkName(traceId, CHAT_LATENCY_POINT.done));
  });
});
