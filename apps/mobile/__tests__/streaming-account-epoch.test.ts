import { AGENT_EVENT_SCHEMA_VERSION, getProviderOfferings } from '@agiworkforce/types';
import type { ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import type { StreamCallbacks } from '../services/streaming';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const MODEL = requireMobileCloudModel();
const FREE_MODEL_ID = Object.entries(getProviderOfferings()).find(
  ([, offering]) => offering.category === 'chat' && offering.quotaProbeProtocol === 'chat',
)?.[0];
const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const STEER_ID = '0190a000-0000-7000-8000-000000000002';
const guardedFetchMock = jest.fn();
const tokenMock = jest.fn();
const consentMock = jest.fn();
const deviceHeadersMock = jest.fn();
const recoverMock = jest.fn();
const refusalMock = jest.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let markStarted!: () => void;
  const started = new Promise<void>((done) => {
    markStarted = done;
  });
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return {
    started,
    resolve,
    read: jest.fn(() => {
      markStarted();
      return promise;
    }),
  };
}

function load() {
  jest.resetModules();
  guardedFetchMock.mockReset();
  tokenMock.mockReset().mockResolvedValue('account-a-token');
  consentMock.mockReset().mockResolvedValue(undefined);
  deviceHeadersMock.mockReset().mockResolvedValue({});
  recoverMock.mockReset().mockResolvedValue(true);
  refusalMock.mockReset().mockReturnValue(null);
  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000, STREAM_STALL: 30_000 },
  }));
  jest.doMock('@/lib/egressGuard', () => ({ guardedFetch: guardedFetchMock }));
  jest.doMock('../services/authSession', () => ({ getAuthToken: tokenMock }));
  jest.doMock('../services/llmGate', () => ({
    ensureCloudSendConsent: consentMock,
    ensureLlmGateOpen: jest.fn(),
  }));
  jest.doMock('../services/remoteChatGate', () => ({ assertRemoteChatAllowed: jest.fn() }));
  jest.doMock('@/src/features/waitlist/store', () => ({
    useWaitlistStore: { getState: () => ({ cloudUnlocked: true }) },
  }));
  jest.doMock('@/src/features/integrations/services/phoneDeviceHost', () => ({
    phoneDeviceHostHeaders: deviceHeadersMock,
  }));
  jest.doMock('../services/api', () => ({
    ApiPaywallError: class ApiPaywallError extends Error {},
    recoverStreamSession: recoverMock,
    streamAuthRefusal: refusalMock,
  }));

  const accounts = jest.requireActual<
    typeof import('../src/features/auth/services/cloudAccountSession')
  >('../src/features/auth/services/cloudAccountSession');
  accounts.activateCloudAccount('stream-account-a');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const streaming = require('../services/streaming') as typeof import('../services/streaming');
  return { ...streaming, accounts };
}

type Services = ReturnType<typeof load>;
const streamKinds = ['managed', 'free', 'approval', 'input', 'device'] as const;
type StreamKind = (typeof streamKinds)[number];

function send(services: Services, kind: StreamKind, callbacks: StreamCallbacks) {
  const common = { run_id: RUN_ID, operationId: RUN_ID };
  if (kind === 'approval')
    return services.streamToolApprovalResume(
      {
        ...common,
        tool_approvals: [{ tool_call_id: 'call-1', decision: 'approved' }],
      },
      callbacks,
    );
  if (kind === 'input')
    return services.streamToolInputResume(
      {
        ...common,
        tool_inputs: [{ tool_call_id: 'call-1', input_responses: { answer: 'yes' } }],
      },
      callbacks,
    );
  if (kind === 'device')
    return services.streamDeviceStepResume(
      {
        ...common,
        device_id: 'phone-1',
        device_results: [],
      },
      callbacks,
    );
  if (kind === 'free') {
    if (!FREE_MODEL_ID) throw new Error('Expected a provider-funded chat offering');
    return services.streamFreeQuotaChat(
      {
        model: FREE_MODEL_ID,
        conversation_id: RUN_ID,
        assistant_message_id: STEER_ID,
        operationId: RUN_ID,
        messages: [{ role: 'user', content: 'hello' }],
      },
      callbacks,
    );
  }
  return services.streamChat(
    {
      model: MODEL.id,
      messages: [{ role: 'user', content: 'hello' }],
      stream: true,
      operationId: RUN_ID,
    },
    callbacks,
  );
}

function callbacks() {
  return { onDelta: jest.fn(), onDone: jest.fn(), onError: jest.fn() };
}

function expectSilent(calls: ReturnType<typeof callbacks>) {
  expect(calls.onDelta).not.toHaveBeenCalled();
  expect(calls.onDone).not.toHaveBeenCalled();
  expect(calls.onError).not.toHaveBeenCalled();
}

