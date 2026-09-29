import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import { getModelsForTierAndSurface, getProviderOfferings } from '@agiworkforce/types';

const streamFromProviderMock = jest.fn();
const guardedFetchMock = jest.fn();
const getAuthTokenMock = jest.fn();

const SSE = ['data: {"choices":[{"delta":{"content":"ok"}}]}', '', 'data: [DONE]', ''].join('\n');

async function loadStreamingService() {
  jest.resetModules();
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

  it('sends every entitled Qwen model through the managed chat API', async () => {
    const qwenModels = getModelsForTierAndSurface('max', 'mobile/cloud-chat').filter(
      (model) => model.provider === 'qwen',
    );
    expect(qwenModels.length).toBeGreaterThan(0);
    const { streamChat } = await loadStreamingService();
    for (const [index, qwenModel] of qwenModels.entries()) {
      const callbacks = {
        onDelta: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };
      const operationId = `0190a000-0000-7000-8000-${String(index + 32).padStart(12, '0')}`;

      await streamChat(
        {
          model: qwenModel.id,
          messages: [{ role: 'user', content: 'hello' }],
          stream: true,
          operationId,
        },
        callbacks,
      );

      expect(guardedFetchMock).toHaveBeenLastCalledWith(
        'https://api.agi.test/api/llm/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer cloud-token',
            'Idempotency-Key': `agi.chat.mobile.send.${operationId}`,
          }),
          body: JSON.stringify({
            model: qwenModel.id,
            messages: [{ role: 'user', content: 'hello' }],
            stream: true,
          }),
        }),
        { stream: true },
      );
      expect(callbacks.onDelta).toHaveBeenCalledWith(expect.objectContaining({ content: 'ok' }));
      expect(callbacks.onDone).toHaveBeenCalledTimes(1);
      expect(callbacks.onError).not.toHaveBeenCalled();
    }
    expect(guardedFetchMock).toHaveBeenCalledTimes(qwenModels.length);
    expect(streamFromProviderMock).not.toHaveBeenCalled();
  });

  it('reports a Qwen server failure without bypassing the managed route', async () => {
    const qwenModel = getModelsForTierAndSurface('max', 'mobile/cloud-chat').find(
      (model) => model.provider === 'qwen',
    );
    if (!qwenModel) throw new Error('Expected a Qwen model in the Mobile Cloud catalog.');
    const { streamChat } = await loadStreamingService();
    guardedFetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '{"error":{"message":"Provider unavailable"}}',
    } as Response);
    const callbacks = { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() };

    await streamChat(
      {
        model: qwenModel.id,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000099',
      },
      callbacks,
    );

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    expect(callbacks.onDone).not.toHaveBeenCalled();
    expect(streamFromProviderMock).not.toHaveBeenCalled();
    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends provider-funded Qwen offerings only to the Free quota endpoint', async () => {
    const offering = Object.entries(getProviderOfferings()).find(
      ([, candidate]) => candidate.provider === 'qwen' && candidate.quotaProbeProtocol === 'chat',
    );
    if (!offering) throw new Error('Expected a Qwen chat offering in the generated catalog.');
    const { streamChat } = await loadStreamingService();
    const callbacks = { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() };
    const operationId = '0190a000-0000-7000-8000-000000000101';
    const request = {
      model: offering[0],
      conversation_id: '0190a000-0000-7000-8000-000000000102',
      assistant_message_id: operationId,
      user_message: { id: '0190a000-0000-7000-8000-000000000103' },
      messages: [{ role: 'user' as const, content: 'hello' }],
      operationId,
    };

    await streamChat(request, callbacks);

    expect(guardedFetchMock).toHaveBeenCalledWith(
      'https://api.agi.test/api/models/free-quota/completions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: request.model,
          conversation_id: request.conversation_id,
          assistant_message_id: request.assistant_message_id,
          user_message: request.user_message,
          messages: request.messages,
        }),
      }),
      { stream: true },
    );
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('refuses to send a provider-funded offering through billed chat', async () => {
    const offering = Object.entries(getProviderOfferings()).find(
      ([, candidate]) => candidate.provider === 'qwen' && candidate.quotaProbeProtocol === 'chat',
    );
    if (!offering) throw new Error('Expected a Qwen chat offering in the generated catalog.');
    const { streamChat } = await loadStreamingService();
    const callbacks = { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() };

    await streamChat(
      {
        model: offering[0],
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000105',
      },
      callbacks,
    );

    expect(guardedFetchMock).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Provider-funded Free models require the Free chat route.',
      }),
    );
  });

  it('refuses to send a billed model through the Free quota endpoint', async () => {
    const { streamFreeQuotaChat } = await loadStreamingService();
    const callbacks = { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() };

    await streamFreeQuotaChat(
      {
        model: requireMobileCloudModel().id,
        conversation_id: '0190a000-0000-7000-8000-000000000106',
        assistant_message_id: '0190a000-0000-7000-8000-000000000107',
        operationId: '0190a000-0000-7000-8000-000000000107',
        messages: [{ role: 'user', content: 'hello' }],
      },
      callbacks,
    );

    expect(guardedFetchMock).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'This model is not a provider-funded Free chat offering.',
      }),
    );
  });

  it('does not send an old Free prompt when its token resolves after cancellation', async () => {
    const offering = Object.entries(getProviderOfferings()).find(
      ([, candidate]) => candidate.provider === 'qwen' && candidate.quotaProbeProtocol === 'chat',
    );
    if (!offering) throw new Error('Expected a Qwen chat offering in the generated catalog.');
    const { streamChat } = await loadStreamingService();
    let resolveToken!: (token: string) => void;
    getAuthTokenMock.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveToken = resolve;
      }),
    );
    const controller = new AbortController();
    const callbacks = { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() };
    const pending = streamChat(
      {
        model: offering[0],
        conversation_id: '0190a000-0000-7000-8000-000000000108',
        assistant_message_id: '0190a000-0000-7000-8000-000000000109',
        operationId: '0190a000-0000-7000-8000-000000000109',
        messages: [{ role: 'user', content: 'account A prompt' }],
      },
      callbacks,
      controller.signal,
    );

    controller.abort();
    resolveToken('account-b-token');
    await pending;

    expect(guardedFetchMock).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onDone).not.toHaveBeenCalled();
  });

  it('does not send a Cloud prompt without an authenticated token', async () => {
    const { streamChat } = await loadStreamingService();
    getAuthTokenMock.mockResolvedValueOnce(null);
    const callbacks = { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() };

    await streamChat(
      {
        model: requireMobileCloudModel().id,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
        operationId: '0190a000-0000-7000-8000-000000000110',
      },
      callbacks,
    );

    expect(guardedFetchMock).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });
});
