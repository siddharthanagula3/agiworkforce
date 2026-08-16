
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const guardedFetchMock = jest.fn();
const getAuthTokenMock = jest.fn();
const MODEL_ID = requireMobileCloudModel().id;
const MODEL_ACCESS_MESSAGE = `Model ${MODEL_ID} requires PRO subscription or higher.`;

async function loadStreamingService() {
  jest.resetModules();
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
  return {
    onDelta: jest.fn(),
    onDone: jest.fn(),
    onError: jest.fn(),
  };
}

describe('model-tier-gate 403 handling', () => {
  afterEach(() => {
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/egressGuard');
    jest.dontMock('../services/authSession');
    jest.dontMock('../services/llmGate');
    jest.dontMock('../services/remoteChatGate');
    jest.dontMock('@/src/features/waitlist/store');
  });

  it('throws ApiPaywallError with feature="model_access" for a model_not_available 403', async () => {
    const { streamChat } = await loadStreamingService();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ApiPaywallError } = require('../services/api') as typeof import('../services/api');
    guardedFetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          error: {
            message: MODEL_ACCESS_MESSAGE,
            type: 'invalid_request_error',
            code: 'model_not_available',
            requiredTier: 'pro',
          },
        }),
    } as unknown as Response);

    const callbacks = makeCallbacks();
    await streamChat(
      {
        model: MODEL_ID,
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000011',
      },
      callbacks,
    );

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    const err = callbacks.onError.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiPaywallError);
    expect(err.feature).toBe('model_access');
    expect(err.requiredTier).toBe('pro');
    expect(err.reason).toBe(MODEL_ACCESS_MESSAGE);
  });

  it('falls back to a generic Error for a 403 without the model_not_available code', async () => {
    const { streamChat } = await loadStreamingService();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ApiPaywallError } = require('../services/api') as typeof import('../services/api');
    guardedFetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { message: 'Forbidden', code: 'other' } }),
    } as unknown as Response);

    const callbacks = makeCallbacks();
    await streamChat(
      {
        model: MODEL_ID,
        messages: [],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000012',
      },
      callbacks,
    );

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    const err = callbacks.onError.mock.calls[0][0];
    expect(err).not.toBeInstanceOf(ApiPaywallError);
  });

  it('falls back to requiredTier="pro" when the server omits the field', async () => {
    const { streamChat } = await loadStreamingService();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ApiPaywallError } = require('../services/api') as typeof import('../services/api');
    guardedFetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          error: { message: 'Model x requires PRO.', code: 'model_not_available' },
        }),
    } as unknown as Response);

    const callbacks = makeCallbacks();
    await streamChat(
      {
        model: MODEL_ID,
        messages: [],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000013',
      },
      callbacks,
    );

    const err = callbacks.onError.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiPaywallError);
    expect(err.requiredTier).toBe('pro');
  });
});