function completedStream() {
  return {
    ok: true,
    status: 200,
    body: null,
    text: async () => 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n',
  } as unknown as Response;
}

function run() {
  return {
    id: RUN_ID,
    userId: 'stream-account-a',
    requestId: 'request-1',
    conversationId: 'conversation-1',
    originSurface: 'mobile',
    workMode: 'chat',
    state: 'completed',
    provider: MODEL.provider,
    model: MODEL.id,
    lastEventSequence: 0,
    cancellationRequestedAt: null,
    completedAt: '2026-10-01T12:00:00.000Z',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  };
}

function snapshot() {
  return {
    run: run(),
    nextAfterSequence: 0,
    events: [
      {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: 'session-1',
        turnId: 'turn-1',
        sequence: 0,
        emittedAtMs: 1000,
        event: { type: 'text-delta', delta: 'old account text' },
      },
    ],
  };
}

const runMethods: Array<[string, (client: ManagedCloudAgentRunClient) => Promise<unknown>]> = [
  ['list', (client) => client.listRuns()],
  ['get', (client) => client.getRun(RUN_ID)],
  ['cancel', (client) => client.cancelRun(RUN_ID)],
  [
    'approve',
    (client) => client.resumeRun(RUN_ID, [{ toolCallId: 'call-1', decision: 'approved' }]),
  ],
  [
    'input',
    (client) =>
      client.answerRunInput(RUN_ID, [{ toolCallId: 'call-1', responses: { answer: 'yes' } }]),
  ],
  ['pause', (client) => client.pauseRun(RUN_ID)],
  ['resume', (client) => client.resumePausedRun(RUN_ID)],
  ['steer', (client) => client.steerRun(RUN_ID, 'Continue')],
  ['withdraw', (client) => client.withdrawSteer(RUN_ID, STEER_ID)],
  ['follow', (client) => client.followRun(RUN_ID)],
];

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
    '../services/api',
  ])
    jest.dontMock(path);
});

