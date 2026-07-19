import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
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

const MANAGED_RUN_ID = '11111111-1111-4111-8111-111111111111';
const MANAGED_RUN_PATH = `/api/llm/v1/chat/completions/runs/${MANAGED_RUN_ID}`;

function managedRunHeaders(): Headers {
  return new Headers({
    'X-AGI-Agent-Run-Id': MANAGED_RUN_ID,
    'X-AGI-Agent-Run-URL': MANAGED_RUN_PATH,
  });
}

function managedRunSnapshot(
  state: 'running' | 'ready_for_review' | 'completed' | 'cancelled',
  events: unknown[],
  lastEventSequence: number,
) {
  return {
    run: {
      id: MANAGED_RUN_ID,
      userId: 'user-1',
      requestId: 'request-1',
      conversationId: TEMP_CONVERSATION.id,
      originSurface: 'web',
      workMode: 'agiwork',
      state,
      provider: 'openai',
      model: 'model-1',
      lastEventSequence,
      cancellationRequestedAt: state === 'cancelled' ? '2026-07-17T20:00:00.000Z' : null,
      completedAt:
        state === 'ready_for_review' || state === 'completed' || state === 'cancelled'
          ? '2026-07-17T20:00:00.000Z'
          : null,
      createdAt: '2026-07-17T19:00:00.000Z',
      updatedAt: '2026-07-17T20:00:00.000Z',
    },
    events,
    nextAfterSequence: lastEventSequence,
  };
}

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
    useFreeTrialStore.getState().clearLimitReached();
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

  describe('auth failure at send time', () => {
    it('surfaces an error and adds no message when the token is unavailable', async () => {
      // Expired/revoked session: getToken() returns null. Previously this threw
      // uncaught after the composer cleared the input, silently losing the message.
      authMocks.getToken.mockResolvedValueOnce(null);
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('this must not vanish silently', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      expect(useChatStore.getState().error).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
      // No half-added user/assistant bubble in the transcript.
      expect(
        useChatStore.getState().messages.some((m) => m.content === 'this must not vanish silently'),
      ).toBe(false);
    });
  });

  describe('canonical x_agent_event activity', () => {
    it('renders a retried canonical text event exactly once', async () => {
      const textEnvelope = {
        schemaVersion: 3,
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-retried-text',
        sequence: 0,
        emittedAtMs: 1_000,
        event: { type: 'text-delta', delta: 'Verified once.' },
      } as const;
      const retriedText = {
        choices: [{ delta: { content: 'Verified once.', x_agent_event: textEnvelope } }],
      };
      mockSseStream([
        retriedText,
        retriedText,
        {
          choices: [
            {
              delta: {
                x_agent_event: {
                  ...textEnvelope,
                  sequence: 1,
                  emittedAtMs: 1_100,
                  event: { type: 'stop', reason: 'end-turn' },
                },
              },
              finish_reason: 'stop',
            },
          ],
        },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('retry safely', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistant = useChatStore
        .getState()
        .messages.find((message) => message.role === 'assistant');
      expect(assistant?.content).toBe('Verified once.');
      expect(assistant?.metadata?.agentActivity?.lastSequence).toBe(1);
    });

    it('validates, reduces, and keeps canonical activity on the assistant message', async () => {
      const base = {
        schemaVersion: 3,
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-activity-1',
      };
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_agent_event: {
                  ...base,
                  sequence: 0,
                  emittedAtMs: 1_000,
                  event: { type: 'lifecycle', phase: 'started' },
                },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                x_agent_event: {
                  ...base,
                  sequence: 1,
                  emittedAtMs: 1_100,
                  event: {
                    type: 'tool-execution-start',
                    toolCallId: 'search-1',
                    name: 'web_search',
                    category: 'web-search',
                    summary: 'Searching official sources',
                    input: { query: 'official docs' },
                  },
                },
              },
            },
          ],
        },
        // Duplicate sequence must not replace the accepted event.
        {
          choices: [
            {
              delta: {
                x_agent_event: {
                  ...base,
                  sequence: 1,
                  emittedAtMs: 1_150,
                  event: { type: 'error', message: 'duplicate must be ignored' },
                },
              },
            },
          ],
        },
        // Invalid payload must be ignored without poisoning the stream.
        { choices: [{ delta: { x_agent_event: { schemaVersion: 999 } } }] },
        {
          choices: [
            {
              delta: {
                x_agent_event: {
                  ...base,
                  sequence: 2,
                  emittedAtMs: 1_900,
                  event: {
                    type: 'tool-execution-end',
                    toolCallId: 'search-1',
                    name: 'web_search',
                    output: { matches: 3 },
                    isError: false,
                    elapsedMs: 800,
                  },
                },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                content: 'Verified answer.',
                x_agent_event: {
                  ...base,
                  sequence: 3,
                  emittedAtMs: 2_000,
                  event: { type: 'stop', reason: 'end-turn' },
                },
              },
              finish_reason: 'stop',
            },
          ],
        },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('research this', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistant?.metadata?.agentActivity).toMatchObject({
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-activity-1',
        lastSequence: 3,
        status: 'completed',
        stopReason: 'end-turn',
      });
      expect(assistant?.metadata?.agentActivity?.entries).toEqual([
        expect.objectContaining({
          kind: 'tool',
          toolCallId: 'search-1',
          summary: 'Searching official sources',
          status: 'completed',
          elapsedMs: 800,
        }),
      ]);
      expect(JSON.stringify(assistant?.metadata?.agentActivity)).not.toContain(
        'duplicate must be ignored',
      );
    });

    it('persists canonical activity in the assistant message payload', async () => {
      const conversation = {
        ...TEMP_CONVERSATION,
        id: 'conv-agent-activity-persist',
        isTemporary: false,
      };
      useChatStore.setState({
        conversations: [conversation],
        activeConversationId: conversation.id,
      });

      const base = {
        schemaVersion: 3,
        sessionId: conversation.id,
        turnId: 'turn-persisted-activity',
      };
      const streamBody =
        [
          {
            choices: [
              {
                delta: {
                  x_agent_event: {
                    ...base,
                    sequence: 0,
                    emittedAtMs: 1_000,
                    event: { type: 'lifecycle', phase: 'started' },
                  },
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  content: 'Done.',
                  x_agent_event: {
                    ...base,
                    sequence: 1,
                    emittedAtMs: 1_500,
                    event: { type: 'stop', reason: 'end-turn' },
                  },
                },
                finish_reason: 'stop',
              },
            ],
          },
        ]
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join('') + 'data: [DONE]\n\n';

      const saveBodies: Array<Record<string, unknown>> = [];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          const encoder = new TextEncoder();
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(streamBody));
                controller.close();
              },
            }),
            { status: 200, headers: new Headers() },
          );
        }
        if (url.includes('/messages')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          saveBodies.push(body);
          return new Response(JSON.stringify({ message: { id: body['id'] ?? 'saved-message' } }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('persist this run', { conversationId: conversation.id });
      });

      await vi.waitFor(() =>
        expect(saveBodies.some((body) => body['role'] === 'assistant')).toBe(true),
      );
      const assistant = saveBodies.find((body) => body['role'] === 'assistant');
      expect((assistant?.['metadata'] as Record<string, unknown>)?.['agentActivity']).toMatchObject(
        {
          schemaVersion: 1,
          sessionId: conversation.id,
          turnId: 'turn-persisted-activity',
          status: 'completed',
          stopReason: 'end-turn',
        },
      );
    });
  });

  describe('durable Managed Cloud runs', () => {
    it('keeps the validated run handle and replay cursor on the assistant message', async () => {
      const base = {
        schemaVersion: 3,
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-run-reference',
      };
      const body =
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                content: 'Done.',
                x_agent_event: {
                  ...base,
                  sequence: 0,
                  emittedAtMs: 1_000,
                  event: { type: 'stop', reason: 'end-turn' },
                },
              },
              finish_reason: 'stop',
            },
          ],
        })}\n\n` + 'data: [DONE]\n\n';
      const encoder = new TextEncoder();
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(body));
              controller.close();
            },
          }),
          { status: 200, headers: managedRunHeaders() },
        ),
      );

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('finish this', {
          conversationId: TEMP_CONVERSATION.id,
          workMode: 'agiwork',
        });
      });

      const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistant?.metadata?.cloudAgentRun).toEqual({
        runId: MANAGED_RUN_ID,
        runPath: MANAGED_RUN_PATH,
        lastSequence: 0,
      });
    });

    it('replays only missing journal events when the initial SSE connection drops', async () => {
      const base = {
        schemaVersion: 3,
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-reconnect',
      };
      const event = (sequence: number, agentEvent: Record<string, unknown>) => ({
        ...base,
        sequence,
        emittedAtMs: 1_000 + sequence,
        event: agentEvent,
      });
      const encoder = new TextEncoder();
      let streamPulls = 0;

      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === '/api/llm/v1/chat/completions') {
          return new Response(
            new ReadableStream({
              pull(controller) {
                if (streamPulls === 0) {
                  streamPulls += 1;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        choices: [
                          {
                            delta: {
                              content: 'Partial ',
                              x_agent_event: event(0, {
                                type: 'lifecycle',
                                phase: 'started',
                              }),
                            },
                          },
                        ],
                      })}\n\n`,
                    ),
                  );
                  return;
                }
                controller.error(new TypeError('network connection lost'));
              },
            }),
            { status: 200, headers: managedRunHeaders() },
          );
        }
        if (url === `${MANAGED_RUN_PATH}?after=0&limit=100`) {
          expect(init?.headers).toEqual({ Authorization: 'Bearer session-token' });
          return new Response(
            JSON.stringify(
              managedRunSnapshot(
                'ready_for_review',
                [
                  event(1, { type: 'text-delta', delta: 'Partial ' }),
                  event(2, { type: 'text-delta', delta: 'recovered answer' }),
                  event(3, {
                    type: 'task-state-changed',
                    taskId: 'turn-reconnect',
                    state: 'ready_for_review',
                    previousState: 'running',
                    summary: 'Ready for review.',
                  }),
                  event(4, { type: 'stop', reason: 'end-turn' }),
                ],
                4,
              ),
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('keep working', {
          conversationId: TEMP_CONVERSATION.id,
          workMode: 'agiwork',
        });
      });

      const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistant?.content).toBe('Partial recovered answer');
      expect(assistant?.error).not.toBe(true);
      expect(assistant?.metadata?.cloudAgentRun).toEqual({
        runId: MANAGED_RUN_ID,
        runPath: MANAGED_RUN_PATH,
        lastSequence: 4,
        state: 'ready_for_review',
        cancellationRequestedAt: null,
      });
      expect(assistant?.metadata?.agentActivity).toMatchObject({
        lastSequence: 4,
        status: 'completed',
      });
    });

    it('sends Stop to the active server run instead of cancelling only the browser stream', async () => {
      const encoder = new TextEncoder();
      let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
      const cancellationCalls: Array<{ url: string; init?: RequestInit }> = [];

      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === '/api/llm/v1/chat/completions') {
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: 'Working' } }] })}\n\n`,
                ),
              );
              init?.signal?.addEventListener(
                'abort',
                () => controller.error(new DOMException('Stopped', 'AbortError')),
                { once: true },
              );
            },
          });
          return new Response(stream, { status: 200, headers: managedRunHeaders() });
        }
        if (url === MANAGED_RUN_PATH && init?.method === 'POST') {
          cancellationCalls.push({ url, init });
          return new Response(
            JSON.stringify({ run: managedRunSnapshot('cancelled', [], -1).run }),
            { status: 202, headers: { 'Content-Type': 'application/json' } },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      const { result } = renderHook(() => useChatStream());
      let send: Promise<boolean> | undefined;
      act(() => {
        send = result.current.sendMessage('do a long task', {
          conversationId: TEMP_CONVERSATION.id,
          workMode: 'agiwork',
        });
      });
      await vi.waitFor(() => {
        const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
        expect(assistant?.metadata?.cloudAgentRun?.runId).toBe(MANAGED_RUN_ID);
      });

      act(() => result.current.stopGeneration());
      await send;
      await vi.waitFor(() => expect(cancellationCalls).toHaveLength(1));
      const headers = cancellationCalls[0]?.init?.headers as Record<string, string>;
      expect(headers).toEqual({
        Authorization: 'Bearer session-token',
        'x-csrf-token': 'csrf-token',
      });
      expect(streamController).toBeDefined();
    });
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

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
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

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
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
      await vi.waitFor(() => expect(saveBodies.some((b) => b['role'] === 'assistant')).toBe(true));

      const assistantSave = saveBodies.find((b) => b['role'] === 'assistant');
      const savedMeta = assistantSave?.['metadata'] as Record<string, unknown> | undefined;
      expect(savedMeta?.['thinkingContent']).toBe('my reasoning');
      expect(savedMeta?.['isThinkingStreaming']).toBe(false);
      expect(savedMeta?.['thinkingCompletedAt']).toBeTruthy();
    });
  });

  // Continue Generation (task #88): finish_reason plumbing + append-in-place
  // continuation of a truncated / user-stopped assistant turn.
  describe('continue generation', () => {
    const PERSISTED_CONV = { ...TEMP_CONVERSATION, id: 'conv-continue', isTemporary: false };

    /**
     * Route-aware fetch mock: /api/llm/ requests stream `streamBody`, message
     * saves are captured into `saveBodies`, and LLM request payloads into
     * `llmBodies`.
     */
    function mockRoutedFetch(streamBody: string) {
      const saveBodies: Array<Record<string, unknown>> = [];
      const llmBodies: Array<Record<string, unknown>> = [];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          try {
            llmBodies.push(JSON.parse(String(init?.body ?? '{}')));
          } catch {
            /* ignore */
          }
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
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(String(init?.body ?? '{}'));
            saveBodies.push(body);
          } catch {
            /* ignore */
          }
          // Echo the client-supplied id like the real route (coalesce($1, ...))
          // so the store message id is not renamed mid-test.
          return new Response(JSON.stringify({ message: { id: body['id'] ?? 'saved-row' } }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      });
      return { saveBodies, llmBodies };
    }

    function sse(events: unknown[], done = true): string {
      return (
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') +
        (done ? 'data: [DONE]\n\n' : '')
      );
    }

    it("records finish_reason 'length' on the assistant metadata (continuable truncation)", async () => {
      mockSseStream([
        { choices: [{ delta: { content: 'truncated ans' }, finish_reason: 'length' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('long question', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.finishReason).toBe('length');
    });

    it('captures an additive x_stream_error delta into metadata.streamError and still persists the partial content', async () => {
      // Mid-stream provider failure (packages/ai/provider-protocol's openai-wire-compat.ts
      // sseChunks() 'error' case): the server still sends a clean [DONE], so this
      // is the ONLY signal distinguishing it from a normal completion.
      mockSseStream([
        { choices: [{ delta: { content: 'partial answer before' } }] },
        {
          choices: [
            {
              delta: {
                x_stream_error: {
                  message: 'Anthropic API overloaded',
                  code: '529',
                  retryable: true,
                },
              },
              finish_reason: 'error',
            },
          ],
        },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('long question', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.streamError).toEqual({
        message: 'Anthropic API overloaded',
        code: '529',
        retryable: true,
      });
      // The partial content that DID stream is never discarded or replaced.
      expect(assistantMsg?.content).toBe('partial answer before');
    });

    it('accepts a bare-string x_stream_error defensively (wraps it as {message})', async () => {
      mockSseStream([
        { choices: [{ delta: { content: 'partial' } }] },
        { choices: [{ delta: { x_stream_error: 'rate limited' }, finish_reason: 'error' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('hi', { conversationId: TEMP_CONVERSATION.id });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.streamError).toEqual({ message: 'rate limited' });
    });

    it('does NOT record streamError on a normal completion (no x_stream_error delta)', async () => {
      mockSseStream([
        { choices: [{ delta: { content: 'complete answer' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('hello', { conversationId: TEMP_CONVERSATION.id });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.streamError).toBeUndefined();
    });

    it('records the FINAL finish_reason, not an intermediate tool_calls, on normal completion', async () => {
      mockSseStream([
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        { choices: [{ delta: { content: 'complete answer' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('hello', { conversationId: TEMP_CONVERSATION.id });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      // 'stop' is recorded honestly — the Continue affordance must never
      // appear on a normally-completed turn.
      expect(assistantMsg?.metadata?.finishReason).toBe('stop');
    });

    it("marks a user-stopped turn 'stopped' and persists the partial content", async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
      });

      const saveBodies: Array<Record<string, unknown>> = [];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          const encoder = new TextEncoder();
          // Emit partial content, then reject the NEXT read like an aborted
          // fetch does (pull-based so the chunk is consumed before the error).
          let pulls = 0;
          const stream = new ReadableStream({
            pull(controller) {
              if (pulls === 0) {
                pulls += 1;
                const activityBase = {
                  schemaVersion: 3,
                  sessionId: PERSISTED_CONV.id,
                  turnId: 'turn-user-stopped',
                };
                controller.enqueue(
                  encoder.encode(
                    [
                      {
                        choices: [
                          {
                            delta: {
                              x_agent_event: {
                                ...activityBase,
                                sequence: 0,
                                emittedAtMs: 1_000,
                                event: { type: 'lifecycle', phase: 'started' },
                              },
                            },
                          },
                        ],
                      },
                      {
                        choices: [
                          {
                            delta: {
                              content: 'partial answer',
                              x_agent_event: {
                                ...activityBase,
                                sequence: 1,
                                emittedAtMs: 1_100,
                                event: {
                                  type: 'tool-execution-start',
                                  toolCallId: 'search-stop',
                                  name: 'web_search',
                                  category: 'web-search',
                                  summary: 'Searching official sources',
                                  input: { query: 'official sources' },
                                },
                              },
                            },
                          },
                        ],
                      },
                    ]
                      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                      .join(''),
                  ),
                );
                return;
              }
              controller.error(new DOMException('The user aborted a request.', 'AbortError'));
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
          return new Response(JSON.stringify({ message: { id: 'saved-stop' } }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('question', { conversationId: PERSISTED_CONV.id });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe('partial answer');
      expect(assistantMsg?.metadata?.finishReason).toBe('stopped');
      expect(assistantMsg?.metadata?.agentActivity).toMatchObject({
        status: 'cancelled',
        stopReason: 'cancelled',
        entries: [expect.objectContaining({ kind: 'tool', status: 'cancelled' })],
      });
      expect(assistantMsg?.isStreaming).toBe(false);

      // The partial (with the 'stopped' marker) is persisted so it survives reload.
      await vi.waitFor(() =>
        expect(
          saveBodies.some((b) => b['role'] === 'assistant' && b['content'] === 'partial answer'),
        ).toBe(true),
      );
      const assistantSave = saveBodies.find((b) => b['role'] === 'assistant');
      expect((assistantSave?.['metadata'] as Record<string, unknown>)?.['finishReason']).toBe(
        'stopped',
      );
      expect(
        (assistantSave?.['metadata'] as Record<string, unknown>)?.['agentActivity'],
      ).toMatchObject({ status: 'cancelled', stopReason: 'cancelled' });
    });

    it('APPENDS the continuation to the same assistant message and persists the merged text', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'write a long story',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
          {
            id: '0190a000-0000-7000-8000-0000000000aa',
            role: 'assistant',
            content: 'Once upon a time',
            createdAt: '2026-07-01T00:00:01.000Z',
            model: 'test/model-1',
            metadata: { finishReason: 'length' },
          },
        ],
      });

      const { saveBodies, llmBodies } = mockRoutedFetch(
        sse([
          { choices: [{ delta: { content: ', the story continued.' }, finish_reason: 'stop' }] },
        ]),
      );

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('0190a000-0000-7000-8000-0000000000aa');
      });

      const state = useChatStore.getState();
      const assistantMessages = state.messages.filter((m) => m.role === 'assistant');
      // Append-not-replace: still exactly ONE assistant bubble, same id.
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0]?.id).toBe('0190a000-0000-7000-8000-0000000000aa');
      expect(assistantMessages[0]?.content).toBe('Once upon a time, the story continued.');
      // The continuable marker clears on normal completion (re-offered only if
      // it truncates again).
      expect(assistantMessages[0]?.metadata?.finishReason).toBe('stop');

      // The request thread ends with the partial assistant turn + an ephemeral
      // continue instruction, and reuses the SAME model that produced the partial.
      const llmRequest = llmBodies[0]!;
      expect(llmRequest['model']).toBe('test/model-1');
      const requestMessages = llmRequest['messages'] as Array<Record<string, unknown>>;
      const last = requestMessages[requestMessages.length - 1]!;
      const secondToLast = requestMessages[requestMessages.length - 2]!;
      expect(secondToLast['role']).toBe('assistant');
      expect(secondToLast['content']).toBe('Once upon a time');
      expect(last['role']).toBe('user');
      expect(String(last['content'])).toMatch(/continue/i);
      // The ephemeral instruction is never stored in the transcript.
      expect(state.messages.some((m) => m.content === last['content'])).toBe(false);

      // The MERGED full text is persisted.
      await vi.waitFor(() =>
        expect(
          saveBodies.some(
            (b) =>
              b['role'] === 'assistant' &&
              b['content'] === 'Once upon a time, the story continued.',
          ),
        ).toBe(true),
      );
    });

    it('re-offers Continue when the continuation truncates again', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'go on',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
          {
            id: '0190a000-0000-7000-8000-0000000000bb',
            role: 'assistant',
            content: 'part one',
            createdAt: '2026-07-01T00:00:01.000Z',
            metadata: { finishReason: 'length' },
          },
        ],
      });

      mockRoutedFetch(
        sse([{ choices: [{ delta: { content: ' part two' }, finish_reason: 'length' }] }]),
      );

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('0190a000-0000-7000-8000-0000000000bb');
      });

      const assistantMsg = useChatStore
        .getState()
        .messages.find((m) => m.id === '0190a000-0000-7000-8000-0000000000bb');
      expect(assistantMsg?.content).toBe('part one part two');
      expect(assistantMsg?.metadata?.finishReason).toBe('length');
    });

    it('is a NO-OP on a normally-completed turn (no request fired)', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
        messages: [
          {
            id: 'assistant-done',
            role: 'assistant',
            content: 'complete answer',
            createdAt: '2026-07-01T00:00:01.000Z',
            metadata: { finishReason: 'stop' },
          },
        ],
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('assistant-done');
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(useChatStore.getState().messages[0]?.content).toBe('complete answer');
    });

    it('is a NO-OP when the partial content is empty (nothing to continue)', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
        messages: [
          {
            id: 'assistant-empty',
            role: 'assistant',
            content: '',
            createdAt: '2026-07-01T00:00:01.000Z',
            metadata: { finishReason: 'stopped' },
          },
        ],
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('assistant-empty');
      });

      expect(fetch).not.toHaveBeenCalled();
    });

    it('keeps the partial text and appends an honest error note when the continuation fails', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'partial before failure',
            createdAt: '2026-07-01T00:00:01.000Z',
            metadata: { finishReason: 'stopped' },
          },
        ],
      });

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          return new Response(
            JSON.stringify({ error: { code: 'server_overloaded', message: 'Provider down' } }),
            { status: 503 },
          );
        }
        return new Response(JSON.stringify({ message: { id: 'saved-x' } }), { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('assistant-1');
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.id === 'assistant-1');
      // The partial is preserved (not replaced by a bare error message)...
      expect(assistantMsg?.content).toContain('partial before failure');
      // ...with an honest error note appended, and the turn flagged as errored.
      expect(assistantMsg?.content).toContain('Error: Provider down');
      expect(assistantMsg?.error).toBe(true);
      expect(useChatStore.getState().error).toBe('Provider down');
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

  it('binds a Managed Cloud send to the durable assistant turn id', async () => {
    mockSseStream([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]);
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: TEMP_CONVERSATION.id });
    });

    const assistant = useChatStore
      .getState()
      .messages.find((message) => message.role === 'assistant');
    const llmCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
    expect(assistant?.id).toBeTruthy();
    expect((llmCall?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      `agi.chat.web.send.${assistant?.id}`,
    );
  });

  it('sends the AGI Work execution mode to the managed cloud engine', async () => {
    mockSseStream([{ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] }]);
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('research and build this', {
        conversationId: TEMP_CONVERSATION.id,
        workMode: 'agiwork',
      });
    });

    const llmCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
    const body = JSON.parse(String(llmCall?.[1]?.body)) as Record<string, unknown>;
    expect(body['work_mode']).toBe('agiwork');
    expect(body['agent_mode']).toBeUndefined();
  });
});
