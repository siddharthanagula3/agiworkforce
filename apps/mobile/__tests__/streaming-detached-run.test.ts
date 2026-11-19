import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import {
  MANAGED_CLOUD_AGENT_RUN_ID_HEADER,
  MANAGED_CLOUD_AGENT_RUN_URL_HEADER,
  MANAGED_CLOUD_TOOL_LOOP_DURABLE,
  MANAGED_CLOUD_TOOL_LOOP_HEADER,
  managedCloudAgentRunPath,
} from '@agiworkforce/cloud-contracts';
import type { StreamDelta } from '../services/streaming';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const MODEL = requireMobileCloudModel();
const RUN_ID = '0190a000-0000-7000-8000-0000000000e1';
const guardedFetchMock = jest.fn();
const tokenMock = jest.fn();
const consentMock = jest.fn();
const deviceHeadersMock = jest.fn();
const recoverMock = jest.fn();
const refusalMock = jest.fn();

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

function headers(values: Record<string, string>) {
  const lower = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

function frame(delta: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`;
}

function textEvent(sequence: number, delta: string) {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: 'session-1',
    turnId: 'turn-1',
    sequence,
    emittedAtMs: 1000 + sequence,
    event: { type: 'text-delta', delta },
  };
}

function detachedResponse(runHeaders: boolean) {
  return {
    ok: true,
    status: 200,
    body: null,
    headers: headers(
      runHeaders
        ? {
            [MANAGED_CLOUD_AGENT_RUN_ID_HEADER]: RUN_ID,
            [MANAGED_CLOUD_AGENT_RUN_URL_HEADER]: managedCloudAgentRunPath(RUN_ID),
            [MANAGED_CLOUD_TOOL_LOOP_HEADER]: MANAGED_CLOUD_TOOL_LOOP_DURABLE,
          }
        : {},
    ),
    text: async () =>
      frame({ content: 'Tulips ', x_agent_event: textEvent(0, 'Tulips ') }) +
      frame({ x_run_detached: { run_id: RUN_ID, reason: 'function_budget' } }) +
      'data: [DONE]\n\n',
  } as unknown as Response;
}

function journalPage() {
  return {
    ok: true,
    status: 200,
    headers: headers({}),
    json: async () => ({
      run: {
        id: RUN_ID,
        userId: 'stream-account-a',
        requestId: 'request-1',
        conversationId: 'conversation-1',
        originSurface: 'mobile',
        workMode: 'chat',
        state: 'completed',
        provider: MODEL.provider,
        model: MODEL.id,
        lastEventSequence: 1,
        cancellationRequestedAt: null,
        completedAt: '2026-11-14T12:00:00.000Z',
        createdAt: '2026-11-14T12:00:00.000Z',
        updatedAt: '2026-11-14T12:00:00.000Z',
      },
      nextAfterSequence: 1,
      events: [textEvent(1, 'need a cold winter.')],
    }),
  } as unknown as Response;
}

function send(services: ReturnType<typeof load>, calls: ReturnType<typeof callbacks>) {
  return services.streamChat(
    {
      model: MODEL.id,
      messages: [{ role: 'user', content: 'Why do tulips need cold?' }],
      stream: true,
      operationId: RUN_ID,
    },
    calls,
  );
}

function callbacks() {
  return {
    onDelta: jest.fn<void, [StreamDelta]>(),
    onDone: jest.fn(),
    onError: jest.fn(),
    onReconnecting: jest.fn(),
    onRunReference: jest.fn(),
  };
}

describe('a Cloud answer that outlives one connection', () => {
  it('follows the run journal after the detach frame and finishes in the same answer', async () => {
    const services = load();
    guardedFetchMock
      .mockResolvedValueOnce(detachedResponse(true))
      .mockResolvedValueOnce(journalPage());
    const calls = callbacks();

    await send(services, calls);

    expect(guardedFetchMock).toHaveBeenCalledTimes(2);
    expect(String(guardedFetchMock.mock.calls[1]![0])).toContain(
      `${managedCloudAgentRunPath(RUN_ID)}?after=0`,
    );
    const text = calls.onDelta.mock.calls.map(([delta]) => delta.content ?? '').join('');
    expect(text).toBe('Tulips need a cold winter.');
    expect(calls.onDelta.mock.calls.at(-1)![0]).toMatchObject({ durableReplay: true });
    expect(calls.onDone).toHaveBeenCalledTimes(1);
    expect(calls.onError).not.toHaveBeenCalled();
    expect(calls.onReconnecting).not.toHaveBeenCalled();
  });

  it('says the answer ended early when there is no run to follow', async () => {
    const services = load();
    guardedFetchMock.mockResolvedValueOnce(detachedResponse(false));
    const calls = callbacks();

    await send(services, calls);

    expect(calls.onDone).not.toHaveBeenCalled();
    expect(calls.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'The response ended before completion. Please retry.' }),
    );
  });
});
