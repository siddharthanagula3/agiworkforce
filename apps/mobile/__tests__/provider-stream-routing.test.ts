import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const streamFromProviderMock = jest.fn();
const guardedFetchMock = jest.fn();
const getAuthTokenMock = jest.fn();

const SSE = ['data: {"choices":[{"delta":{"content":"ok"}}]}', '', 'data: [DONE]', ''].join('\n');

async function loadStreamingService() {
  jest.resetModules();
  // A stale build-time flag must not route a paid mobile turn around the
  // managed chat reservation/finalization contract.
  process.env.EXPO_PUBLIC_USE_PROVIDER_STREAM = '1';

  streamFromProviderMock.mockReset();
  guardedFetchMock.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    body: null,
    text: async () => SSE,
  } as unknown as Response);
  getAuthTokenMock.mockReset().mockResolvedValue('cloud-token');

  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000, STREAM_STALL: 45_000 },
  }));
  jest.doMock('@/lib/providerStreamClient', () => ({
    streamFromProvider: streamFromProviderMock,
  }));
  jest.doMock('@/lib/egressGuard', () => ({
    guardedFetch: guardedFetchMock,
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

describe('managed mobile stream routing', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_USE_PROVIDER_STREAM;
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/providerStreamClient');
    jest.dontMock('@/lib/egressGuard');
    jest.dontMock('../services/authSession');
    jest.dontMock('../services/llmGate');
    jest.dontMock('../services/remoteChatGate');
    jest.dontMock('@/src/features/waitlist/store');
  });

  it('uses the billed chat contract even when the retired provider-stream flag is set', async () => {
    const { streamChat } = await loadStreamingService();
    const callbacks = {
      onDelta: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };
    const operationId = '0190a000-0000-7000-8000-000000000031';

    await streamChat(
      {
        model: requireMobileCloudModel().id,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
        operationId,
      },
      callbacks,
    );

    expect(streamFromProviderMock).not.toHaveBeenCalled();
    expect(guardedFetchMock).toHaveBeenCalledWith(
      'https://api.agi.test/api/llm/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer cloud-token',
          'Idempotency-Key': `agi.chat.mobile.send.${operationId}`,
        }),
      }),
      { stream: true },
    );
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
