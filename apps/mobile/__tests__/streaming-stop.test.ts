import {
  MANAGED_CLOUD_AGENT_RUN_ID_HEADER,
  MANAGED_CLOUD_AGENT_RUN_URL_HEADER,
  MANAGED_CLOUD_TOOL_LOOP_DURABLE,
  MANAGED_CLOUD_TOOL_LOOP_HEADER,
  managedCloudAgentRunPath,
} from '@agiworkforce/cloud-contracts';
import type { StreamDelta } from '../services/streaming';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

type CloudAccountSessionModule = typeof import('../src/features/auth/services/cloudAccountSession');

const MODEL = requireMobileCloudModel();
const RUN_ID = '0190a000-0000-7000-8000-0000000000f1';
const guardedFetchMock = jest.fn();

function load() {
  jest.resetModules();
  guardedFetchMock.mockReset();
  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000, STREAM_STALL: 30_000 },
  }));
  jest.doMock('@/lib/egressGuard', () => ({ guardedFetch: guardedFetchMock }));
  jest.doMock('../services/authSession', () => ({
    getAuthToken: jest.fn().mockResolvedValue('stop-token'),
  }));
  jest.doMock('../services/llmGate', () => ({
    ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
    ensureLlmGateOpen: jest.fn(),
  }));
  jest.doMock('../services/remoteChatGate', () => ({ assertRemoteChatAllowed: jest.fn() }));
  jest.doMock('@/src/features/waitlist/store', () => ({
    useWaitlistStore: { getState: () => ({ cloudUnlocked: true }) },
  }));
  jest.doMock('@/src/features/integrations/services/phoneDeviceHost', () => ({
    phoneDeviceHostHeaders: jest.fn().mockResolvedValue({}),
  }));
  jest.doMock('../services/api', () => ({
    ApiPaywallError: class ApiPaywallError extends Error {},
    recoverStreamSession: jest.fn().mockResolvedValue(true),
    streamAuthRefusal: jest.fn().mockReturnValue(null),
  }));
  jest.doMock('@/src/features/model-picker/service', () => ({
    ...jest.requireActual('@/src/features/model-picker/service'),
    isFreeQuotaTurnModelId: () => true,
  }));
  jest
    .requireActual<CloudAccountSessionModule>('../src/features/auth/services/cloudAccountSession')
    .activateCloudAccount('stop-account');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../services/streaming') as typeof import('../services/streaming');
}

afterEach(() => {
  for (const path of [
    '@/lib/constants',
    '@/lib/egressGuard',
    '../services/authSession',
    '../services/llmGate',
    '../services/remoteChatGate',
    '@/src/features/waitlist/store',
    '@/src/features/integrations/services/phoneDeviceHost',
    '../services/api',
    '@/src/features/model-picker/service',
  ])
    jest.dontMock(path);
});

function headers(values: Record<string, string>) {
  const lower = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

function frame(delta: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`;
}

function stoppedBeforeTheDetach(stop: () => void): Response {
  return {
    ok: true,
    status: 200,
    body: null,
    headers: headers({
      [MANAGED_CLOUD_AGENT_RUN_ID_HEADER]: RUN_ID,
      [MANAGED_CLOUD_AGENT_RUN_URL_HEADER]: managedCloudAgentRunPath(RUN_ID),
      [MANAGED_CLOUD_TOOL_LOOP_HEADER]: MANAGED_CLOUD_TOOL_LOOP_DURABLE,
    }),
    text: async () => {
      stop();
      return (
        frame({ content: 'Canals ' }) +
        frame({ x_run_detached: { run_id: RUN_ID, reason: 'function_budget' } }) +
        'data: [DONE]\n\n'
      );
    },
  } as unknown as Response;
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

describe('a stream the person stopped', () => {
  it('is never followed through the run journal', async () => {
    const streaming = load();
    const controller = new AbortController();
    guardedFetchMock.mockResolvedValueOnce(stoppedBeforeTheDetach(() => controller.abort()));
    const calls = callbacks();

    await streaming.streamChat(
      {
        model: MODEL.id,
        messages: [{ role: 'user', content: 'Write about canals.' }],
        stream: true,
        operationId: RUN_ID,
      },
      calls,
      controller.signal,
    );

    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
    expect(calls.onDelta).not.toHaveBeenCalled();
    expect(calls.onReconnecting).not.toHaveBeenCalled();
    expect(calls.onDone).not.toHaveBeenCalled();
    expect(calls.onError).not.toHaveBeenCalled();
  });

  it('reports no ending after the tap on the Free route either', async () => {
    const streaming = load();
    const controller = new AbortController();
    guardedFetchMock.mockResolvedValueOnce(stoppedBeforeTheDetach(() => controller.abort()));
    const calls = callbacks();

    await streaming.streamChat(
      {
        model: MODEL.id,
        conversation_id: 'conversation-1',
        assistant_message_id: RUN_ID,
        operationId: RUN_ID,
        messages: [{ role: 'user', content: 'Write about canals.' }],
      },
      calls,
      controller.signal,
    );

    expect(guardedFetchMock).toHaveBeenCalledTimes(1);
    expect(calls.onDelta).not.toHaveBeenCalled();
    expect(calls.onDone).not.toHaveBeenCalled();
    expect(calls.onError).not.toHaveBeenCalled();
  });
});
