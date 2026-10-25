import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const guardedFetchMock = jest.fn();
const MODEL_ID = requireMobileCloudModel().id;

async function loadStreamingService() {
  jest.resetModules();
  delete process.env.EXPO_PUBLIC_USE_PROVIDER_STREAM;

  guardedFetchMock.mockReset().mockResolvedValue({
    ok: false,
    status: 400,
    text: async () =>
      JSON.stringify({ error: { message: 'stop here', type: 'invalid_request_error' } }),
  } as unknown as Response);

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
    getAuthToken: jest.fn().mockResolvedValue('cloud-token'),
  }));
  jest.doMock('../services/llmGate', () => ({
    ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
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

describe('managed chat prompt cache', () => {
  afterEach(() => {
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/egressGuard');
    jest.dontMock('../services/authSession');
    jest.dontMock('../services/llmGate');
    jest.dontMock('../services/remoteChatGate');
    jest.dontMock('@/src/features/waitlist/store');
  });

  it('asks the server to cache the prompt prefix, as the web client does', async () => {
    const { streamChat } = await loadStreamingService();
    await streamChat(
      {
        model: MODEL_ID,
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000031',
      },
      { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() },
    );

    expect(guardedFetchMock).toHaveBeenCalled();
    const [, init] = guardedFetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ use_prompt_cache: true });
  });
});
