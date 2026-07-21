/**
 * Regression for the silent cloud-reply failure on real devices.
 *
 * React Native's global `fetch` (whatwg-fetch) does NOT expose a streaming
 * response body — `response.body` is `null`. The completions stream path read
 * `response.body?.getReader()` and, finding no reader, called
 * `onError('No response body')`, so EVERY cloud chat reply silently failed even
 * though the HTTP request returned 200.
 *
 * The original provider-stream test never caught this because it mocked `body`
 * as a Node `ReadableStream` — i.e. it tested a world that doesn't exist on the
 * device. These tests reproduce the REAL RN condition (`body: null`, full SSE
 * available only via `text()`) and assert the reply still renders.
 */

const guardedFetchMock = jest.fn();
const getAuthTokenMock = jest.fn();

const SSE = [
  'data: {"choices":[{"delta":{"content":"2 plus 2 "}}]}',
  '',
  'data: {"choices":[{"delta":{"content":"= 4."}}]}',
  '',
  'data: {"choices":[{"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '',
].join('\n');

async function loadStreamingService() {
  jest.resetModules();
  // Leave the gateway flag unset → streamChat goes straight to the completions
  // path (attemptStream), which is the path that breaks on real devices.
  delete process.env.EXPO_PUBLIC_USE_PROVIDER_STREAM;

  guardedFetchMock.mockReset();
  getAuthTokenMock.mockReset().mockResolvedValue('cloud-token');

  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    WS_URL: 'wss://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000, STREAM_STALL: 30_000 },
  }));
  jest.doMock('@/lib/egressGuard', () => ({
    guardedFetch: guardedFetchMock,
    EgressBlockedError: class EgressBlockedError extends Error {},
  }));
  jest.doMock('../services/authSession', () => ({
    getAuthToken: getAuthTokenMock,
  }));
  jest.doMock('../services/llmGate', () => ({
    ensureLlmGateOpen: jest.fn(),
  }));
  jest.doMock('../services/remoteChatGate', () => ({
    assertRemoteChatAllowed: jest.fn(),
  }));
  jest.doMock('@/src/features/waitlist/store', () => ({
    useWaitlistStore: { getState: () => ({ cloudUnlocked: true }) },
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../services/streaming') as typeof import('../services/streaming');
}

function makeCallbacks() {
  const deltas: string[] = [];
  return {
    deltas,
    callbacks: {
      onDelta: jest.fn((d: { content?: string }) => {
        if (d.content) deltas.push(d.content);
      }),
      onDone: jest.fn(),
      onError: jest.fn(),
    },
  };
}

describe('completions stream fallback (RN null response.body)', () => {
  afterEach(() => {
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/egressGuard');
    jest.dontMock('../services/authSession');
    jest.dontMock('../services/llmGate');
    jest.dontMock('../services/remoteChatGate');
    jest.dontMock('@/src/features/waitlist/store');
  });

  it('renders the reply via response.text() when body is null (the real RN fetch)', async () => {
    const { streamChat } = await loadStreamingService();
    // RN global fetch: 200 OK, but NO streamable body — text() returns the
    // whole SSE buffer once the stream closes.
    guardedFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      text: async () => SSE,
    } as unknown as Response);

    const { deltas, callbacks } = makeCallbacks();
    await streamChat(
      {
        model: 'gpt-5.6-luna',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000001',
        thinking: true,
      },
      callbacks,
    );

    // The exact bug: onError('No response body') must NOT fire on a 200.
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(deltas.join('')).toBe('2 plus 2 = 4.');
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
    const init = guardedFetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'agi.chat.mobile.send.0190a000-0000-7000-8000-000000000001',
    );
    expect((init.headers as Record<string, string>)['X-AGI-Surface']).toBe('mobile');
  });

  it('maps boolean thinking → thinking_mode (never sends a bare boolean `thinking`)', async () => {
    const { streamChat } = await loadStreamingService();
    guardedFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      text: async () => 'data: [DONE]\n',
    } as unknown as Response);

    const { callbacks } = makeCallbacks();
    await streamChat(
      {
        model: 'gpt-5.6-luna',
        messages: [],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000002',
        thinking: false,
      },
      callbacks,
    );

    const init = guardedFetchMock.mock.calls[0][1] as RequestInit;
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.thinking_mode).toBe(false);
    expect('thinking' in sentBody).toBe(false);
  });

  it('sends only the durable run id and decisions when resuming an approval', async () => {
    const { streamToolApprovalResume } = await loadStreamingService();
    guardedFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      text: async () => 'data: [DONE]\n',
    } as unknown as Response);

    const { callbacks } = makeCallbacks();
    const runId = '0190a000-0000-7000-8000-000000000021';
    await streamToolApprovalResume(
      {
        run_id: runId,
        operationId: '0190a000-0000-7000-8000-000000000022',
        tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved' }],
      },
      callbacks,
    );

    expect(guardedFetchMock.mock.calls[0][0]).toBe(
      'https://api.agi.test/api/llm/v1/chat/completions/approve',
    );
    const init = guardedFetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      run_id: runId,
      tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved' }],
    });
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'agi.chat.mobile.tool-resume.0190a000-0000-7000-8000-000000000022',
    );
  });

  it('still streams incrementally via getReader() when body IS a readable stream', async () => {
    const { streamChat } = await loadStreamingService();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ReadableStream } = require('node:stream/web');
    const enc = new TextEncoder();
    guardedFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(c: { enqueue: (u: Uint8Array) => void; close: () => void }) {
          c.enqueue(enc.encode(SSE));
          c.close();
        },
      }),
    } as unknown as Response);

    const { deltas, callbacks } = makeCallbacks();
    await streamChat(
      {
        model: 'gpt-5.6-luna',
        messages: [],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000003',
      },
      callbacks,
    );

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(deltas.join('')).toBe('2 plus 2 = 4.');
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
  });

  it('runtime-validates and forwards the canonical agent activity envelope', async () => {
    const { streamChat } = await loadStreamingService();
    const validEnvelope = {
      schemaVersion: 3,
      sessionId: 'session-mobile-1',
      turnId: 'turn-mobile-1',
      sequence: 0,
      emittedAtMs: 1_000,
      event: {
        type: 'progress-update',
        progressId: 'research',
        summary: 'Searching official sources',
        status: 'running',
      },
    } as const;
    const activitySse = [
      `data: ${JSON.stringify({ choices: [{ delta: { x_agent_event: validEnvelope } }] })}`,
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    guardedFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      text: async () => activitySse,
    } as unknown as Response);

    const onDelta = jest.fn();
    const callbacks = { onDelta, onDone: jest.fn(), onError: jest.fn() };
    await streamChat(
      {
        model: 'gpt-5.6-luna',
        messages: [],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000006',
      },
      callbacks,
    );

    expect(onDelta).toHaveBeenCalledWith({ x_agent_event: validEnvelope });
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('forwards a retried canonical text event exactly once', async () => {
    const { streamChat } = await loadStreamingService();
    const envelope = {
      schemaVersion: 3,
      sessionId: 'session-mobile-retry',
      turnId: 'turn-mobile-retry',
      sequence: 7,
      emittedAtMs: 1_000,
      event: { type: 'text-delta', delta: 'Durable mobile answer.' },
    } as const;
    const payload = JSON.stringify({
      choices: [{ delta: { content: 'Durable mobile answer.', x_agent_event: envelope } }],
    });
    guardedFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'X-AGI-Agent-Run-Id': '0190a000-0000-7000-8000-000000000101',
        'X-AGI-Agent-Run-URL':
          '/api/llm/v1/chat/completions/runs/0190a000-0000-7000-8000-000000000101',
      }),
      body: null,
      text: async () => `data: ${payload}\n\ndata: ${payload}\n\ndata: [DONE]\n\n`,
    } as unknown as Response);

    const onDelta = jest.fn();
    await streamChat(
      {
        model: 'gpt-5.6-sol',
        messages: [],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000102',
        workMode: 'agiwork',
      },
      { onDelta, onDone: jest.fn(), onError: jest.fn() },
    );

    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta).toHaveBeenCalledWith({
      content: 'Durable mobile answer.',
      x_agent_event: envelope,
    });
  });

  it('drops an invalid canonical agent event instead of persisting untrusted activity', async () => {
    const { streamChat } = await loadStreamingService();
    const activitySse = [
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              content: 'Safe answer',
              x_agent_event: {
                schemaVersion: 3,
                sessionId: 'session-mobile-1',
                turnId: 'turn-mobile-1',
                sequence: -1,
                emittedAtMs: 1_000,
                event: { type: 'private-chain-of-thought', text: 'must not render' },
              },
            },
          },
        ],
      })}`,
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    guardedFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      text: async () => activitySse,
    } as unknown as Response);

    const onDelta = jest.fn();
    await streamChat(
      {
        model: 'gpt-5.6-luna',
        messages: [],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000007',
      },
      { onDelta, onDone: jest.fn(), onError: jest.fn() },
    );

    expect(onDelta).toHaveBeenCalledWith({ content: 'Safe answer' });
    expect(JSON.stringify(onDelta.mock.calls)).not.toContain('private-chain-of-thought');
  });

  it('reuses one operation identity across automatic network retries', async () => {
    jest.useFakeTimers();
    try {
      const { streamChat } = await loadStreamingService();
      guardedFetchMock
        .mockRejectedValueOnce(new TypeError('Network request failed'))
        .mockRejectedValueOnce(new TypeError('Load failed'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: null,
          text: async () => SSE,
        } as unknown as Response);

      const { callbacks } = makeCallbacks();
      const operationId = '0190a000-0000-7000-8000-000000000004';
      const completion = streamChat(
        {
          model: 'gpt-5.6-luna',
          messages: [{ role: 'user', content: 'retry me safely' }],
          stream: true,
          operationId,
        },
        callbacks,
      );

      await jest.advanceTimersByTimeAsync(0);
      expect(guardedFetchMock).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(guardedFetchMock).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(2_500);
      await completion;

      expect(callbacks.onError).not.toHaveBeenCalled();
      expect(guardedFetchMock).toHaveBeenCalledTimes(3);
      const keys = guardedFetchMock.mock.calls.map(
        ([, init]) => (init as RequestInit).headers as Record<string, string>,
      );
      expect(keys.map((headers) => headers['Idempotency-Key'])).toEqual([
        `agi.chat.mobile.send.${operationId}`,
        `agi.chat.mobile.send.${operationId}`,
        `agi.chat.mobile.send.${operationId}`,
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('follows the durable run journal instead of re-posting after a mid-stream disconnect', async () => {
    const { streamChat } = await loadStreamingService();
    const runId = '0190a000-0000-7000-8000-000000000099';
    const runPath = `/api/llm/v1/chat/completions/runs/${runId}`;
    const encoder = new TextEncoder();
    const lifecycleEnvelope = {
      schemaVersion: 3,
      sessionId: 'session-mobile-durable',
      turnId: 'turn-mobile-durable',
      sequence: 0,
      emittedAtMs: 1_000,
      event: { type: 'lifecycle', phase: 'started' },
    } as const;
    const recoveredTextEnvelope = {
      schemaVersion: 3,
      sessionId: 'session-mobile-durable',
      turnId: 'turn-mobile-durable',
      sequence: 1,
      emittedAtMs: 2_000,
      event: { type: 'text-delta', delta: ' recovered' },
    } as const;
    const stopEnvelope = {
      schemaVersion: 3,
      sessionId: 'session-mobile-durable',
      turnId: 'turn-mobile-durable',
      sequence: 2,
      emittedAtMs: 3_000,
      event: { type: 'stop', reason: 'end-turn' },
    } as const;
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { x_agent_event: lifecycleEnvelope } }] })}\n\n`,
          ),
        })
        .mockRejectedValueOnce(new TypeError('Network request failed')),
      releaseLock: jest.fn(),
    };
    const now = '2026-07-17T20:00:00.000Z';

    guardedFetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-AGI-Agent-Run-Id': runId,
          'X-AGI-Agent-Run-URL': runPath,
        }),
        body: { getReader: () => reader },
      } as unknown as Response)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            run: {
              id: runId,
              userId: 'user-mobile-1',
              requestId: 'request-mobile-1',
              conversationId: 'conversation-mobile-1',
              originSurface: 'mobile',
              workMode: 'chat',
              state: 'completed',
              provider: 'openai',
              model: 'gpt-5.6-luna',
              lastEventSequence: 2,
              cancellationRequestedAt: null,
              completedAt: now,
              createdAt: now,
              updatedAt: now,
            },
            events: [recoveredTextEnvelope, stopEnvelope],
            nextAfterSequence: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const onDelta = jest.fn();
    const callbacks = {
      onDelta,
      onDone: jest.fn(),
      onError: jest.fn(),
      onRunReference: jest.fn(),
    };
    await streamChat(
      {
        model: 'gpt-5.6-luna',
        messages: [{ role: 'user', content: 'resume this run' }],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000008',
      },
      callbacks,
    );

    const postCalls = guardedFetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(postCalls).toHaveLength(1);
    expect(guardedFetchMock).toHaveBeenNthCalledWith(
      2,
      `https://api.agi.test${runPath}?after=0&limit=100`,
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(onDelta).toHaveBeenCalledWith({
      content: ' recovered',
      durableReplay: true,
      x_agent_event: recoveredTextEnvelope,
    });
    expect(onDelta).toHaveBeenCalledWith({
      durableReplay: true,
      finish_reason: 'stop',
      x_agent_event: stopEnvelope,
    });
    expect(callbacks.onRunReference).toHaveBeenLastCalledWith({
      runId,
      runPath,
      lastSequence: 2,
      state: 'completed',
      cancellationRequestedAt: null,
    });
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
