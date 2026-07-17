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
    TIMEOUTS: { STREAMING: 60_000 },
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
        model: 'gpt-5.4-mini',
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
        model: 'gpt-5.4-mini',
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
        model: 'gpt-5.4-mini',
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
          model: 'gpt-5.4-mini',
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
});
