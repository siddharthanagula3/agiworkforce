/**
 * Regression for the silent cloud-reply *hang*.
 *
 * `streamChat` arms a per-attempt response timeout (`TIMEOUTS.STREAMING`) by
 * aborting an internal AbortController, combined with the caller's cancel
 * signal. The catch block treated ANY abort as "intentional — do not retry"
 * and returned silently, so when the backend never responded the timeout fired,
 * the request was abandoned with NO `onError`, and the assistant message was
 * left stuck "streaming" forever — zero feedback (observed live: a cloud send
 * that produced no reply, no error, and no spinner for minutes).
 *
 * The fix distinguishes a user-cancel (silent) from a timeout (must surface an
 * error), and cancels the timeout once the first token arrives so a long but
 * healthy generation is never aborted mid-stream. These tests pin both halves.
 */

const guardedFetchMock = jest.fn();
const getAuthTokenMock = jest.fn();

// A small timeout so the response-timeout path fires within the test, not 120s.
const TEST_TIMEOUT_MS = 100;

async function loadStreamingService() {
  jest.resetModules();
  delete process.env.EXPO_PUBLIC_USE_PROVIDER_STREAM;

  guardedFetchMock.mockReset();
  getAuthTokenMock.mockReset().mockResolvedValue('cloud-token');

  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    WS_URL: 'wss://api.agi.test',
    TIMEOUTS: { STREAMING: TEST_TIMEOUT_MS },
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

function makeAbortError(): Error {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
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

describe('completions stream response timeout', () => {
  afterEach(() => {
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/egressGuard');
    jest.dontMock('../services/authSession');
    jest.dontMock('../services/llmGate');
    jest.dontMock('../services/remoteChatGate');
    jest.dontMock('@/src/features/waitlist/store');
  });

  it('surfaces an error (not a silent hang) when the backend never responds', async () => {
    const { streamChat } = await loadStreamingService();

    // A backend that accepts the connection but never sends a response. The
    // promise only settles when the abort signal fires — i.e. our own timeout.
    guardedFetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal;
        if (signal?.aborted) {
          reject(makeAbortError());
          return;
        }
        signal?.addEventListener('abort', () => reject(makeAbortError()), { once: true });
      });
    });

    const { callbacks } = makeCallbacks();
    await streamChat(
      { model: 'gpt-5.4-mini', messages: [{ role: 'user', content: 'hi' }], stream: true },
      callbacks,
    );

    // The exact bug: a timeout must NOT be swallowed as if the user cancelled.
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    const errArg = callbacks.onError.mock.calls[0][0] as Error;
    expect(errArg.message).toMatch(/timed out/i);
    expect(callbacks.onDone).not.toHaveBeenCalled();
  });

  it('does NOT time out a long but healthy stream once the first token arrives', async () => {
    const { streamChat } = await loadStreamingService();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ReadableStream } = require('node:stream/web');
    const enc = new TextEncoder();

    guardedFetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const signal = init.signal;
      const body = new ReadableStream({
        start(c: {
          enqueue: (u: Uint8Array) => void;
          close: () => void;
          error: (e: Error) => void;
        }) {
          // First token arrives immediately → must cancel the response timeout.
          c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"hello "}}]}\n\n'));
          // The rest arrives AFTER the timeout would have fired. If the timeout
          // were still armed, fetch would abort the body and this would error.
          const t = setTimeout(() => {
            c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"world"}}]}\n\n'));
            c.enqueue(enc.encode('data: [DONE]\n\n'));
            c.close();
          }, TEST_TIMEOUT_MS * 3);
          // Simulate real fetch: aborting the signal errors the response body.
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              c.error(makeAbortError());
            },
            { once: true },
          );
        },
      });
      return Promise.resolve({ ok: true, status: 200, body } as unknown as Response);
    });

    const { deltas, callbacks } = makeCallbacks();
    await streamChat({ model: 'gpt-5.4-mini', messages: [], stream: true }, callbacks);

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(deltas.join('')).toBe('hello world');
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
  });
});
