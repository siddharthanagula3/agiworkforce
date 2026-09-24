import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const guardedFetchMock = jest.fn();
const getAuthTokenMock = jest.fn();
const MODEL_ID = requireMobileCloudModel().id;

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

async function streamAndCatch(status: number, body: string) {
  const { streamChat } = await loadStreamingService();
  guardedFetchMock.mockResolvedValue({
    ok: false,
    status,
    text: async () => body,
  } as unknown as Response);

  const callbacks = { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() };
  await streamChat(
    {
      model: MODEL_ID,
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      operationId: `0190a000-0000-7000-8000-0000000000${status}`,
    },
    callbacks,
  );
  expect(callbacks.onError).toHaveBeenCalledTimes(1);
  return callbacks.onError.mock.calls[0][0] as Error;
}

describe('a refused stream reaches the banner as a sentence', () => {
  afterEach(() => {
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/egressGuard');
    jest.dontMock('../services/authSession');
    jest.dontMock('../services/llmGate');
    jest.dontMock('../services/remoteChatGate');
    jest.dontMock('@/src/features/waitlist/store');
  });

  it("carries the gateway's own sentence and code for a provider outage", async () => {
    const message =
      'This model is unavailable right now because of a problem on our side, not with your request. Choose another model, or try again shortly.';
    const error = await streamAndCatch(
      503,
      JSON.stringify({
        error: { message, type: 'service_unavailable', code: 'provider_billing_exhausted' },
      }),
    );
    expect(error.name).toBe('ApiHttpError');
    expect(error.message).toBe(message);
    expect((error as Error & { status: number; code: string | null }).status).toBe(503);
    expect((error as Error & { status: number; code: string | null }).code).toBe(
      'provider_billing_exhausted',
    );
  });

  it('asks for a sign-in on 401 instead of echoing the wire body', async () => {
    const error = await streamAndCatch(
      401,
      JSON.stringify({ error: { message: 'Missing or invalid authorization header' } }),
    );
    const { CLOUD_SIGN_IN_MESSAGE } = loadApiErrors();
    expect(error.message).toBe(CLOUD_SIGN_IN_MESSAGE);
  });

  it('never shows a status line with a raw body', async () => {
    const error = await streamAndCatch(502, '<html>Bad Gateway</html>');
    expect(error.message).toBe('The server hit a problem handling this request. Please try again.');
    expect(error.message).not.toMatch(/HTTP|<html>|\{/);
  });

  it('carries the id the server logged, so a reader has something to quote', async () => {
    const error = await streamAndCatch(
      503,
      JSON.stringify({
        error: { message: 'The model could not be reached.', code: 'provider_unreachable' },
        requestId: 'req_mobile_503',
      }),
    );
    expect((error as Error & { requestId?: string }).requestId).toBe('req_mobile_503');
  });

  it('states the wait our own limiter measured instead of a vague moment', async () => {
    const error = await streamAndCatch(
      429,
      JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', retry_after_seconds: 120 } }),
    );
    expect(error.message).toBe('Too many requests right now. Try again in about 2 minutes.');
    expect((error as Error & { retryAfterSeconds?: number }).retryAfterSeconds).toBe(120);
  });

  it('says nothing about a wait nobody measured', async () => {
    const error = await streamAndCatch(429, JSON.stringify({ error: { code: 'x' } }));
    expect(error.message).toBe('Too many requests right now. Please wait a moment and try again.');
    expect(error.message).not.toMatch(/\d/);
  });
});
