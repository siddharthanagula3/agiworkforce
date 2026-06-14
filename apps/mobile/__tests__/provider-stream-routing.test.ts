const streamFromProviderMock = jest.fn();
const secureFetchMock = jest.fn();
const getAuthTokenMock = jest.fn();

async function* successfulProviderStream() {
  yield { type: 'text-delta', delta: 'ok' };
  yield { type: 'stop', reason: 'end_turn' };
}

async function loadStreamingService() {
  jest.resetModules();
  process.env.EXPO_PUBLIC_USE_PROVIDER_STREAM = '1';

  streamFromProviderMock.mockReset().mockImplementation(successfulProviderStream);
  secureFetchMock.mockReset();
  getAuthTokenMock.mockReset().mockResolvedValue('cloud-token');

  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000 },
  }));

  jest.doMock('@/lib/providerStreamClient', () => ({
    streamFromProvider: streamFromProviderMock,
  }));

  jest.doMock('../services/authSession', () => ({
    getAuthToken: getAuthTokenMock,
  }));

  jest.doMock('../services/secureFetch', () => ({
    secureFetch: secureFetchMock,
  }));

  jest.doMock('../services/llmGate', () => ({
    ensureLlmGateOpen: jest.fn(),
  }));

  jest.doMock('../services/remoteChatGate', () => ({
    assertRemoteChatAllowed: jest.fn(),
  }));

  jest.doMock('@/src/features/waitlist/store', () => ({
    useWaitlistStore: {
      getState: () => ({ cloudUnlocked: true }),
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../services/streaming') as typeof import('../services/streaming');
}

describe('provider stream routing', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_USE_PROVIDER_STREAM;
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/providerStreamClient');
    jest.dontMock('../services/authSession');
    jest.dontMock('../services/secureFetch');
    jest.dontMock('../services/llmGate');
    jest.dontMock('../services/remoteChatGate');
    jest.dontMock('@/src/features/waitlist/store');
  });

  it.each([
    ['grok-4.3', 'xai'],
    ['deepseek-v4-flash', 'deepseek'],
    ['qwen-max', 'qwen'],
    ['kimi-k2.6', 'moonshot'],
  ])('routes %s through the managed provider stream for %s', async (model, providerId) => {
    const { streamChat } = await loadStreamingService();
    const callbacks = {
      onDelta: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    await streamChat(
      {
        model,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
      callbacks,
    );

    expect(streamFromProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayUrl: 'https://api.agi.test',
        providerId,
        authToken: 'cloud-token',
        request: expect.objectContaining({ model }),
      }),
    );
    expect(secureFetchMock).not.toHaveBeenCalled();
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