describe('stream operation account ownership', () => {
  it.each(streamKinds)('refuses %s explicitly without an active account', async (kind) => {
    const services = load();
    services.accounts.invalidateCloudAccount();
    const calls = callbacks();
    await send(services, kind, calls);
    expect(calls.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'CloudCredentialUnavailableError',
      }),
    );
    expect(calls.onDelta).not.toHaveBeenCalled();
    expect(calls.onDone).not.toHaveBeenCalled();
    expect(tokenMock).not.toHaveBeenCalled();
    expect(guardedFetchMock).not.toHaveBeenCalled();
  });

  it.each(['managed', 'free'] as const)(
    'keeps the %s owner while consent is pending',
    async (kind) => {
      const services = load();
      const consent = deferred<void>();
      consentMock.mockImplementation(consent.read);
      const calls = callbacks();
      const pending = send(services, kind, calls);
      await consent.started;
      services.accounts.activateCloudAccount('stream-account-b');
      consent.resolve();
      await pending;
      expect(tokenMock).not.toHaveBeenCalled();
      expect(guardedFetchMock).not.toHaveBeenCalled();
      expectSilent(calls);
    },
  );

  it.each(streamKinds)(
    'blocks %s egress after delayed token lookup changes owner',
    async (kind) => {
      const services = load();
      const token = deferred<string>();
      tokenMock.mockImplementation(token.read);
      const calls = callbacks();
      const pending = send(services, kind, calls);
      await token.started;
      services.accounts.activateCloudAccount('stream-account-b');
      token.resolve('account-b-token');
      await pending;
      expect(deviceHeadersMock).not.toHaveBeenCalled();
      expect(guardedFetchMock).not.toHaveBeenCalled();
      expectSilent(calls);
    },
  );

  it.each(['managed', 'approval', 'input', 'device'] as const)(
    'blocks %s egress after delayed device headers change owner',
    async (kind) => {
      const services = load();
      const headers = deferred<Record<string, string>>();
      deviceHeadersMock.mockImplementation(headers.read);
      const calls = callbacks();
      const pending = send(services, kind, calls);
      await headers.started;
      services.accounts.activateCloudAccount('stream-account-b');
      headers.resolve({});
      await pending;
      expect(guardedFetchMock).not.toHaveBeenCalled();
      expectSilent(calls);
    },
  );

  it.each(streamKinds)('does not handle a stale %s account refusal', async (kind) => {
    const services = load();
    const body = deferred<string>();
    guardedFetchMock.mockResolvedValue({ ok: false, status: 403, text: body.read });
    const calls = callbacks();
    const pending = send(services, kind, calls);
    await body.started;
    services.accounts.activateCloudAccount('stream-account-b');
    body.resolve('{"error":{"code":"account_unavailable"}}');
    await pending;
    expect(refusalMock).not.toHaveBeenCalled();
    expectSilent(calls);
  });

  it.each(streamKinds)(
    'suppresses stale %s SSE after logout and same-account login',
    async (kind) => {
      const services = load();
      const body = deferred<string>();
      guardedFetchMock.mockResolvedValue({ ok: true, status: 200, body: null, text: body.read });
      const calls = callbacks();
      const pending = send(services, kind, calls);
      await body.started;
      services.accounts.invalidateCloudAccount();
      services.accounts.activateCloudAccount('stream-account-a');
      body.resolve('data: {"choices":[{"delta":{"content":"stale"}}]}\n\ndata: [DONE]\n\n');
      await pending;
      expectSilent(calls);
    },
  );

  it('does not recapture the account during 401 recovery', async () => {
    const services = load();
    const recovery = deferred<boolean>();
    recoverMock.mockImplementation(recovery.read);
    guardedFetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => '{}' });
    const original = services.accounts.captureCloudAccountEpoch();
    const calls = callbacks();
    const pending = send(services, 'managed', calls);
    await recovery.started;
    services.accounts.activateCloudAccount('stream-account-b');
    recovery.resolve(true);
    await pending;
    expect(recoverMock).toHaveBeenCalledWith(original);
    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
    expectSilent(calls);
  });

  it('does not retry with a new account after reconnect backoff', async () => {
    jest.useFakeTimers();
    const services = load();
    guardedFetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const reconnect = deferred<void>();
    const calls = callbacks();
    const pending = send(services, 'managed', {
      ...calls,
      onReconnecting: () => {
        reconnect.resolve();
      },
    });
    await reconnect.read();
    services.accounts.activateCloudAccount('stream-account-b');
    await jest.advanceTimersByTimeAsync(1000);
    await pending;
    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
    expectSilent(calls);
  });

  it('does not create a new-owner durable client from the reconnect callback', async () => {
    const services = load();
    const response = {
      ...completedStream(),
      headers: new Headers({
        'X-AGI-Agent-Run-Id': RUN_ID,
        'X-AGI-Agent-Run-URL': `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
      }),
      text: async () => {
        throw new TypeError('Network request failed');
      },
    } as Response;
    guardedFetchMock.mockResolvedValue(response);
    const calls = callbacks();
    await send(services, 'managed', {
      ...calls,
      onReconnecting: () => {
        services.accounts.activateCloudAccount('stream-account-b');
      },
    });
    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
    expect(tokenMock).toHaveBeenCalledTimes(1);
    expectSilent(calls);
  });

  it('keeps a same-account background continuation after reactivation', async () => {
    const services = load();
    const token = deferred<string>();
    tokenMock.mockImplementation(token.read);
    guardedFetchMock.mockResolvedValue(completedStream());
    const calls = callbacks();
    const pending = send(services, 'managed', calls);
    await token.started;
    services.accounts.activateCloudAccount('stream-account-a');
    token.resolve('same-account-refreshed-token');
    await pending;
    expect(calls.onDone).toHaveBeenCalledTimes(1);
    expect(calls.onError).not.toHaveBeenCalled();
    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(streamKinds)('preserves same-account %s completion', async (kind) => {
    const services = load();
    guardedFetchMock.mockResolvedValue(completedStream());
    const calls = callbacks();
    await send(services, kind, calls);
    expect(calls.onDelta).toHaveBeenCalledWith({ content: 'hello' });
    expect(calls.onDone).toHaveBeenCalledTimes(1);
    expect(calls.onError).not.toHaveBeenCalled();
  });
});

describe('run clients keep their creation account', () => {
  it.each(runMethods)('preserves same-account %s completion', async (_, invoke) => {
    const services = load();
    const cancel = jest.fn().mockResolvedValue(undefined);
    guardedFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: { cancel },
      json: async () => ({
        ...snapshot(),
        runs: [run()],
        nextCursor: null,
        steer: { id: STEER_ID, text: 'Continue', queuedAt: '2026-10-01T12:00:00.000Z' },
      }),
    });
    await invoke(services.createMobileCloudAgentRunClient());
    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves same-account fetch errors', async () => {
    const services = load();
    const error = new Error('Original network error');
    guardedFetchMock.mockRejectedValue(error);
    await expect(services.createMobileCloudAgentRunClient().listRuns()).rejects.toBe(error);
  });

  it.each(runMethods)(
    'blocks %s after a delayed token lookup changes accounts',
    async (_, invoke) => {
      const services = load();
      const token = deferred<string>();
      tokenMock.mockImplementation(token.read);
      const pending = invoke(services.createMobileCloudAgentRunClient());
      const rejected = expect(pending).rejects.toMatchObject({
        name: 'StaleCloudAccountOperationError',
      });
      await token.started;
      services.accounts.activateCloudAccount('stream-account-b');
      token.resolve('account-b-token');
      await rejected;
      expect(guardedFetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(runMethods)('rejects retained %s clients before token lookup', async (_, invoke) => {
    const services = load();
    const client = services.createMobileCloudAgentRunClient();
    services.accounts.activateCloudAccount('stream-account-b');
    await expect(invoke(client)).rejects.toMatchObject({ name: 'StaleCloudAccountOperationError' });
    expect(tokenMock).not.toHaveBeenCalled();
    expect(guardedFetchMock).not.toHaveBeenCalled();
  });

  it.each(runMethods)('fails closed for %s without an active account', async (_, invoke) => {
    const services = load();
    services.accounts.invalidateCloudAccount();
    await expect(invoke(services.createMobileCloudAgentRunClient())).rejects.toMatchObject({
      name: 'StaleCloudAccountOperationError',
    });
    expect(tokenMock).not.toHaveBeenCalled();
    expect(guardedFetchMock).not.toHaveBeenCalled();
  });

  it.each(runMethods.filter(([name]) => !['approve', 'input', 'resume'].includes(name)))(
    'rejects %s completion after delayed shared JSON parsing',
    async (_, invoke) => {
      const services = load();
      const body = deferred<unknown>();
      guardedFetchMock.mockResolvedValue({ ok: true, status: 200, json: body.read });
      const pending = invoke(services.createMobileCloudAgentRunClient());
      const rejected = expect(pending).rejects.toMatchObject({
        name: 'StaleCloudAccountOperationError',
      });
      await body.started;
      services.accounts.activateCloudAccount('stream-account-b');
      body.resolve({
        ...snapshot(),
        runs: [run()],
        nextCursor: null,
        steer: { id: STEER_ID, text: 'Continue', queuedAt: '2026-10-01T12:00:00.000Z' },
      });
      await rejected;
      expect(guardedFetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each(runMethods.filter(([name]) => ['approve', 'input', 'resume'].includes(name)))(
    'rejects %s completion after delayed body cancellation without buffering',
    async (_, invoke) => {
      const services = load();
      const cancel = deferred<void>();
      const text = jest.fn();
      const json = jest.fn();
      guardedFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        body: { cancel: cancel.read },
        text,
        json,
      });
      const pending = invoke(services.createMobileCloudAgentRunClient());
      const rejected = expect(pending).rejects.toMatchObject({
        name: 'StaleCloudAccountOperationError',
      });
      await cancel.started;
      services.accounts.activateCloudAccount('stream-account-b');
      cancel.resolve();
      await rejected;
      expect(text).not.toHaveBeenCalled();
      expect(json).not.toHaveBeenCalled();
    },
  );

  it('does not publish follow callbacks after delayed JSON parsing', async () => {
    const services = load();
    const body = deferred<unknown>();
    guardedFetchMock.mockResolvedValue({ ok: true, status: 200, json: body.read });
    const onEvent = jest.fn();
    const onSnapshot = jest.fn();
    const pending = services
      .createMobileCloudAgentRunClient()
      .followRun(RUN_ID, { onEvent, onSnapshot });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleCloudAccountOperationError',
    });
    await body.started;
    services.accounts.activateCloudAccount('stream-account-b');
    body.resolve(snapshot());
    await rejected;
    expect(onEvent).not.toHaveBeenCalled();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('stops follow after an awaited callback switches accounts', async () => {
    const services = load();
    guardedFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => snapshot() });
    const event = deferred<void>();
    const onSnapshot = jest.fn();
    const pending = services.createMobileCloudAgentRunClient().followRun(RUN_ID, {
      onEvent: event.read,
      onSnapshot,
    });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleCloudAccountOperationError',
    });
    await event.started;
    services.accounts.activateCloudAccount('stream-account-b');
    event.resolve();
    await rejected;
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('does not apply a refusal after delayed cloned response parsing', async () => {
    const services = load();
    const body = deferred<string>();
    guardedFetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      clone: () => ({ text: body.read }),
    });
    const pending = services.createMobileCloudAgentRunClient().cancelRun(RUN_ID);
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleCloudAccountOperationError',
    });
    await body.started;
    services.accounts.activateCloudAccount('stream-account-b');
    body.resolve('{"error":{"code":"account_unavailable"}}');
    await rejected;
    expect(refusalMock).not.toHaveBeenCalled();
  });
});
