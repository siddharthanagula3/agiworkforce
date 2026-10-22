import { requireCatalogModel } from '@/test-utils/modelFixtures';

const guardedFetchMock = jest.fn();
const fastSpeedForModelMock = jest.fn();
const FAST_MODEL_ID = requireCatalogModel(
  (model) => model.provider === 'anthropic' && model.fastTier !== undefined,
  'Anthropic model with a fast tier',
).id;
const OTHER_MODEL_ID = requireCatalogModel(
  (model) => model.id !== FAST_MODEL_ID && model.provider === 'anthropic',
  'second Anthropic model',
).id;

async function loadStreamingService() {
  jest.resetModules();
  delete process.env.EXPO_PUBLIC_USE_PROVIDER_STREAM;
  guardedFetchMock.mockReset().mockResolvedValue({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({ error: { message: 'stop here' } }),
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
  jest.doMock('@/services/authSession', () => ({
    getAuthToken: jest.fn().mockResolvedValue('cloud-token'),
  }));
  jest.doMock('@/services/llmGate', () => ({
    ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
    ensureLlmGateOpen: jest.fn(),
  }));
  jest.doMock('@/services/remoteChatGate', () => ({
    assertRemoteChatAllowed: jest.fn(),
  }));
  jest.doMock('@/src/features/waitlist/store', () => ({
    useWaitlistStore: { getState: () => ({ cloudUnlocked: true }) },
  }));
  jest.doMock('@/src/features/model-picker/store', () => ({
    useModelStore: { getState: () => ({ selectedModel: FAST_MODEL_ID }) },
  }));
  jest.doMock('@/src/features/model-picker/fastMode', () => ({
    fastSpeedForModel: fastSpeedForModelMock,
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/services/streaming') as typeof import('@/services/streaming');
}

async function sentBody(
  model: string,
  options?: { ignorePickerSpeed?: boolean },
): Promise<Record<string, unknown>> {
  const { streamChat } = await loadStreamingService();
  await streamChat(
    {
      model,
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      operationId: '0190a000-0000-7000-8000-000000000021',
    },
    { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() },
    undefined,
    options,
  );
  const init = guardedFetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body));
}

describe('streamChat speed', () => {
  afterEach(() => {
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/egressGuard');
    jest.dontMock('@/services/authSession');
    jest.dontMock('@/services/llmGate');
    jest.dontMock('@/services/remoteChatGate');
    jest.dontMock('@/src/features/waitlist/store');
    jest.dontMock('@/src/features/model-picker/store');
    jest.dontMock('@/src/features/model-picker/fastMode');
  });

  it('sends speed fast for the picker model when the shared rule allows it', async () => {
    fastSpeedForModelMock.mockReset().mockReturnValue('fast');
    expect((await sentBody(FAST_MODEL_ID)).speed).toBe('fast');
    expect(fastSpeedForModelMock).toHaveBeenCalledWith(FAST_MODEL_ID);
  });

  it('sends no speed when the shared rule refuses fast mode', async () => {
    fastSpeedForModelMock.mockReset().mockReturnValue(undefined);
    expect((await sentBody(FAST_MODEL_ID)).speed).toBeUndefined();
  });

  it('sends no speed for the picker model when the caller opts out of the picker speed', async () => {
    fastSpeedForModelMock.mockReset().mockReturnValue('fast');
    expect((await sentBody(FAST_MODEL_ID, { ignorePickerSpeed: true })).speed).toBeUndefined();
    expect(fastSpeedForModelMock).not.toHaveBeenCalled();
  });

  it('sends no speed for a model other than the one picked', async () => {
    fastSpeedForModelMock.mockReset().mockReturnValue('fast');
    expect((await sentBody(OTHER_MODEL_ID)).speed).toBeUndefined();
    expect(fastSpeedForModelMock).not.toHaveBeenCalled();
  });
});
