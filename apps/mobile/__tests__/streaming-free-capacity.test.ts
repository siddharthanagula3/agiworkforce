import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const guardedFetchMock = jest.fn();
const getAuthTokenMock = jest.fn();
const MODEL_ID = requireMobileCloudModel().id;
const RETRY_AT = '2026-09-01T12:01:30.000Z';

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

function loadApiErrors() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../services/apiErrors') as typeof import('../services/apiErrors');
}

function makeCallbacks() {
  return {
    onDelta: jest.fn(),
    onDone: jest.fn(),
    onError: jest.fn(),
  };
}

async function streamAndCatch(body: unknown, operationId: string) {
  const { streamChat } = await loadStreamingService();
  guardedFetchMock.mockResolvedValue({
    ok: false,
    status: 429,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response);

  const callbacks = makeCallbacks();
  await streamChat(
    {
      model: MODEL_ID,
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      operationId,
    },
    callbacks,
  );
  expect(callbacks.onError).toHaveBeenCalledTimes(1);
  return callbacks.onError.mock.calls[0][0];
}

describe('free-capacity 429 handling on the stream', () => {
  afterEach(() => {
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/egressGuard');
    jest.dontMock('../services/authSession');
    jest.dontMock('../services/llmGate');
    jest.dontMock('../services/remoteChatGate');
    jest.dontMock('@/src/features/waitlist/store');
  });

  it('reports a typed free-capacity error carrying retry_at', async () => {
    const error = await streamAndCatch(
      {
        error: {
          message: 'No free capacity right now.',
          type: 'insufficient_quota',
          code: 'free_capacity_unavailable',
          retry_at: RETRY_AT,
          recovery: [{ action: 'byok', href: '/byok' }],
        },
      },
      '0190a000-0000-7000-8000-000000000021',
    );
    const { ApiFreeCapacityError } = loadApiErrors();

    expect(error).toBeInstanceOf(ApiFreeCapacityError);
    expect(error.retryAtMs).toBe(Date.parse(RETRY_AT));
    expect(error.message).not.toContain('{');
  });

  it('still reports a paywall 429 as ApiPaywallError', async () => {
    const error = await streamAndCatch(
      {
        kind: 'paywall',
        feature: 'token_cap',
        requiredTier: 'basic',
        reason: '2M tokens used this month',
      },
      '0190a000-0000-7000-8000-000000000022',
    );
    const { ApiFreeCapacityError, ApiPaywallError } = loadApiErrors();

    expect(error).toBeInstanceOf(ApiPaywallError);
    expect(error).not.toBeInstanceOf(ApiFreeCapacityError);
    expect(error.feature).toBe('token_cap');
    expect(error.requiredTier).toBe('basic');
  });

  it('falls back to the generic http error for an unrecognised 429', async () => {
    const error = await streamAndCatch('Too many requests', '0190a000-0000-7000-8000-000000000023');
    const { ApiFreeCapacityError, ApiPaywallError } = loadApiErrors();

    expect(error).not.toBeInstanceOf(ApiFreeCapacityError);
    expect(error).not.toBeInstanceOf(ApiPaywallError);
    expect(error.message).toBe('HTTP 429: Too many requests');
  });
});
