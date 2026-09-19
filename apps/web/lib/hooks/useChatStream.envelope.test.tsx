import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STREAM_ENVELOPE_SCHEMA_VERSION } from '@agiworkforce/types';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { useChatStream } from './useChatStream';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: authMocks.getToken }) }));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const CONVERSATION = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Durable chat',
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-05T00:00:00.000Z',
  isTemporary: false,
};

const TEMP_CONVERSATION = { ...CONVERSATION, id: 'conv-temp', isTemporary: true };

function envelopedEvent(content: string, sequence: number): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content } }],
    envelope: {
      schemaVersion: STREAM_ENVELOPE_SCHEMA_VERSION,
      eventId: `event-${sequence}`,
      sequence,
      emittedAt: 1_700_000_000_000,
      conversationId: CONVERSATION.id,
    },
  })}\n\n`;
}

function sseResponse(body: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    { status: 200, headers: new Headers() },
  );
}

function droppedSseResponse(body: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body));
      },
      pull(controller) {
        controller.error(new TypeError('network error'));
      },
    }),
    { status: 200, headers: new Headers() },
  );
}

function assistantMessage() {
  return useChatStore.getState().messages.find((message) => message.role === 'assistant');
}

function savedMessage() {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    parent_id: null,
    role: 'user',
    content: 'answer me',
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    created_at: '2026-09-05T00:00:00.000Z',
    metadata: {},
  };
}

interface Routes {
  completion: () => Response;
  resume?: () => Response;
}

function routeFetch(routes: Routes): string[] {
  const seen: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    seen.push(url);
    if (url.includes('/resume/stream')) {
      return routes.resume ? routes.resume() : new Response(null, { status: 404 });
    }
    if (url.includes('/chat/completions')) return routes.completion();
    return new Response(JSON.stringify({ message: savedMessage() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return seen;
}

beforeEach(() => {
  useChatStore.getState().reset();
  useThinkingStore.getState().setEnabled(false);
  authMocks.getToken.mockResolvedValue('session-token');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('stream envelope consumption', () => {
  it('applies a repeated sequence once, so a replayed frame cannot duplicate text', async () => {
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    routeFetch({
      completion: () =>
        sseResponse(
          envelopedEvent('Half an ', 1) +
            envelopedEvent('answer.', 2) +
            envelopedEvent('answer.', 2) +
            'data: [DONE]\n\n',
        ),
    });

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('say it once', { conversationId: TEMP_CONVERSATION.id });
    });

    expect(assistantMessage()?.content).toBe('Half an answer.');
  });

  it('reads a stream that carries no envelope exactly as it always has', async () => {
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    routeFetch({
      completion: () =>
        sseResponse(
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'No envelope here.' } }] })}\n\n` +
            'data: [DONE]\n\n',
        ),
    });

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('old wire', { conversationId: TEMP_CONVERSATION.id });
    });

    expect(assistantMessage()?.content).toBe('No envelope here.');
  });

  it('resumes from the cursor when the connection drops mid-answer', async () => {
    useChatStore.setState({
      activeConversationId: CONVERSATION.id,
      conversations: [CONVERSATION],
    });
    const seen = routeFetch({
      completion: () => droppedSseResponse(envelopedEvent('The first half. ', 1)),
      resume: () =>
        sseResponse(
          `data: ${JSON.stringify({
            choices: [{ delta: { content: 'The second half.' }, finish_reason: null }],
          })}\n\ndata: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: 'stop' }],
          })}\n\ndata: [DONE]\n\n`,
        ),
    });

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('answer me', { conversationId: CONVERSATION.id });
    });

    expect(assistantMessage()?.content).toBe('The first half. The second half.');
    const resumeCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/resume/stream'));
    expect(resumeCall).toBeDefined();
    const cursor = JSON.parse(String((resumeCall?.[1] as RequestInit).body)) as {
      conversation_id: string;
      cursor: { sequence: number; characters: number };
    };
    expect(cursor.conversation_id).toBe(CONVERSATION.id);
    expect(cursor.cursor).toEqual({ sequence: 1, characters: 16 });
    expect(seen.some((url) => url.includes('/resume/stream'))).toBe(true);
  });

  it('resumes a sequence gap from the last contiguous character instead of duplicating its tail', async () => {
    useChatStore.setState({
      activeConversationId: CONVERSATION.id,
      conversations: [CONVERSATION],
    });
    routeFetch({
      completion: () =>
        sseResponse(
          envelopedEvent('A', 1) +
            envelopedEvent('C', 3) +
            envelopedEvent('D', 4) +
            'data: [DONE]\n\n',
        ),
      resume: () =>
        sseResponse(
          `data: ${JSON.stringify({
            choices: [{ delta: { content: 'BCD' }, finish_reason: null }],
          })}\n\ndata: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: 'stop' }],
          })}\n\ndata: [DONE]\n\n`,
        ),
    });

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('fill the gap', { conversationId: CONVERSATION.id });
    });

    expect(assistantMessage()?.content).toBe('ABCD');
    const resumeCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/resume/stream'));
    const cursor = JSON.parse(String((resumeCall?.[1] as RequestInit).body)) as {
      cursor: { sequence: number; characters: number };
    };
    expect(cursor.cursor).toEqual({ sequence: 1, characters: 1 });
  });

  it('never asks a temporary conversation to resume, because nothing was persisted', async () => {
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    routeFetch({ completion: () => droppedSseResponse(envelopedEvent('Half.', 1)) });

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current
        .sendMessage('answer me', { conversationId: TEMP_CONVERSATION.id })
        .catch(() => undefined);
    });

    expect(
      vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes('/resume/stream')),
    ).toBe(false);
  });
});
