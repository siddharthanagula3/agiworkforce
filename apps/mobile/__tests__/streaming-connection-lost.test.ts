import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const MODEL_ID = requireMobileCloudModel().id;
const OPERATION_ID = '0190a000-0000-7000-8000-000000000071';
const guardedFetchMock = jest.fn();

function load() {
  jest.resetModules();
  guardedFetchMock.mockReset();
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
    getAuthToken: jest.fn().mockResolvedValue('connection-token'),
  }));
  jest.doMock('../services/llmGate', () => ({
    ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
    ensureLlmGateOpen: jest.fn(),
  }));
  jest.doMock('../services/remoteChatGate', () => ({ assertRemoteChatAllowed: jest.fn() }));
  jest.doMock('@/src/features/waitlist/store', () => ({
    useWaitlistStore: { getState: () => ({ cloudUnlocked: true }) },
  }));
  jest.doMock('@/src/features/integrations/services/phoneDeviceHost', () => ({
    phoneDeviceHostHeaders: jest.fn().mockResolvedValue({}),
  }));
  jest
    .requireActual<typeof import('../src/features/auth/services/cloudAccountSession')>(
      '../src/features/auth/services/cloudAccountSession',
    )
    .activateCloudAccount('connection-account');
  /* eslint-disable @typescript-eslint/no-require-imports */
  const streaming = require('../services/streaming') as typeof import('../services/streaming');
  const lost =
    require('../services/streamConnectionLost') as typeof import('../services/streamConnectionLost');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { ...streaming, ...lost };
}

afterEach(() => {
  jest.useRealTimers();
  for (const path of [
    '@/lib/constants',
    '@/lib/egressGuard',
    '../services/authSession',
    '../services/llmGate',
    '../services/remoteChatGate',
    '@/src/features/waitlist/store',
    '@/src/features/integrations/services/phoneDeviceHost',
  ])
    jest.dontMock(path);
});

const encoder = new TextEncoder();

function frame(delta: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
}

function droppingResponse(chunks: Uint8Array[], dropMessage: string): Response {
  const read = jest.fn();
  for (const value of chunks) read.mockResolvedValueOnce({ done: false, value });
  read.mockRejectedValueOnce(new Error(dropMessage));
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: {
      getReader: () => ({
        read,
        cancel: jest.fn().mockResolvedValue(undefined),
        releaseLock: jest.fn(),
      }),
    },
  } as unknown as Response;
}

function completeResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: null,
    text: async () =>
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`,
  } as unknown as Response;
}

function refusedReplay(code: string): Response {
  const body = JSON.stringify({
    error: {
      message: 'An identical Managed Cloud request is already in progress.',
      type: 'invalid_request_error',
      code,
    },
  });
  return {
    ok: false,
    status: 409,
    headers: new Headers(),
    text: async () => body,
  } as unknown as Response;
}

function callbacks() {
  const content: string[] = [];
  return {
    content,
    onDelta: jest.fn((delta: { content?: string }) => {
      if (delta.content) content.push(delta.content);
    }),
    onDone: jest.fn(),
    onError: jest.fn(),
    onReconnecting: jest.fn(),
  };
}

function request() {
  return {
    model: MODEL_ID,
    messages: [{ role: 'user', content: 'Explain tides.' }],
    stream: true as const,
    operationId: OPERATION_ID,
  };
}

describe('a Cloud answer whose connection drops', () => {
  it('keeps what arrived and reports the lost connection instead of sending the turn again', async () => {
    const { streamChat, StreamConnectionLostError } = load();
    guardedFetchMock.mockResolvedValueOnce(
      droppingResponse(
        [frame({ content: 'Tides follow the moon. ' }), frame({ content: 'The sun adds a pull.' })],
        'The network connection was lost.',
      ),
    );
    const seen = callbacks();

    await streamChat(request(), seen);

    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
    expect(seen.content).toEqual(['Tides follow the moon. ', 'The sun adds a pull.']);
    expect(seen.onReconnecting).not.toHaveBeenCalled();
    expect(seen.onDone).not.toHaveBeenCalled();
    expect(seen.onError).toHaveBeenCalledTimes(1);
    expect(seen.onError.mock.calls[0][0]).toBeInstanceOf(StreamConnectionLostError);
  });

  it('sends the turn again with the same key when nothing had arrived yet', async () => {
    jest.useFakeTimers();
    const { streamChat } = load();
    guardedFetchMock
      .mockResolvedValueOnce(droppingResponse([], 'The network connection was lost.'))
      .mockResolvedValueOnce(completeResponse('Tides follow the moon.'));
    const seen = callbacks();

    const completion = streamChat(request(), seen);
    await jest.advanceTimersByTimeAsync(0);
    expect(seen.onReconnecting).toHaveBeenCalledWith(1);
    await jest.advanceTimersByTimeAsync(1_000);
    await completion;

    expect(guardedFetchMock).toHaveBeenCalledTimes(2);
    const keys = guardedFetchMock.mock.calls.map(
      ([, init]) => ((init as RequestInit).headers as Record<string, string>)['Idempotency-Key'],
    );
    expect(keys).toEqual([
      `agi.chat.mobile.send.${OPERATION_ID}`,
      `agi.chat.mobile.send.${OPERATION_ID}`,
    ]);
    expect(seen.content).toEqual(['Tides follow the moon.']);
    expect(seen.onError).not.toHaveBeenCalled();
    expect(seen.onDone).toHaveBeenCalledTimes(1);
  });

  it('retries a request the phone could not start', async () => {
    jest.useFakeTimers();
    const { streamChat } = load();
    guardedFetchMock
      .mockRejectedValueOnce(
        new Error('fetch failed: The Internet connection appears to be offline.'),
      )
      .mockResolvedValueOnce(completeResponse('Tides follow the moon.'));
    const seen = callbacks();

    const completion = streamChat(request(), seen);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1_000);
    await completion;

    expect(guardedFetchMock).toHaveBeenCalledTimes(2);
    expect(seen.onError).not.toHaveBeenCalled();
    expect(seen.content).toEqual(['Tides follow the moon.']);
  });

  it.each(['idempotency_in_progress', 'idempotency_replay'])(
    'reads a %s refusal on the reconnect as the lost connection, not the server sentence',
    async (code) => {
      jest.useFakeTimers();
      const { streamChat, StreamConnectionLostError } = load();
      guardedFetchMock
        .mockResolvedValueOnce(droppingResponse([], 'The network connection was lost.'))
        .mockResolvedValueOnce(refusedReplay(code));
      const seen = callbacks();

      const completion = streamChat(request(), seen);
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1_000);
      await completion;

      expect(guardedFetchMock).toHaveBeenCalledTimes(2);
      expect(seen.onError).toHaveBeenCalledTimes(1);
      const [error] = seen.onError.mock.calls[0] as [Error];
      expect(error).toBeInstanceOf(StreamConnectionLostError);
      expect(error.message).toBe('Connection lost.');
    },
  );

  it('shows the server refusal as it is when it answers the first request', async () => {
    const { streamChat, StreamConnectionLostError } = load();
    guardedFetchMock.mockResolvedValueOnce(refusedReplay('idempotency_in_progress'));
    const seen = callbacks();

    await streamChat(request(), seen);

    expect(seen.onError).toHaveBeenCalledTimes(1);
    const [error] = seen.onError.mock.calls[0] as [Error & { status?: number; code?: string }];
    expect(error).not.toBeInstanceOf(StreamConnectionLostError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('idempotency_in_progress');
  });
});
