import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import { useChatStream, saveMessageToDb } from './useChatStream';

const authMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: authMocks.getToken,
  }),
}));

vi.mock('@/lib/client/csrf', () => ({
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

function mockLlmErrorResponse(body: unknown, status = 503) {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: new Headers(),
    }),
  );
}

/**
 * Build a streaming SSE Response from an array of parsed SSE data objects.
 * Each item is emitted as `data: <json>\n\n`, terminated with `data: [DONE]\n\n`.
 */
function mockSseStream(events: unknown[]) {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const body = lines + 'data: [DONE]\n\n';
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(stream, { status: 200, headers: new Headers() }),
  );
}

describe('useChatStream', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useFreeTrialStore.getState().resetUsage();
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('x_tool_result / mcp_tool_use wiring', () => {
    it('populates tool result and survives a trailing finishRunningTools flush', async () => {
      // Emit: mcp_tool_use running → x_tool_result → finish_reason (triggers finishRunningTools)
      // The discriminating assertion: result must survive the trailing publishToolTimeline
      // called inside finishRunningTools at stream end.
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_tool_status: { type: 'mcp_tool_use', name: 'bash', status: 'running' },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                x_tool_result: {
                  tool_call_id: 'tc-1',
                  name: 'bash',
                  content: 'Hello from E2B',
                  is_error: false,
                },
              },
            },
          ],
        },
        // Assistant text follows the tool result — this triggers another publishToolTimeline
        // indirectly via flushContentBuffer → no, but finish_reason calls finishRunningTools
        { choices: [{ delta: { content: 'Done.' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('run bash', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const state = useChatStore.getState();
      const assistantMsg = state.messages.find((m) => m.role === 'assistant');
      const tools = assistantMsg?.metadata?.tools ?? [];
      const bashEntry = tools.find((t) => t.name === 'bash');
      expect(bashEntry, 'bash tool entry should exist').toBeDefined();
      expect(bashEntry?.result).toBe('Hello from E2B');
      expect(bashEntry?.status).toBe('completed');
    });

    it('accepts mcp_tool_use failed status and marks tool failed', async () => {
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_tool_status: { type: 'mcp_tool_use', name: 'bash', status: 'running' },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                x_tool_status: { type: 'mcp_tool_use', name: 'bash', status: 'failed' },
              },
            },
          ],
        },
        { choices: [{ delta: { content: 'Error.' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('run bash', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const state = useChatStore.getState();
      const assistantMsg = state.messages.find((m) => m.role === 'assistant');
      const bashEntry = assistantMsg?.metadata?.tools?.find((t) => t.name === 'bash');
      expect(bashEntry?.status).toBe('failed');
    });

    it('still handles server_tool_use events (regression)', async () => {
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_tool_status: {
                  type: 'server_tool_use',
                  name: 'web_search',
                  status: 'searching',
                },
              },
            },
          ],
        },
        { choices: [{ delta: { content: 'Results.' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('search', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const state = useChatStore.getState();
      const assistantMsg = state.messages.find((m) => m.role === 'assistant');
      const searchEntry = assistantMsg?.metadata?.tools?.find((t) => t.name === 'web_search');
      expect(searchEntry, 'web_search tool entry should exist').toBeDefined();
    });
  });

  // Regression: the persist-after-long-request path. A web-search / deep-research
  // / long-generation stream outlives the Clerk JWT captured when the request
  // started (~60s TTL), so persisting the assistant turn with that stale Bearer
  // failed (401 on the save route + 403 CSRF_VALIDATION_FAILED via the CSRF
  // fallback) and the answer vanished on reload. The fix: saveMessageToDb takes a
  // token PROVIDER and fetches a fresh token at save time (and on each retry).
  describe('saveMessageToDb durability (persist after a long stream)', () => {
    function headerRecord(init: RequestInit | undefined): Record<string, string> {
      return (init?.headers ?? {}) as Record<string, string>;
    }

    it('fetches a FRESH auth token at save time instead of reusing a stale one', async () => {
      // First provider call (send-time) yields the token that would be expired by
      // save time; every later call yields the refreshed token.
      const getToken = vi
        .fn<() => Promise<string>>()
        .mockResolvedValueOnce('token-stale')
        .mockResolvedValue('token-fresh');
      const getAuthToken = async () => getToken();

      // Simulate the request start consuming the send-time token.
      await getAuthToken();

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { id: 'saved-1' } }), { status: 200 }),
      );

      const saved = await saveMessageToDb(
        'conv-1',
        { id: 'msg-1', role: 'assistant', content: 'answer' },
        getAuthToken,
      );

      expect(saved.id).toBe('saved-1');
      expect(fetch).toHaveBeenCalledTimes(1);
      const [, init] = vi.mocked(fetch).mock.calls[0]!;
      const headers = headerRecord(init);
      // The save must carry the token fetched AT SAVE TIME, not the send-time one.
      expect(headers['Authorization']).toBe('Bearer token-fresh');
      // ...and a CSRF header (Bearer-authed requests bypass server CSRF, but the
      // header is still attached uniformly).
      expect(headers['x-csrf-token']).toBe('csrf-token');
    });

    it('re-fetches the token on each retry so an expiry between attempts self-heals', async () => {
      const getToken = vi.fn<() => Promise<string>>().mockResolvedValue('token-fresh');
      const getAuthToken = async () => getToken();

      // First attempt: transient 500 (retryable). Second attempt: success.
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response('err', { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: { id: 'saved-2' } }), { status: 200 }),
        );

      const saved = await saveMessageToDb(
        'conv-1',
        { id: 'msg-2', role: 'assistant', content: 'answer' },
        getAuthToken,
        { retryDelayMs: 1 },
      );

      expect(saved.id).toBe('saved-2');
      expect(fetch).toHaveBeenCalledTimes(2);
      // One token fetch per attempt — a stale token cannot persist across retries.
      expect(getToken).toHaveBeenCalledTimes(2);
    });

    it('surfaces a 403 CSRF/auth rejection instead of silently dropping the turn', async () => {
      const getAuthToken = async () => 'token-fresh';
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'CSRF_VALIDATION_FAILED' }), { status: 403 }),
      );

      await expect(
        saveMessageToDb(
          'conv-1',
          { id: 'msg-3', role: 'assistant', content: 'answer' },
          getAuthToken,
        ),
      ).rejects.toThrow('Failed to save message to DB: 403');
    });
  });

  // Reasoning / extended-thinking. Providers serialize thinking as literal
  // `<thinking>…</thinking>` text inside delta.content (see stream-transform.ts);
  // the client re-parses those tags into metadata.thinkingContent / segments.
  describe('reasoning (thinking) accumulation + persistence', () => {
    it('keeps thinkingContent after the block closes (no metadata wipe) and leaves single-block turns un-segmented', async () => {
      // Regression: closing `</thinking>` used to updateMessage() with a bare
      // metadata object, which REPLACES the bag and erased the accumulated
      // reasoning — the block vanished on completion. It must survive, collapsed.
      mockSseStream([
        { choices: [{ delta: { content: '<thinking>reasoning here</thinking>' } }] },
        { choices: [{ delta: { content: 'final answer' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('think then answer', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistantMsg = useChatStore
        .getState()
        .messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.thinkingContent).toBe('reasoning here');
      // Never left in a live-streaming state once done — reload would otherwise
      // show a stuck timer.
      expect(assistantMsg?.metadata?.isThinkingStreaming).toBe(false);
      expect(assistantMsg?.metadata?.thinkingCompletedAt).toBeTruthy();
      // Single block → no segments (single-block render path stays untouched).
      expect(assistantMsg?.metadata?.thinkingSegments).toBeUndefined();
      // The visible answer excludes the reasoning text.
      expect(assistantMsg?.content).toBe('final answer');
    });

    it('renders multiple sequential thinking blocks as an ordered segment flow', async () => {
      mockSseStream([
        { choices: [{ delta: { content: '<thinking>first thought</thinking>' } }] },
        { choices: [{ delta: { content: 'partial ' } }] },
        { choices: [{ delta: { content: '<thinking>second thought</thinking>' } }] },
        { choices: [{ delta: { content: 'the answer' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('interleaved thinking', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistantMsg = useChatStore
        .getState()
        .messages.find((m) => m.role === 'assistant');
      const segments = assistantMsg?.metadata?.thinkingSegments ?? [];
      expect(segments).toHaveLength(2);
      expect(segments[0]?.content).toBe('first thought');
      expect(segments[1]?.content).toBe('second thought');
      // Both segments finalized (not stuck streaming) once the turn completes.
      expect(segments.every((s) => s.isStreaming === false)).toBe(true);
      expect(segments.every((s) => typeof s.completedAt === 'string')).toBe(true);
    });

    it('persists reasoning to the DB so it survives reload', async () => {
      // Non-temporary conversation → the assistant turn is saved. Assert the save
      // payload carries the reasoning (previously dropped: only the answer saved).
      const CONV = { ...TEMP_CONVERSATION, id: 'conv-persist', isTemporary: false };
      useChatStore.setState({ conversations: [CONV], activeConversationId: CONV.id });

      const streamBody =
        `data: ${JSON.stringify({ choices: [{ delta: { content: '<thinking>my reasoning</thinking>' } }] })}\n\n` +
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] })}\n\n` +
        'data: [DONE]\n\n';

      const saveBodies: Array<Record<string, unknown>> = [];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(streamBody));
              controller.close();
            },
          });
          return new Response(stream, { status: 200, headers: new Headers() });
        }
        if (url.includes('/messages')) {
          try {
            saveBodies.push(JSON.parse(String(init?.body ?? '{}')));
          } catch {
            /* ignore */
          }
          return new Response(JSON.stringify({ message: { id: 'saved-reasoning' } }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('persist my reasoning', {
          conversationId: CONV.id,
        });
      });
      // The assistant save is fire-and-forget inside the [DONE] handler.
      await vi.waitFor(() =>
        expect(saveBodies.some((b) => b['role'] === 'assistant')).toBe(true),
      );

      const assistantSave = saveBodies.find((b) => b['role'] === 'assistant');
      const savedMeta = assistantSave?.['metadata'] as Record<string, unknown> | undefined;
      expect(savedMeta?.['thinkingContent']).toBe('my reasoning');
      expect(savedMeta?.['isThinkingStreaming']).toBe(false);
      expect(savedMeta?.['thinkingCompletedAt']).toBeTruthy();
    });
  });

  it('renders failed LLM responses as visible assistant errors without console-directed copy', async () => {
    mockLlmErrorResponse({
      error: {
        code: 'server_overloaded',
        message: 'Provider overloaded',
      },
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: TEMP_CONVERSATION.id });
    });

    const state = useChatStore.getState();
    const assistantMessage = state.messages.find((message) => message.role === 'assistant');
    expect(assistantMessage?.error).toBe(true);
    expect(assistantMessage?.content).toBe(
      'Error: Provider overloaded\n\nTry again, or start a new chat if this response is stuck.',
    );
    expect(assistantMessage?.content).not.toContain('console');
    expect(assistantMessage?.content).not.toContain('⚠');
    expect(state.error).toBe('Provider overloaded');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
