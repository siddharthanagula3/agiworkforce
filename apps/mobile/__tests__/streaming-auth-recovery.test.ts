import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const guardedFetchMock = jest.fn();
const getAuthTokenMock = jest.fn();
const recoverStreamSessionMock = jest.fn();
const streamAuthRefusalMock = jest.fn();
const MODEL_ID = requireMobileCloudModel().id;

async function loadStreamingService() {
  jest.resetModules();
  delete process.env.EXPO_PUBLIC_USE_PROVIDER_STREAM;
  guardedFetchMock.mockReset();
  getAuthTokenMock.mockReset().mockResolvedValue('cloud-token');
  recoverStreamSessionMock.mockReset();
  streamAuthRefusalMock.mockReset().mockReturnValue(null);

  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    WS_URL: 'wss://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000 },
  }));
  jest.doMock('@/lib/egressGuard', () => ({
    guardedFetch: guardedFetchMock,
    EgressBlockedError: class EgressBlockedError extends Error {},
  }));
  jest.doMock('../services/authSession', () => ({ getAuthToken: getAuthTokenMock }));
  jest.doMock('../services/llmGate', () => ({ ensureLlmGateOpen: jest.fn() }));
  jest.doMock('../services/remoteChatGate', () => ({ assertRemoteChatAllowed: jest.fn() }));
  jest.doMock('@/src/features/waitlist/store', () => ({
    useWaitlistStore: { getState: () => ({ cloudUnlocked: true }) },
  }));
  jest.doMock('../services/api', () => ({
    ApiPaywallError: class ApiPaywallError extends Error {},
    recoverStreamSession: recoverStreamSessionMock,
    streamAuthRefusal: streamAuthRefusalMock,
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../services/streaming') as typeof import('../services/streaming');
}

function refused(status: number, body = '{}') {
  return { ok: false, status, text: async () => body } as unknown as Response;
}

async function send() {
  const { streamChat } = await loadStreamingService();
  return async () => {
    const callbacks = { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() };
    await streamChat(
      {
        model: MODEL_ID,
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000401',
      },
      callbacks,
    );
    return callbacks;
  };
}

describe('the chat stream keeps the account rules every other request follows', () => {
  afterEach(() => {
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/egressGuard');
    jest.dontMock('../services/authSession');
    jest.dontMock('../services/llmGate');
    jest.dontMock('../services/remoteChatGate');
    jest.dontMock('@/src/features/waitlist/store');
    jest.dontMock('../services/api');
  });

  it('refreshes an expired session once and resends the turn', async () => {
    const run = await send();
    recoverStreamSessionMock.mockResolvedValue(true);
    guardedFetchMock
      .mockResolvedValueOnce(refused(401))
      .mockResolvedValueOnce(refused(503, '{"error":{"message":"busy"}}'));

    const callbacks = await run();

    expect(recoverStreamSessionMock).toHaveBeenCalledTimes(1);
    expect(guardedFetchMock).toHaveBeenCalledTimes(2);
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
  });

  it('does not resend when the session cannot be refreshed', async () => {
    const run = await send();
    recoverStreamSessionMock.mockResolvedValue(false);
    guardedFetchMock.mockResolvedValue(refused(401));

    const callbacks = await run();

    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
  });

  it('hands an account refusal to the shared account handling', async () => {
    const run = await send();
    const accountError = new Error('HTTP 403: This account is locked.');
    streamAuthRefusalMock.mockReturnValue(accountError);
    const body = '{"error":{"code":"account_unavailable","message":"This account is locked."}}';
    guardedFetchMock.mockResolvedValue(refused(403, body));

    const callbacks = await run();

    expect(streamAuthRefusalMock).toHaveBeenCalledWith(403, body);
    expect(callbacks.onError).toHaveBeenCalledWith(accountError);
  });
});
